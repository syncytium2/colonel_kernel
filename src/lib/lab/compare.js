// LAB-ONLY (ADR-0053). Recover a kernel from every extraction variant of one ROI over one
// analysis window, with the SAME recovery code Tab 2 uses, so that the only thing that
// differs between two rows of the result is the extraction.
//
// Kernel recovery goes through core/ and nowhere else (haruspex and FOUNDATIONS both hold
// that line): free-vector and parametric and the STA via recoverRegion, shaped via
// recoverKernelShaped. Nothing here re-implements a recovery.

import { gridFromTimeColumn } from '../core/timebase.js';
import { rasterize } from '../core/rasterize.js';
import { nextPow2 } from '../core/deconvolve.js';
import { recoverRegion } from '../core/region-recovery.js';
import { recoverKernelShaped } from '../core/deconvolve-shaped.js';
import { kernelDiagnostics } from '../core/kernel-diagnostics.js';
import { buildVariants, bridgeSpans } from './extraction.js';
import { roiColumn } from './recording.js';

const WIN_S = 5; // kernel half-window, as region-recovery.js

/** Frame indices [i0, i1) covering [startS, endS]. */
export function windowIndices(time, startS, endS) {
  const n = time.length;
  let i0 = 0;
  while (i0 < n && time[i0] < startS) i0++;
  let i1 = n;
  while (i1 > i0 && time[i1 - 1] > endS) i1--;
  return { i0, i1 };
}

/** The windows a recording offers: the whole recording, then each region as marked. */
export function analysisWindows(rec) {
  const t = rec.time;
  const out = [{ name: 'whole recording', startS: t[0], endS: t[t.length - 1] }];
  for (const r of rec.regions) out.push({ name: r.name, startS: r.startS, endS: r.endS });
  return out;
}

/**
 * The file's exclusion windows that apply to one ROI (an exclusion with `rois` null applies
 * to every ROI). These are the stretches whose FLUORESCENCE cannot be trusted, so they are
 * bridged out of the raw trace before any baseline is computed (Tony, 2026-11-16: "The
 * blanking exists because of serious issues in the calcium signal in those regions").
 * @param {import('./recording.js').LabRecording} rec
 * @param {number} roiIndex 0-based
 */
export function exclusionSpans(rec, roiIndex) {
  return rec.exclusions
    .filter((e) => e.rois == null || e.rois.has(roiIndex))
    .map((e) => ({ startS: e.startS, endS: e.endS, why: e.reason || 'excluded' }));
}

/**
 * Stretches left out of kernel recovery for one ROI: its exclusion windows, and the
 * stretches the loose-patch recording was not running (`spikes.gaps`). A silence in a gap is
 * not a silence, so both the trace and the spikes are removed there. Gaps are NOT bridged
 * before F0: the fluorescence in a gap is sound, only the spike train is missing.
 * @param {import('./recording.js').LabRecording} rec
 * @param {number} roiIndex 0-based
 */
export function maskedSpans(rec, roiIndex) {
  const out = exclusionSpans(rec, roiIndex);
  for (const g of rec.spikes?.gaps ?? []) {
    if (Number.isFinite(g.start_s) && Number.isFinite(g.end_s)) {
      out.push({ startS: g.start_s, endS: g.end_s, why: 'no loose-patch recording' });
    }
  }
  return out;
}

function inAny(spans, t) {
  for (const s of spans) if (t >= s.startS && t <= s.endS) return true;
  return false;
}

/** RMS difference between two kernels after each is scaled to unit peak, over lags 0..+win. */
function shapeError(kernel, truth) {
  const peak = (k) => {
    let m = 0;
    for (let i = k.zeroIndex; i < k.samples.length; i++) m = Math.max(m, Math.abs(k.samples[i]));
    return m;
  };
  const pk = peak(kernel);
  const pt = peak(truth);
  if (!(pk > 0) || !(pt > 0) || Math.abs(kernel.dt - truth.dt) > 1e-9) return NaN;
  const len = Math.min(kernel.samples.length - kernel.zeroIndex, truth.samples.length - truth.zeroIndex);
  let ss = 0;
  for (let j = 0; j < len; j++) {
    const d = kernel.samples[kernel.zeroIndex + j] / pk - truth.samples[truth.zeroIndex + j] / pt;
    ss += d * d;
  }
  return Math.sqrt(ss / len);
}

function againstTruth(kernel, truth) {
  if (!truth) return null;
  const d = kernelDiagnostics(kernel);
  const t = kernelDiagnostics(truth.kernel);
  return {
    dPeakLagS: d.peakLagS - t.peakLagS,
    ampRatio: d.peakAmp / t.peakAmp,
    dTauDecayS: d.tauDecayS - t.tauDecayS,
    shapeRms: shapeError(kernel, truth.kernel),
  };
}

/**
 * @param {import('./recording.js').LabRecording} rec
 * @param {Object} o
 * @param {number} o.roiIndex 0-based ROI column
 * @param {number} o.startS @param {number} o.endS analysis window (s, imaging clock)
 * @param {number} [o.lambda] free-vector regularization
 * @param {number} [o.pensubK]
 * @param {boolean} [o.parametric] also keep the parametric fit (it is always computed)
 * @returns {object} { window, times, spikeTimes, masked, variants:[...] }
 */
