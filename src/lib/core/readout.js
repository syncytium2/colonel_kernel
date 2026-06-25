// Tab 2 readout display helpers — framework-free, pure, testable. These compute the
// DISPLAY decisions of ADR-0024 (overlay normalization) and ADR-0025 (indicator facts)
// so the Svelte readout stays pure wiring and the logic is covered by `test:core`.
//
// NONE of this touches recovery or diagnostics — it only transforms / inspects values
// the core already produced. Per ADR-0025 these are FACTS, never verdicts: each function
// reports a computed mechanical fact; the human decides what it means.

import { PARAM_BOUNDS } from './deconvolve-parametric.js';

/**
 * ADR-0025 — parametric τ-RAILED fact. A fitted τ is "railed" when it is pinned to one of
 * the solver's bounds (PARAM_BOUNDS) within a relative epsilon. A railed fit is
 * MECHANICALLY broken (the optimizer hit a wall, not an interior optimum) — but this only
 * STATES the fact; whether it means "junk" is the reader's call (ADR-0011 / ADR-0014).
 * @param {{ tauRise:number, tauDecay:number }} theta  fitted parameters
 * @param {number} [eps]  relative tolerance to a bound (default 1%)
 * @returns {{ railed:boolean, which:string[] }}  neutral fact + which bound(s) hit
 */
export function tauRailed({ tauRise, tauDecay }, eps = 0.01) {
  const atMin = (v, lo) => v <= lo * (1 + eps);
  const atMax = (v, hi) => v >= hi * (1 - eps);
  const which = [];
  if (atMin(tauRise, PARAM_BOUNDS.tauRiseMin)) which.push('τ_rise at min');
  if (atMax(tauRise, PARAM_BOUNDS.tauRiseMax)) which.push('τ_rise at max');
  if (atMax(tauDecay, PARAM_BOUNDS.tauDecayMax)) which.push('τ_decay at max');
  return { railed: which.length > 0, which };
}

/**
 * ADR-0025 — kernel PEAK-AT-BOUNDARY fact. The reported peak lag comes from the causal-lobe
 * argmax (kernelDiagnostics). When that max sits in the outermost `edgeFrac` of the +lag
 * window, the "peak" is a window-edge artifact (a monotonic bowl), NOT a transient peak —
 * so the peak-lag readout should be read with that qualification. STATES the fact only; it
 * never asserts "no kernel" (that coupling verdict is the human's — ADR-0011/0014/0025).
 * `edgeFrac` is a visible DISPLAY parameter (ADR-0025), not a gate.
 * @param {{ samples:ArrayLike<number>, zeroIndex:number }} kernel  ADR-0009 contract
 * @param {number} [edgeFrac]  outer fraction of the +lag half-window counted as "edge" (default 0.1)
 * @returns {{ atBoundary:boolean, peakIndex:number, lagSamples:number, halfPlusSamples:number }}
 */
export function peakAtBoundary({ samples, zeroIndex }, edgeFrac = 0.1) {
  let pk = zeroIndex;
  for (let i = zeroIndex; i < samples.length; i++) if (samples[i] > samples[pk]) pk = i;
  const halfPlus = samples.length - 1 - zeroIndex; // +lag half-window, in samples
  const lagSamples = pk - zeroIndex;
  const atBoundary = halfPlus > 0 && lagSamples >= halfPlus * (1 - edgeFrac);
  return { atBoundary, peakIndex: pk, lagSamples, halfPlusSamples: halfPlus };
}

/**
 * ADR-0024 — normalize a trace to unit peak for the NORMALIZED overlay mode, so
 * cross-method SHAPE is legible when a magnitude gap would swamp it under shared-y. Scales
 * by max |value| so the largest excursion maps to ±1. DISPLAY-ONLY: returns a new array,
 * preserves null/NaN (uPlot gaps), and never mutates the input. Magnitude is NOT lost — it
 * stays reported numerically in the readout (the §3 plausibility leg). An all-zero / empty
 * input is returned unscaled (no division by zero).
 * @param {ArrayLike<number>} values  may contain null/NaN (drawn as gaps)
 * @returns {Array<number|null>} normalized copy (peak magnitude 1), nulls/NaNs preserved
 */
export function normalizeUnitPeak(values) {
  let maxAbs = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) { const a = Math.abs(v); if (a > maxAbs) maxAbs = a; }
  }
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out[i] = v != null && Number.isFinite(v) ? (maxAbs > 0 ? v / maxAbs : v) : null;
  }
  return out;
}
