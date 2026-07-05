// xlsx ingestion (ADR-0019): read one 3-sheet workbook per recording into the
// internal structure the app runs on, and window each region to its spikes at
// analysis time (ADR-0019 §4). The xlsx sibling of load-csv.js — both converge on
// the same per-region shape ({ grid, spikeTimes, rois, meta, warnings }) so every
// downstream consumer (recoverKernel, sta, the readout) is path-agnostic.
//
// CODE-SPLIT (FOUNDATIONS §6): this module statically imports SheetJS, so it is
// kept OUT of core/index.js. The app must reach it via dynamic import
// (`await import('./core/load-xlsx.js')`) so SheetJS lands in its own chunk and the
// teaching tabs / CSV path pay zero added bundle weight. SheetJS is bundled (npm
// dependency), never fetched from a CDN — no network egress.
//
// Workbook schema (ADR-0019):
//   trace     sheet: header `time, roi1..roiN`, whole untrimmed recording, one row
//                    per frame. `time` zero-based (ADR-0019), strictly increasing;
//                    dt derived (ADR-0012). NaN permitted in roi cells. The FIRST
//                    roi column positionally = the targeted cell (FOUNDATIONS §4),
//                    regardless of its header name.
//   spikes    sheet: single column header `spikes`, whole train, length independent
//                    of frame count; NaN-strip then sort ascending.
//   metadata  sheet (OPTIONAL): region definitions `region, start_s, end_s`
//                    (reserved `buffer_s` honored if present). Disjoint; overlap is
//                    a HARD ERROR. end_s may exceed tEnd and is NOT clamped on read
//                    (ADR-0020).
//
// Machinery is gated (FOUNDATIONS §3): missing `trace`/`spikes` sheet, a malformed
// time column, no roi columns, or overlapping regions are hard errors. Fit-quality
// and per-region spike sufficiency are reported, never gated here.

import * as XLSX from 'xlsx';
import { gridFromTimeColumn } from './timebase.js';

const DEFAULT_BUFFER_S = 1.0; // ADR-0019 §4 default analysis buffer (seconds)

// ── Region protocol windowing (ADR-0035; bus contract v1.1) ────────────────────
// The recording carries RAW region markers [start_s, end_s] (bus contract: no
// solution_delay/cap baked in). The APP derives the analysis window per region
// TYPE, from the region NAME, before spike-bracketing:
//   • baseline  — last REGION_MAX of the period, anchored at the END (nearest the
//                 transition): [end − REGION_MAX, end]; ≥ REGION_MIN or flagged.
//   • treatment — wash-in delayed start (+SOLUTION_DELAY), then up to REGION_MAX:
//                 [start + SOLUTION_DELAY, min(end, start + SOLUTION_DELAY + REGION_MAX)];
//                 ≥ REGION_MIN or flagged; shorter than the delay → non-analyzable.
//   • hiK       — the ENTIRE period, raw (high-K⁺ acts fast; no delay, no cap).
//   • full      — the synthetic "(full recording)"/"whole" default region, raw.
// Flags never DROP a region (FOUNDATIONS no-AP/too-few-spikes posture: report,
// don't throw). The three numbers are the cross-team-agreed DEFAULTS (bus contract
// v1.1) but are user-adjustable in the UI — passed through to regionAnalysisWindow.
export const SOLUTION_DELAY_S = 120; // treatment wash-in trim (2 min)
export const REGION_MAX_S = 1200; // analysis-window cap, baseline + treatment (20 min)
export const REGION_MIN_S = 720; // duration floor → flag, never drop (12 min)

/**
 * Classify a region into a protocol windowing type from its name.
 * 'baseline' | 'treatment' | 'hik' | 'full'. Unrecognized names → 'treatment'
 * (every non-baseline, non-hiK solution switch — SB222200, wash, … — washes in).
 * @param {string} name
 * @returns {'baseline'|'treatment'|'hik'|'full'}
 */
export function regionType(name) {
  const norm = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm === 'fullrecording' || norm === 'whole') return 'full';
  if (norm.includes('baseline')) return 'baseline';
  if (norm.includes('highk') || norm.includes('hik')) return 'hik';
  return 'treatment';
}

