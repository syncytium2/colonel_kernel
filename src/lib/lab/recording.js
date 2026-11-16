// LAB-ONLY (ADR-0053). The lab recording file: reader, checker and writer.
//
// One JSON file per imaging recording, `<slice_id>.klab.json`, carrying what the public
// workbook contract (ADR-0019) deliberately does not: RAW fluorescence. The contract a
// producer writes against is docs/lab-recording-contract.md; this module is its reference
// implementation, and `scripts/lab-validate.mjs` runs it from the command line.
//
// Works in the browser and in Node (both have atob/btoa and crypto.subtle).

export const LAB_FORMAT = 'colonel-lab-recording';
export const LAB_VERSION = 1;

const DTYPES = {
  float32: { bytes: 4, make: (buf) => new Float32Array(buf) },
  float64: { bytes: 8, make: (buf) => new Float64Array(buf) },
};

// Typed arrays here are read as the platform's byte order; the file is little-endian.
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decode one array object `{dtype, shape, b64, sha256?}`.
 * Refuses an unknown dtype, a byte count that disagrees with the shape, or a hash that
 * disagrees with the bytes.
 */
async function decodeArray(obj, where) {
  if (!obj || typeof obj !== 'object') throw new Error(`${where}: missing`);
  const spec = DTYPES[obj.dtype];
  if (!spec) throw new Error(`${where}: dtype '${obj.dtype}' is not float32 or float64`);
  if (!Array.isArray(obj.shape) || !obj.shape.every((v) => Number.isInteger(v) && v >= 0)) {
    throw new Error(`${where}: shape must be a list of whole numbers`);
  }
  if (typeof obj.b64 !== 'string') throw new Error(`${where}: b64 missing`);
  const bytes = b64ToBytes(obj.b64);
  const count = obj.shape.reduce((p, v) => p * v, 1);
  if (bytes.length !== count * spec.bytes) {
    throw new Error(
      `${where}: ${bytes.length} bytes, but shape [${obj.shape}] of ${obj.dtype} needs ${count * spec.bytes}`,
    );
  }
  let hashChecked = false;
  if (obj.sha256 != null) {
    const got = await sha256Hex(bytes);
    if (got !== String(obj.sha256).toLowerCase()) {
      throw new Error(`${where}: sha256 does not match the bytes (file ${obj.sha256}, computed ${got})`);
    }
    hashChecked = true;
  }
  return { data: spec.make(bytes.buffer), shape: obj.shape, hashChecked };
}

/** Encode a typed array as an array object, with its hash. */
export async function encodeArray(typed, shape) {
  const dtype = typed instanceof Float32Array ? 'float32' : typed instanceof Float64Array ? 'float64' : null;
  if (!dtype) throw new Error('encodeArray: Float32Array or Float64Array only');
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  return { dtype, shape: shape ?? [typed.length], b64: bytesToB64(bytes), sha256: await sha256Hex(bytes) };
}

/**
 * @typedef {Object} LabRecording
 * @property {string} sliceId
 * @property {(string|null)} cohort
 * @property {number} dt declared sample interval (s)
 * @property {number} nFrames
 * @property {number} nRoi
 * @property {Float64Array} time frame times (s, imaging clock)
 * @property {{label:string}[]} rois in column order
 * @property {(number|null)} targetIndex 0-based column of the loose-patch cell, or null
 * @property {Object<string, Float32Array|Float64Array>} traces column-major, nFrames x nRoi each
 * @property {(Float64Array|null)} spikeTimes seconds on the imaging clock; null = no spike file
 * @property {object} spikes the file's `spikes` object without the array (provenance)
 * @property {{name:string, startS:number, endS:number}[]} regions
 * @property {{startS:number, endS:number, reason:string}[]} exclusions
 * @property {object} production the producer's stated F0 and penumbra parameters
 * @property {(object|null)} truth simulation only: the planted kernel
 * @property {object} provenance
 * @property {string[]} warnings
 */

/**
 * Parse and check a lab recording. Throws on anything a reader must not accept.
 * @param {string|object} input the file's text, or the parsed object
 * @returns {Promise<LabRecording>}
 */
