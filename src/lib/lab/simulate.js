// LAB-ONLY (ADR-0053). A SIMULATED raw-fluorescence recording with a planted kernel.
//
// No lab data. It exists so the lab page, its reader and its tests can be built and run on
// a machine that has no recordings, and so the comparison of extraction variants can be
// checked against a kernel that is known. It is a model of the measurement, and every
// number in it is a choice made here, not a measured value:
//
//   soma(t) = F0(t) * (1 + apLinked(t) + apIndependent(t)) + K_TRUE * neuropil(t) + noise
//   pen(t)  = neuropil(t) + noise
//
// F0 falls and wobbles slowly (bleaching, drift); the neuropil has its own slow activity.
// ROI 1 is the loose-patch cell; the other ROIs have calcium events of their own that the
// spike train does not explain.

import { mulberry32, gaussian } from '../core/noise.js';
import { encodeArray, LAB_FORMAT, LAB_VERSION } from './recording.js';

export const SIM_DEFAULTS = Object.freeze({
  seed: 20261116,
  dt: 0.1,
  durationS: 1800,
  nRoi: 4,
  tauRise: 0.22,
  tauDecay: 2.7,
  apAmp: 0.04, // peak dF/F0 of one action potential
  kTrue: 0.7, // neuropil fraction in the soma signal
  f0Level: 400,
  neuropilLevel: 250,
  somaNoise: 3,
  penNoise: 1.5,
  regions: [
    { name: 'baseline', start_s: 0, end_s: 600 },
    { name: 'treatment 1', start_s: 600, end_s: 1200 },
    { name: 'treatment 2', start_s: 1200, end_s: 1800 },
  ],
});

/** Causal double exponential scaled to peak `amp`, sampled at lags 0, dt, 2dt, ... */
function kernelSamples(dt, tauRise, tauDecay, amp, lengthS) {
  const n = Math.round(lengthS / dt) + 1;
  const k = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    k[i] = Math.exp(-t / tauDecay) - Math.exp(-t / tauRise);
    peak = Math.max(peak, k[i]);
  }
  for (let i = 0; i < n; i++) k[i] *= amp / peak;
  return k;
}

function addEvent(target, dt, atS, amp, riseS, decayS) {
  const i0 = Math.round(atS / dt);
  for (let i = i0; i < target.length; i++) {
    const t = (i - i0) * dt;
    if (t > 12 * decayS) break;
    target[i] += amp * (1 - Math.exp(-t / riseS)) * Math.exp(-t / decayS);
  }
}

/**
 * Build the simulated recording as plain arrays.
 * @param {Partial<typeof SIM_DEFAULTS>} [overrides]
 */