/**
 * Protocol analysis window for one region (ADR-0035), from its RAW [startS,endS]
 * markers + name. Pure; applied BEFORE spike-bracketing. Never drops a region —
 * a duration below REGION_MIN is FLAGGED (kept); only a treatment whose period is
 * shorter than SOLUTION_DELAY comes back non-analyzable (no window survives).
 * @param {{name:string, startS:number, endS:number}} region
 * @param {{solutionDelayS?:number, regionMinS?:number, regionMaxS?:number}} [opts]
 *   user-adjustable protocol values; default to the bus-contract-v1.1 constants.
 * @returns {{type:string, winStart:number, winEnd:number, flags:string[], analyzable:boolean, reason:(string|null)}}
 */
export function regionAnalysisWindow(region, opts = {}) {
  const solutionDelayS = Number.isFinite(opts.solutionDelayS) ? Number(opts.solutionDelayS) : SOLUTION_DELAY_S;
  const regionMinS = Number.isFinite(opts.regionMinS) ? Number(opts.regionMinS) : REGION_MIN_S;
  const regionMaxS = Number.isFinite(opts.regionMaxS) ? Number(opts.regionMaxS) : REGION_MAX_S;
  const type = regionType(region.name);
  const rawStart = region.startS;
  const rawEnd = region.endS;
  /** @type {string[]} */
  const flags = [];

  if (type === 'full' || type === 'hik') {
    return { type, winStart: rawStart, winEnd: rawEnd, flags, analyzable: true, reason: null };
  }

  if (type === 'baseline') {
    const winEnd = rawEnd;
    const winStart = Math.max(rawStart, rawEnd - regionMaxS);
    if (winEnd - winStart < regionMinS) {
      flags.push(`baseline shorter than ${(regionMinS / 60).toFixed(0)} min (${((winEnd - winStart) / 60).toFixed(1)} min)`);
    }
    return { type, winStart, winEnd, flags, analyzable: true, reason: null };
  }

  // treatment: wash-in delay, then up to regionMax from the delayed start
  const winStart = rawStart + solutionDelayS;
  if (winStart >= rawEnd) {
    return {
      type,
      winStart,
      winEnd: winStart,
      flags,
      analyzable: false,
      reason: `region '${region.name}' is shorter than the ${(solutionDelayS / 60).toFixed(1)}-min solution delay`,
    };
  }
  const winEnd = Math.min(rawEnd, winStart + regionMaxS);
  if (winEnd - winStart < regionMinS) {
    flags.push(`treatment shorter than ${(regionMinS / 60).toFixed(0)} min after delay (${((winEnd - winStart) / 60).toFixed(1)} min)`);
  }
  return { type, winStart, winEnd, flags, analyzable: true, reason: null };
}

/** Parse a numeric cell; blank / null / non-numeric → NaN. */
function toNum(v) {
  if (v == null || v === '') return NaN;
  return typeof v === 'number' ? v : Number(String(v).trim());
}

/** Find a sheet by case-insensitive, trimmed name (ADR-0019). */
function findSheet(wb, name) {
  const target = name.trim().toLowerCase();
  const hit = wb.SheetNames.find((n) => n.trim().toLowerCase() === target);
  return hit ? wb.Sheets[hit] : null;
}

/** Read a sheet as an array-of-arrays, numbers raw, blank rows dropped. */
function sheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
}

/**
 * @typedef {Object} LoadedRecording
 * @property {import('./timebase.js').Grid} grid  whole-recording grid (from the time column)
 * @property {Float64Array} spikeTimes  finite spike times (s), ascending, whole train
 * @property {{id:string, samples:Float64Array}[]} rois  one per roi column, file order (rois[0] = targeted)
 * @property {{name:string, startS:number, endS:number, bufferS:(number|null)}[]} regions  metadata regions, sorted, disjoint
 * @property {{source:(string|null), nFrames:number, nROIs:number, nSpikes:number, dt:number, t0:number, tEnd:number}} meta
 * @property {string[]} warnings  non-fatal notes (representation / fit, never machinery)
 */

/**
 * Read one ADR-0019 workbook into a LoadedRecording.
 * @param {ArrayBuffer|Uint8Array|number[]} input  raw .xlsx bytes
 * @param {{source?:string|null}} [opts]
 * @returns {LoadedRecording}
 */