export async function parseLabRecording(input) {
  if (!LITTLE_ENDIAN) throw new Error('lab recording: this reader needs a little-endian machine');
  const j = typeof input === 'string' ? JSON.parse(input) : input;
  if (j.format !== LAB_FORMAT) throw new Error(`not a lab recording: format is '${j.format}'`);
  if (j.version !== LAB_VERSION) throw new Error(`lab recording version ${j.version}; this reader takes ${LAB_VERSION}`);
  if (typeof j.slice_id !== 'string' || !j.slice_id) throw new Error('slice_id missing');
  if (!(j.dt_nominal_s > 0)) throw new Error('dt_nominal_s must be a positive number');
  const nFrames = j.n_frames;
  const nRoi = j.n_roi;
  if (!Number.isInteger(nFrames) || nFrames < 2) throw new Error('n_frames must be a whole number of at least 2');
  if (!Number.isInteger(nRoi) || nRoi < 1) throw new Error('n_roi must be a whole number of at least 1');
  const warnings = [];
  let unhashed = 0;

  const time = await decodeArray(j.time, 'time');
  if (!time.hashChecked) unhashed++;
  if (!(time.data instanceof Float64Array)) throw new Error('time: must be float64');
  if (time.data.length !== nFrames) throw new Error(`time: ${time.data.length} values, n_frames is ${nFrames}`);
  for (let i = 1; i < nFrames; i++) {
    if (!(time.data[i] > time.data[i - 1])) throw new Error(`time: not strictly increasing at frame ${i + 1}`);
  }
  const meanDt = (time.data[nFrames - 1] - time.data[0]) / (nFrames - 1);
  if (Math.abs(meanDt - j.dt_nominal_s) > 0.01 * j.dt_nominal_s) {
    throw new Error(`time: mean frame interval ${meanDt} s is more than 1% from dt_nominal_s ${j.dt_nominal_s}`);
  }

  if (!Array.isArray(j.rois) || j.rois.length !== nRoi) throw new Error(`rois: need ${nRoi} entries`);
  const rois = j.rois.map((r, i) => ({ label: String(r?.label ?? `roi${i + 1}`) }));

  let targetIndex = null;
  if (j.target_roi != null) {
    if (!Number.isInteger(j.target_roi) || j.target_roi < 1 || j.target_roi > nRoi) {
      throw new Error(`target_roi ${j.target_roi} is not a 1-based column from 1 to ${nRoi}`);
    }
    targetIndex = j.target_roi - 1;
  } else {
    warnings.push('target_roi is null: the file does not say which ROI is the loose-patch cell');
  }

  if (!j.traces || !j.traces.raw_soma) throw new Error('traces.raw_soma missing');
  const traces = {};
  for (const [name, obj] of Object.entries(j.traces)) {
    if (obj == null) continue;
    if (obj.order !== 'column-major') throw new Error(`traces.${name}: order must be 'column-major'`);
    const a = await decodeArray(obj, `traces.${name}`);
    if (!a.hashChecked) unhashed++;
    if (a.shape.length !== 2 || a.shape[0] !== nFrames || a.shape[1] !== nRoi) {
      throw new Error(`traces.${name}: shape [${a.shape}] is not [${nFrames}, ${nRoi}]`);
    }
    traces[name] = a.data;
  }
  if (!traces.raw_pen) warnings.push('no traces.raw_pen: penumbra variants are not available');

  let spikeTimes = null;
  let spikes = { present: false };
  if (j.spikes != null) {
    const { times, ...rest } = j.spikes;
    if (j.spikes.units !== 's') throw new Error(`spikes.units is '${j.spikes.units}', must be 's'`);
    if (j.spikes.clock !== 'imaging') {
      throw new Error(`spikes.clock is '${j.spikes.clock}', must be 'imaging' (t = 0 is the first imaging frame's clock)`);
    }
    const a = await decodeArray(times, 'spikes.times');
    if (!a.hashChecked) unhashed++;
    if (!(a.data instanceof Float64Array)) throw new Error('spikes.times: must be float64');
    if (j.spikes.n !== a.data.length) throw new Error(`spikes.n is ${j.spikes.n}, the array holds ${a.data.length}`);
    for (let i = 0; i < a.data.length; i++) {
      if (!Number.isFinite(a.data[i])) throw new Error(`spikes.times: value ${i + 1} is not finite`);
      if (i && a.data[i] < a.data[i - 1]) throw new Error(`spikes.times: not ascending at value ${i + 1}`);
    }
    spikeTimes = a.data;
    spikes = { present: true, ...rest };
    if (rest.source?.reviewed !== true) {
      warnings.push(`spikes not reviewed by a person (source.reviewed is ${JSON.stringify(rest.source?.reviewed ?? null)})`);
    }
  } else {
    warnings.push('spikes is null: no spike file was paired with this recording');
  }

  const span = (list, where, extra) =>
    (Array.isArray(list) ? list : []).map((r, i) => {
      if (!(Number.isFinite(r.start_s) && Number.isFinite(r.end_s) && r.end_s > r.start_s)) {
        throw new Error(`${where}[${i}]: start_s and end_s must be finite, with end after start`);
      }
      return { startS: r.start_s, endS: r.end_s, ...extra(r) };
    });
  const regions = span(j.regions, 'regions', (r) => ({ name: String(r.name ?? '') }));
  regions.sort((a, b) => a.startS - b.startS);
  for (let i = 1; i < regions.length; i++) {
    if (regions[i].startS < regions[i - 1].endS) {
      throw new Error(`regions '${regions[i - 1].name}' and '${regions[i].name}' overlap`);
    }
  }
  const exclusions = span(j.exclusions, 'exclusions', (r) => ({ reason: String(r.reason ?? '') }));

  let truth = null;
  if (j.truth?.kernel) {
    const k = await decodeArray(j.truth.kernel.samples, 'truth.kernel.samples');
    truth = { kernel: { samples: Float64Array.from(k.data), zeroIndex: j.truth.kernel.zero_index, dt: j.truth.kernel.dt_s }, note: j.truth.note ?? '' };
    warnings.push('SIMULATED recording: it carries a planted kernel');
  }
  if (unhashed) warnings.push(`${unhashed} array(s) carry no sha256, so their bytes were not checked`);

  return {
    sliceId: j.slice_id,
    cohort: j.cohort ?? null,
    dt: j.dt_nominal_s,
    nFrames,
    nRoi,
    time: time.data,
    rois,
    targetIndex,
    traces,
    spikeTimes,
    spikes,
    regions,
    exclusions,
    production: j.production ?? {},
    truth,
    provenance: j.provenance ?? {},
    warnings,
  };
}

/** One ROI's column of a column-major nFrames x nRoi trace matrix (a view, not a copy). */
export function roiColumn(matrix, nFrames, roiIndex) {
  return matrix.subarray(roiIndex * nFrames, (roiIndex + 1) * nFrames);
}