export function simulateRaw(overrides = {}) {
  const p = { ...SIM_DEFAULTS, ...overrides };
  const rand = mulberry32(p.seed);
  const n = Math.round(p.durationS / p.dt);
  const time = new Float64Array(n);
  for (let i = 0; i < n; i++) time[i] = i * p.dt;

  // Spikes: clusters of 1-4, mean cluster interval 20 s, sparser in the second region.
  const spikes = [];
  let t = 15;
  while (t < p.durationS - 20) {
    const rateScale = t >= 600 && t < 1200 ? 0.5 : 1;
    const nAp = 1 + Math.floor(rand() * 4);
    let s = t;
    for (let a = 0; a < nAp; a++) {
      spikes.push(s);
      s += 0.15 + rand() * 0.3;
    }
    t += (-Math.log(1 - rand()) * 20) / rateScale + 3;
  }

  const kernel = kernelSamples(p.dt, p.tauRise, p.tauDecay, p.apAmp, 30);
  const apLinked = new Float64Array(n);
  for (const s of spikes) {
    const i0 = Math.floor(s / p.dt);
    for (let j = 0; j < kernel.length && i0 + j < n; j++) apLinked[i0 + j] += kernel[j];
  }

  // Neuropil: a level that bleaches, slow wander, and a few population events.
  const neuropil = new Float64Array(n);
  const popEvents = new Float64Array(n);
  for (let e = 0; e < 14; e++) addEvent(popEvents, p.dt, 30 + rand() * (p.durationS - 90), 0.05 + rand() * 0.08, 1.5, 8);
  const ph1 = rand() * 6.28;
  const ph2 = rand() * 6.28;
  for (let i = 0; i < n; i++) {
    const tt = time[i];
    const bleach = 0.8 + 0.2 * Math.exp(-tt / 700);
    const wander = 0.04 * Math.sin((2 * Math.PI * tt) / 310 + ph1) + 0.03 * Math.sin((2 * Math.PI * tt) / 97 + ph2);
    neuropil[i] = p.neuropilLevel * bleach * (1 + wander + popEvents[i]);
  }

  const soma = new Float32Array(n * p.nRoi);
  const pen = new Float32Array(n * p.nRoi);
  for (let r = 0; r < p.nRoi; r++) {
    const indep = new Float64Array(n);
    // AP-independent calcium: a few slow events on every ROI, more on the non-targeted ones.
    const nEvents = r === 0 ? 4 : 10;
    for (let e = 0; e < nEvents; e++) {
      addEvent(indep, p.dt, 40 + rand() * (p.durationS - 120), 0.08 + rand() * 0.2, 2 + rand() * 3, 15 + rand() * 30);
    }
    const level = p.f0Level * (0.8 + 0.4 * rand());
    const tauBleach = 500 + rand() * 600;
    const phase = rand() * 6.28;
    const coupling = r === 0 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const tt = time[i];
      const f0 = level * (0.75 + 0.25 * Math.exp(-tt / tauBleach)) * (1 + 0.025 * Math.sin((2 * Math.PI * tt) / 420 + phase));
      const np = neuropil[i] * (1 + 0.01 * gaussian(rand));
      soma[r * n + i] = f0 * (1 + coupling * apLinked[i] + indep[i]) + p.kTrue * np + p.somaNoise * gaussian(rand);
      pen[r * n + i] = np + p.penNoise * gaussian(rand);
    }
  }

  // Planted kernel on a symmetric +/-5 s lag axis, zero before the spike.
  const ws = Math.round(5 / p.dt);
  const truth = new Float64Array(2 * ws + 1);
  for (let j = 0; j <= ws; j++) truth[ws + j] = kernel[j];

  return { params: p, n, time, spikes: Float64Array.from(spikes), soma, pen, truth: { samples: truth, zeroIndex: ws, dt: p.dt } };
}

/** The simulated recording as a lab recording file object (contract version 1). */
export async function simulatedLabRecording(overrides = {}) {
  const s = simulateRaw(overrides);
  const p = s.params;
  return {
    format: LAB_FORMAT,
    version: LAB_VERSION,
    slice_id: `SIMULATED_${p.seed}`,
    cohort: 'simulated, no lab data',
    dt_nominal_s: p.dt,
    n_frames: s.n,
    n_roi: p.nRoi,
    time: await encodeArray(s.time),
    rois: Array.from({ length: p.nRoi }, (_, i) => ({ label: `roi${i + 1}` })),
    target_roi: 1,
    traces: {
      raw_soma: { ...(await encodeArray(s.soma, [s.n, p.nRoi])), order: 'column-major' },
      raw_pen: { ...(await encodeArray(s.pen, [s.n, p.nRoi])), order: 'column-major' },
    },
    production: { f0: { t1_s: 1.0, t2_s: null, t4_s: 20.0 }, pensub_k: 0.7 },
    spikes: {
      units: 's',
      clock: 'imaging',
      n: s.spikes.length,
      times: await encodeArray(s.spikes),
      gaps: [],
      source: { cell: 'simulated', revision: null, file: null, reviewed: null, offset_s: 0 },
    },
    regions: p.regions,
    exclusions: [],
    truth: {
      note: `planted: double exponential, tau rise ${p.tauRise} s, tau decay ${p.tauDecay} s, peak ${p.apAmp} dF/F0 per action potential; soma carries ${p.kTrue} x neuropil`,
      kernel: { samples: await encodeArray(s.truth.samples), zero_index: s.truth.zeroIndex, dt_s: s.truth.dt },
    },
    provenance: { tool: 'colonel_kernel src/lib/lab/simulate.js', created: null, note: 'simulated; not a recording' },
  };
}