export function loadWorkbook(input, { source = null } = {}) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wb = XLSX.read(u8, { type: 'array' });
  const warnings = [];

  // --- trace sheet (required) ---
  const traceWS = findSheet(wb, 'trace');
  if (!traceWS) throw new Error("xlsx workbook missing required 'trace' sheet");
  const traceAoA = sheetRows(traceWS);
  if (traceAoA.length < 1) throw new Error("xlsx 'trace' sheet is empty");
  const header = traceAoA[0].map((h) => String(h ?? '').trim());
  const timeIdx = header.findIndex((h) => h.toLowerCase() === 'time');
  if (timeIdx < 0) throw new Error("xlsx 'trace' sheet missing 'time' column");
  const roiCols = header.map((h, i) => ({ id: h, i })).filter(({ i }) => i !== timeIdx);
  if (roiCols.length === 0) throw new Error("xlsx 'trace' sheet has no roi (trace) columns");

  const dataRows = traceAoA.slice(1);
  const nRows = dataRows.length;
  if (nRows < 2) throw new Error(`xlsx 'trace' needs at least 2 data rows (got ${nRows})`);

  // time: machinery-gated (finite, strictly increasing)
  const time = new Float64Array(nRows);
  for (let i = 0; i < nRows; i++) {
    const t = toNum(dataRows[i][timeIdx]);
    if (!Number.isFinite(t)) throw new Error(`non-finite time at trace data row ${i + 1}`);
    if (i > 0 && t <= time[i - 1]) {
      throw new Error(`time must be strictly increasing (trace row ${i + 1}: ${t} ≤ ${time[i - 1]})`);
    }
    time[i] = t;
  }
  const grid = gridFromTimeColumn(time); // dt = mean(diff), times authoritative (ADR-0012)

  // roi traces: dense, NaN allowed; rois[0] = first roi column positionally (targeted)
  const rois = roiCols.map(({ id, i }) => {
    const samples = new Float64Array(nRows);
    for (let r = 0; r < nRows; r++) samples[r] = toNum(dataRows[r][i]);
    return { id, samples };
  });

  // --- spikes sheet (required) ---
  const spikesWS = findSheet(wb, 'spikes');
  if (!spikesWS) throw new Error("xlsx workbook missing required 'spikes' sheet");
  const spikesAoA = sheetRows(spikesWS);
  const spHeader = String(spikesAoA[0]?.[0] ?? '').trim().toLowerCase();
  if (spHeader !== 'spikes') throw new Error("xlsx 'spikes' sheet must have header 'spikes'");
  const spikes = [];
  for (let i = 1; i < spikesAoA.length; i++) {
    const v = toNum(spikesAoA[i]?.[0]);
    if (Number.isFinite(v)) spikes.push(v);
  }
  spikes.sort((a, b) => a - b);
  const spikeTimes = Float64Array.from(spikes);

  // --- metadata sheet (optional) ---
  const regions = [];
  const metaWS = findSheet(wb, 'metadata');
  if (metaWS) {
    const mAoA = sheetRows(metaWS);
    if (mAoA.length >= 1) {
      const mHeader = mAoA[0].map((h) => String(h ?? '').trim().toLowerCase());
      const ri = mHeader.indexOf('region');
      const si = mHeader.indexOf('start_s');
      const ei = mHeader.indexOf('end_s');
      const bi = mHeader.indexOf('buffer_s'); // reserved override (ADR-0019)
      if (ri < 0 || si < 0 || ei < 0) {
        throw new Error("xlsx 'metadata' sheet must have columns region, start_s, end_s");
      }
      for (let r = 1; r < mAoA.length; r++) {
        const row = mAoA[r];
        const name = String(row[ri] ?? '').trim() || `region${r}`;
        const startS = toNum(row[si]);
        const endS = toNum(row[ei]);
        // representation (not machinery): skip-with-warning, never throw (ADR-0019 reader rule)
        if (!Number.isFinite(startS) || !Number.isFinite(endS) || startS >= endS) {
          warnings.push(`metadata region '${name}' skipped: invalid bounds (start_s=${row[si]}, end_s=${row[ei]})`);
          continue;
        }
        // ADR-0020: end_s may exceed tEnd — emitted raw, NOT clamped on read.
        const bufferS = bi >= 0 && Number.isFinite(toNum(row[bi])) ? toNum(row[bi]) : null;
        regions.push({ name, startS, endS, bufferS });
      }
      regions.sort((a, b) => a.startS - b.startS);
      // disjoint invariant — overlap is a HARD ERROR (ADR-0019). Touching (== ) is allowed.
      for (let i = 1; i < regions.length; i++) {
        if (regions[i].startS < regions[i - 1].endS) {
          throw new Error(
            `metadata regions overlap: '${regions[i - 1].name}' [${regions[i - 1].startS}, ${regions[i - 1].endS}]` +
              ` and '${regions[i].name}' [${regions[i].startS}, ${regions[i].endS}]`,
          );
        }
      }
    }
  }

  // --- non-fatal warnings (representation / fit, never machinery) ---
  const t0 = time[0];
  const tEnd = time[nRows - 1];
  const outOfRange = spikeTimes.reduce((n, t) => n + (t < t0 || t > tEnd ? 1 : 0), 0);
  if (outOfRange > 0) warnings.push(`${outOfRange} spike(s) fall outside the recording window [${t0}, ${tEnd}]`);
  const nanRois = rois.filter((r) => r.samples.some((v) => !Number.isFinite(v))).map((r) => r.id);
  if (nanRois.length > 0) warnings.push(`roi column(s) with non-finite samples: ${nanRois.join(', ')}`);
  if (!metaWS) warnings.push('no metadata sheet — the full recording is analyzed as one default region (ADR-0019 §3)');

  return {
    grid,
    spikeTimes,
    rois,
    regions,
    meta: { source, nFrames: nRows, nROIs: rois.length, nSpikes: spikeTimes.length, dt: grid.dt, t0, tEnd },
    warnings,
  };
}

