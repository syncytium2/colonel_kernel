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
import { buildVariants } from './extraction.js';
import { roiColumn, roiNumber } from './recording.js';
import { spikeTriggeredAverage } from '../core/sta.js';

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
 * Stretches of one ROI that must not reach a baseline, a deconvolution or a kernel: the
 * file's exclusion windows that apply to this ROI, and the stretches the loose-patch
 * recording was not running (`spikes.gaps`), where a silence is not a silence.
 *
 * Tony, 2026-11-16: the blanking exists because the calcium signal is seriously wrong in
 * those stretches, and a baseline or a deconvolution that sees them "will go nuts". So the
 * mask is applied BEFORE anything is computed from the trace, not after.
 * @param {number} [roiIndex] omit for the windows that apply to every ROI plus all others
 */
export function maskedSpans(rec, roiIndex = null) {
  const num = roiIndex == null ? null : roiNumber(rec, roiIndex);
  const out = [];
  for (const e of rec.exclusions) {
    if (e.rois && num != null && !e.rois.includes(num)) continue;
    out.push({ startS: e.startS, endS: e.endS, why: e.reason || 'excluded' });
  }
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

/** Whole-recording frame mask for one ROI: 1 where the frame is inside a masked span. */
export function frameMask(rec, roiIndex) {
  const spans = maskedSpans(rec, roiIndex);
  const mask = new Uint8Array(rec.nFrames);
  if (spans.length) for (let i = 0; i < rec.nFrames; i++) if (inAny(spans, rec.time[i])) mask[i] = 1;
  return mask;
}

/**
 * A copy of x with every masked run replaced by a straight line between the valid samples
 * either side of it (a run at an end holds the nearest valid sample). This is what the
 * archive's own blank-frame repair does, and it is what lets the running minimum, the boxcar
 * and the percentile filter pass over a bad stretch without being pulled by it. The filled
 * samples are placeholders: they are removed again before anything is drawn or averaged.
 */
export function bridgeMasked(x, mask) {
  const n = x.length;
  const out = Float64Array.from(x);
  let i = 0;
  while (i < n) {
    if (!mask[i]) { i++; continue; }
    let j = i;
    while (j < n && mask[j]) j++;
    const left = i > 0 ? out[i - 1] : NaN;
    const right = j < n ? x[j] : NaN;
    for (let k = i; k < j; k++) {
      if (Number.isFinite(left) && Number.isFinite(right)) out[k] = left + ((right - left) * (k - i + 1)) / (j - i + 1);
      else out[k] = Number.isFinite(left) ? left : right;
    }
    i = j;
  }
  return out;
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
  const { roiIndex, startS, endS, lambda = 0.002, pensubK } = o;
  const { i0, i1 } = windowIndices(rec.time, startS, endS);
  if (i1 - i0 < 2 * Math.round(WIN_S / rec.dt) + 2) {
    throw new Error(`window ${startS}-${endS} s holds ${i1 - i0} frames: too short for a +/-${WIN_S} s kernel`);
  }
  // Mask first: the excluded stretches are bridged in the RAW traces, over the whole
  // recording, before F0, dF/F0 or the percentile filter see them.
  const mask = frameMask(rec, roiIndex);
  const soma = bridgeMasked(roiColumn(rec.traces.raw_soma, rec.nFrames, roiIndex), mask);
  const pen = rec.traces.raw_pen ? bridgeMasked(roiColumn(rec.traces.raw_pen, rec.nFrames, roiIndex), mask) : null;
  const fileDff = rec.traces.dff_production ? bridgeMasked(roiColumn(rec.traces.dff_production, rec.nFrames, roiIndex), mask) : null;

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
  for (let i = i0; i < i1; i++) {
    if (mask[i]) {
      maskIdx.push(i - i0);
      nMasked++;
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
    // Recovery is given the bridged trace: finite everywhere, with the excluded stretches
    // flat-lined between their neighbours and every spike inside them already removed. A
    // zero or a gap there would be a step the deconvolution has to explain.
    rois: variants.map((v) => ({ id: v.id, samples: Float64Array.from(v.samples) })),
  };
  // What is drawn and what the STA averages has the excluded stretches REMOVED (NaN), so no
  // placeholder sample is ever shown or counted as data.
  const shownSamples = variants.map((v) => {
    const samples = Float64Array.from(v.samples);
    for (const i of maskIdx) samples[i] = NaN;
    return samples;
  });

  const results = variants.map((v, col) => {
    if (!view.analyzable) return { ...v, analyzable: false, reason: view.reason };
    const r = recoverRegion(view, { col, lambda, win: WIN_S, stability: false });
    const tracePad = new Float64Array(N);
    const s = view.rois[col].samples;
    for (let k = 0; k < n; k++) tracePad[k] = Number.isFinite(s[k]) ? s[k] : 0;
    const shaped = recoverKernelShaped(tracePad, sdPad, { windowSamples: ws, dt: rec.dt, fitLength: n });
    const shDiag = kernelDiagnostics(shaped);
    const sta = spikeTriggeredAverage(view.spikeTimes, shownSamples[col], grid.times, { window: 2, baseline: 0.5 });
    let staPeakLagS = NaN;
    let staPeakAmp = NaN;
    if (!sta.empty) {
      let bi = 0;
      for (let i = 1; i < sta.samples.length; i++) if (sta.samples[i] > sta.samples[bi]) bi = i;
      staPeakLagS = sta.times[bi];
      staPeakAmp = sta.samples[bi];
    }
    return {
      ...v,
      samples: shownSamples[col],
      analyzable: true,
      reason: null,
      fv: r.fv,
      pm: r.pm,
      sta,
      agreement: { ...r.agreement, staPeakLagS, staPeakAmp, nAccepted: sta.nAccepted, nEvents: sta.nEvents },
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