export function analyzeVariants(rec, o) {
  const { roiIndex, startS, endS, lambda = 0.002, pensubK, bridgeExclusions = true } = o;
  const { i0, i1 } = windowIndices(rec.time, startS, endS);
  if (i1 - i0 < 2 * Math.round(WIN_S / rec.dt) + 2) {
    throw new Error(`window ${startS}-${endS} s holds ${i1 - i0} frames: too short for a +/-${WIN_S} s kernel`);
  }
  const rawSoma = roiColumn(rec.traces.raw_soma, rec.nFrames, roiIndex);
  const rawPen = rec.traces.raw_pen ? roiColumn(rec.traces.raw_pen, rec.nFrames, roiIndex) : null;
  const fileDff = rec.traces.dff_production ? roiColumn(rec.traces.dff_production, rec.nFrames, roiIndex) : null;

  // Exclusions come out of the raw traces BEFORE F0 and the percentile baseline see them.
  // `bridgeExclusions: false` reproduces the page before 2026-11-16, for comparison only.
  const ex = bridgeExclusions ? exclusionSpans(rec, roiIndex) : [];
  const soma = ex.length ? bridgeSpans(rawSoma, rec.time, ex).x : rawSoma;
  const pen = rawPen && ex.length ? bridgeSpans(rawPen, rec.time, ex).x : rawPen;

  const variants = buildVariants({ soma, pen, dt: rec.dt, i0, i1, pensubK, fileDff });

  const times = rec.time.subarray(i0, i1);
  const grid = gridFromTimeColumn(times);
  // The declared dt, not mean(diff(time)), is what the kernel lag axis is built on.
  grid.dt = rec.dt;
  grid.sampleRate = 1 / rec.dt;

  const spans = maskedSpans(rec, roiIndex);
  const tA = times[0];
  const tB = times[times.length - 1];
  const spikeTimes = [];
  for (const t of rec.spikeTimes ?? []) {
    if (t >= tA && t <= tB && !inAny(spans, t)) spikeTimes.push(t);
  }
  let nMasked = 0;
  const maskIdx = [];
  if (spans.length) {
    for (let i = 0; i < times.length; i++) {
      if (inAny(spans, times[i])) {
        maskIdx.push(i);
        nMasked++;
      }
    }
  }

  const n = grid.n;
  const N = nextPow2(n);
  const ws = Math.round(WIN_S / rec.dt);
  const sd = rasterize(spikeTimes, grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
  const sdPad = new Float64Array(N);
  sdPad.set(sd.samples);

  const view = {
    name: `${rec.sliceId} ${startS.toFixed(0)}-${endS.toFixed(0)} s`,
    analyzable: spikeTimes.length >= 2,
    reason: spikeTimes.length >= 2 ? null : `${spikeTimes.length} spike(s) in the window: a kernel needs at least 2`,
    grid,
    spikeTimes: Float64Array.from(spikeTimes),
    rois: variants.map((v) => {
      const samples = Float64Array.from(v.samples);
      for (const i of maskIdx) samples[i] = NaN;
      return { id: v.id, samples };
    }),
  };

  const results = variants.map((v, col) => {
    if (!view.analyzable) return { ...v, analyzable: false, reason: view.reason };
    const r = recoverRegion(view, { col, lambda, win: WIN_S, stability: false });
    const tracePad = new Float64Array(N);
    const s = view.rois[col].samples;
    for (let k = 0; k < n; k++) tracePad[k] = Number.isFinite(s[k]) ? s[k] : 0;
    const shaped = recoverKernelShaped(tracePad, sdPad, { windowSamples: ws, dt: rec.dt, fitLength: n });
    const shDiag = kernelDiagnostics(shaped);
    return {
      ...v,
      samples: view.rois[col].samples,
      analyzable: true,
      reason: null,
      fv: r.fv,
      pm: r.pm,
      sta: r.sta,
      agreement: r.agreement,
      shaped: {
        kernel: { samples: shaped.samples, zeroIndex: shaped.zeroIndex, dt: shaped.dt, times: shaped.times },
        drift: shaped.fit.drift,
        r2: shaped.fit.r2,
        peakLagS: shDiag.peakLagS,
        peakAmp: shDiag.peakAmp,
        tauDecayS: shDiag.tauDecayS,
        acausalRatio: shDiag.acausalRatio,
      },
      truth: rec.truth
        ? {
            fv: againstTruth(r.fv.kernel, rec.truth),
            shaped: againstTruth(shaped, rec.truth),
            pm: againstTruth(r.pm.kernel, rec.truth),
          }
        : null,
    };
  });

  return {
    window: { i0, i1, startS: tA, endS: tB },
    dt: rec.dt,
    times,
    spikeTimes: view.spikeTimes,
    spikeCounts: sd.samples,
    masked: { spans, nFrames: nMasked },
    variants: results,
  };
}