/**
 * The regions to analyze for a recording. Metadata regions if present; otherwise a
 * single implicit default region spanning the full trace (ADR-0019 §3) — which
 * `windowRegion` then brackets to its spikes exactly as a named region.
 * @param {LoadedRecording} recording
 * @returns {{name:string, startS:number, endS:number, bufferS:(number|null)}[]}
 */
export function regionsOf(recording) {
  if (recording.regions && recording.regions.length) return recording.regions;
  return [{ name: '(full recording)', startS: recording.meta.t0, endS: recording.meta.tEnd, bufferS: null }];
}

/**
 * Adapt an analyzable `RegionView` into the same `{grid, spikeTimes, rois, meta,
 * warnings}` shape `loadCsv` returns, so the xlsx path feeds the existing readout
 * with no change to it (both ingest paths converge here). The windowed grid's first
 * / last `times` define `meta.t0` / `meta.tEnd`.
 * @param {RegionView} rv  an analyzable region (throws if not)
 * @param {{source?:string|null}} [opts]
 * @returns {import('./load-csv.js').LoadedRegion}
 */
export function regionViewToLoadedRegion(rv, { source = null } = {}) {
  if (!rv.analyzable) throw new Error(`region '${rv.name}' not analyzable: ${rv.reason}`);
  const n = rv.grid.n;
  return {
    grid: rv.grid,
    spikeTimes: rv.spikeTimes,
    rois: rv.rois,
    meta: {
      source,
      nFrames: n,
      nROIs: rv.rois.length,
      nSpikes: rv.spikeTimes.length,
      dt: rv.grid.dt,
      t0: rv.grid.times[0],
      tEnd: rv.grid.times[n - 1],
    },
    warnings: rv.warnings,
  };
}

/**
 * @typedef {Object} RegionView
 * @property {string} name
 * @property {number} startS  region marker start (s)
 * @property {number} endS    region marker end (s) — may exceed tEnd (ADR-0020)
 * @property {boolean} analyzable
 * @property {(string|null)} reason  when !analyzable, the ADR-0019 §7 surfaced text
 * @property {number} spikeCount  spikes in [startS, endS] (reported, ADR-0019 §7)
 * @property {number} spikeRateHz  over the in-trace region span (reported)
 * @property {Float64Array} spikeTimes  region spikes (analysis input when analyzable)
 * @property {(import('./timebase.js').Grid|null)} grid  windowed grid (null if !analyzable)
 * @property {({id:string, samples:Float64Array}[]|null)} rois  windowed traces (null if !analyzable)
 * @property {(object|undefined)} window  { startIdx, endIdx, startS, endS, bufferS, bufferSamples }
 * @property {string[]} warnings
 */

/**
 * Window one region to its spikes at analysis time (ADR-0019 §4):
 *   1) select spikes in [startS, endS];
 *   2) bracket the trace to [firstSpike − buffer … lastSpike + buffer], buffer
 *      dt-derived (round(buffer/dt) samples), clamped to available samples.
 * The window is bracketed to SPIKES, never to the markers — an overhanging end_s
 * (ADR-0020) never enlarges the window. Clamping here is window-to-data, distinct
 * from the marker clamp ADR-0020 forbids.
 *
 * No-spikes / single-spike regions are REPORTED, not thrown (ADR-0019 §7): the
 * workbook still reads, and the region comes back analyzable:false with a reason.
 *
 * @param {LoadedRecording} recording
 * @param {{name:string, startS:number, endS:number, bufferS?:(number|null)}} region
 * @param {{buffer?:number, protocol?:boolean}} [opts]  default buffer (s) when the
 *   region has no override; `protocol` (default false) applies the ADR-0035 region
 *   type-window (baseline/treatment/hiK) before spike-bracketing.
 * @returns {RegionView}
 */
export function windowRegion(recording, region, { buffer = DEFAULT_BUFFER_S, protocol = false, solutionDelayS, regionMinS, regionMaxS } = {}) {
  const { grid, spikeTimes, rois, meta } = recording;
  const { dt, t0, tEnd } = meta;
  const { name } = region;

  // (0) ADR-0035: derive the protocol analysis window from the region TYPE (name)
  // before selecting spikes. Off by default (raw markers); Tab 2's real named
  // regions opt in. A treatment shorter than the solution delay yields no window.
  let startS = region.startS;
  let endS = region.endS;
  let protoType = null;
  /** @type {string[]} */
  const protoFlags = [];
  if (protocol) {
    const pw = regionAnalysisWindow(region, { solutionDelayS, regionMinS, regionMaxS });
    protoType = pw.type;
    if (!pw.analyzable) {
      return {
        name,
        startS,
        endS,
        analyzable: false,
        reason: pw.reason,
        spikeCount: 0,
        spikeRateHz: 0,
        spikeTimes: new Float64Array(0),
        grid: null,
        rois: null,
        window: undefined,
        warnings: [],
      };
    }
    startS = pw.winStart;
    endS = pw.winEnd;
    protoFlags.push(...pw.flags);
  }

  // (1) select region spikes
  const sel = [];
  for (let i = 0; i < spikeTimes.length; i++) {
    const t = spikeTimes[i];
    if (t >= startS && t <= endS) sel.push(t);
  }
  const spikeCount = sel.length;
  const span = Math.min(endS, tEnd) - Math.max(startS, t0);
  const spikeRateHz = span > 0 ? spikeCount / span : 0;
  const selArr = Float64Array.from(sel);

  // ADR-0019 §7: 0 or 1 spike is degenerate (bracketing undefined) — report, don't throw.
  if (spikeCount < 2) {
    return {
      name,
      startS,
      endS,
      analyzable: false,
      reason: `region '${name}' has too few spikes to analyze (${spikeCount} ${spikeCount === 1 ? 'spike' : 'spikes'})`,
      spikeCount,
      spikeRateHz,
      spikeTimes: selArr,
      grid: null,
      rois: null,
      window: undefined,
      warnings: [...protoFlags],
    };
  }

  // (2) bracket to spikes, dt-derived buffer, clamp window to available samples
  const bufS = Number.isFinite(region.bufferS) ? region.bufferS : buffer;
  const bufferSamples = Math.round(bufS / dt);
  const firstIdx = Math.round((sel[0] - t0) / dt);
  const lastIdx = Math.round((sel[spikeCount - 1] - t0) / dt);
  const rawStart = firstIdx - bufferSamples;
  const rawEnd = lastIdx + bufferSamples;
  const startIdx = Math.max(0, Math.min(grid.n - 1, rawStart));
  const endIdx = Math.max(0, Math.min(grid.n - 1, rawEnd));

  const warnings = [...protoFlags];
  if (rawStart < 0) warnings.push(`window start clamped to recording start (region '${name}')`);
  if (rawEnd > grid.n - 1) warnings.push(`window end clamped to recording end (region '${name}')`);

  const wTimes = grid.times.slice(startIdx, endIdx + 1);
  const wGrid = gridFromTimeColumn(wTimes);
  const wRois = rois.map((r) => ({ id: r.id, samples: r.samples.slice(startIdx, endIdx + 1) }));

  return {
    name,
    startS,
    endS,
    analyzable: true,
    reason: null,
    spikeCount,
    spikeRateHz,
    spikeTimes: selArr,
    grid: wGrid,
    rois: wRois,
    window: { startIdx, endIdx, startS: wTimes[0], endS: wTimes[wTimes.length - 1], bufferS: bufS, bufferSamples, type: protoType },
    warnings,
  };
}
