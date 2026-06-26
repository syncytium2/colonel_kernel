// Windowed (sub-window) kernel recovery — the STAGE-1 SPINE for ADR-0027.
//
// ADR-0027 makes sub-window recovery a FIRST-CLASS scientific operation (distinct from
// the view-only zoom): a kernel is a property of the AP/Ca²⁺ span it is recovered over,
// and recovering over a cleanly-coupled span reveals the AP→Ca²⁺ model that the
// whole-recording (contaminated) average masks (ADR-0027 §2). Two flavors share ONE
// machinery — protocol-epoch **region selection** (ADR-0019 metadata) and ad-hoc
// **coupling-window selection** — both are just a span [startS, endS] fed through the
// SAME bracket-then-recover path.
//
// THE PATH IS TWO COMPOSED STEPS, each already canon:
//   1. windowRegion(recording, {startS, endS}, {buffer})  — bracket the region's spikes
//      with the symmetric round(buffer/dt)-sample pad on both ends (ADR-0019 §4). This
//      step lives in load-xlsx.js (it needs the whole-recording arrays) and is already
//      tested; it is NOT reimplemented here.
//   2. recoverRegion(view, opts)  — run the EXISTING recovery (free-vector ADR-0004 +
//      parametric ADR-0021) and STA (ADR-0005) over that windowed spike set + trace
//      slice, returning a region-LOCAL kernel/STA.
//
// This module is the second step. It is deliberately SheetJS-FREE (it takes the already
// windowed view, never the raw workbook), so it is barrel-safe and the teaching tabs pay
// no bundle weight (FOUNDATIONS §6 — the load-xlsx code-split is preserved). The caller
// composes the two steps; the debug render and (stage 2) the UI both do exactly that.
//
// The whole-recording recovery is just this same path over the full-span region — a
// genuine ALL-APs recovery (ADR-0027 §2), NOT a concatenation of regions. Whole-recording
// and window kernels are co-equal; the GAP between them is itself the decoupling signal.
//
// Per-window spike sufficiency is REPORTED, never gated (ADR-0027 §4 / ADR-0019): a short
// clean span may hold few spikes — we surface a count + rate + advisory flag and recover
// anyway; we never silently refuse.

import { rasterize } from './rasterize.js';
import { nextPow2, recoverKernel, deconvolveCircular, circularConvolve } from './deconvolve.js';
import { recoverKernelParametric, reconstructParametric } from './deconvolve-parametric.js';
import { kernelDiagnostics, preZeroBaselineMean } from './kernel-diagnostics.js';
import { spikeTriggeredAverage } from './sta.js';

// Pipeline constants — match the validated lab driver / the Tab2 slice viewer so a
// region-local result is directly comparable to the whole-recording one.
const WIN_S = 5; // kernel half-window (s); windowSamples = round(WIN/dt) (ADR-0004)
const STA_WIN_S = 2; // STA half-window (s) (ADR-0005)
const STA_BASE_S = 0.5; // STA per-event pre-spike baseline window (s)
const LAMBDA_DEFAULT = 0.002; // free-vector regularization (sweep floor / UI default, ADR-0004)

// Free-vector λ-stability sweep (§3 check 3) — geometric, matching the Tab2 slice viewer.
const LAM_LO = 0.002;
const LAM_HI = 3.0;
const NSWEEP = 13;

// Spike-sufficiency advisory threshold (ADR-0027 §4): a DISPLAY heuristic, never a gate.
// Few well-separated calcium events under-determine a ±5 s kernel, so we FLAG (not refuse)
// a low-spike window. Overridable via opts.minSpikes; the figure-gate (Tony's eye) is the
// real judge (ADR-0018).
const SUFFICIENCY_MIN_SPIKES = 20;

/**
 * Spike-sufficiency REPORT for a window (ADR-0027 §4 / ADR-0019 — reported, not gated).
 * @param {number} count  spikes selected into the window
 * @param {number} rateHz spike rate over the in-trace span (Hz)
 * @param {number} [minSpikes]  advisory floor (display heuristic, default 20)
 * @returns {{ count:number, rateHz:number, sufficient:boolean, minSpikes:number, note:string }}
 */
export function spikeSufficiency(count, rateHz, minSpikes = SUFFICIENCY_MIN_SPIKES) {
  const sufficient = count >= minSpikes;
  return {
    count,
    rateHz,
    sufficient,
    minSpikes,
    note: sufficient
      ? `${count} spikes — adequate to identify a kernel`
      : `${count} spikes (< ${minSpikes}) — kernel reported but under-determined; read with caution`,
  };
}

/**
 * @typedef {Object} RegionRecovery
 * @property {string} name
 * @property {boolean} analyzable
 * @property {(string|null)} reason  when !analyzable, the windowRegion §7 surfaced text
 * @property {{count:number, rateHz:number, sufficient:boolean, minSpikes:number, note:string}} sufficiency
 * @property {(object|undefined)} window  windowRegion's {startIdx,endIdx,startS,endS,bufferS,bufferSamples}
 * @property {number} [dt]
 * @property {number} [ws]  kernel half-window in samples (round(WIN/dt))
 * @property {number} [col] roi column index recovered
 * @property {object} [fv]  free-vector: { kernel (ADR-0009), reconTrace, §3 check-1 plausibility
 *   (peakLagS, peakAmp, peakAmpAdj, tauDecayS, acausalRatio), §3 check-2 reconstruction (r2, rmse, r2Full) }
 * @property {object} [pm]  parametric: { kernel, fit, reconTrace, §3 check-1 (peakLagS, peakAmp,
 *   tauRiseS, tauDecayS, acausalRatio), §3 check-2 (r2, converged) }
 * @property {(object|null)} [stability]  §3 check-3 free-vector λ sweep (peakLag/amp ranges + sweep)
 * @property {object} [sta]  STA result (ADR-0005)
 * @property {object} [agreement]  §3 check-4: { staPeakLagS, staPeakAmp, dLagFvS, dLagPmS, nAccepted, nEvents, rateHz }
 */

/**
 * Recover a region-LOCAL kernel (free-vector + parametric) and STA over an already-windowed
 * region view (ADR-0027 step 2). Pure / framework-free / SheetJS-free.
 *
 * @param {import('./load-xlsx.js').RegionView|import('./load-csv.js').LoadedRegion} view
 *   a windowed region. A windowRegion RegionView carries `analyzable`; a loadCsv
 *   LoadedRegion (already a full region) is treated as analyzable. When `analyzable` is
 *   false the recovery is skipped and the sufficiency report is returned (ADR-0027 §4).
 * @param {Object} [opts]
 * @param {number} [opts.col]      roi column to recover (default 0 = targeted cell, §4)
 * @param {number} [opts.lambda]   free-vector regularization (default 0.002, ADR-0004)
 * @param {number} [opts.win]      kernel half-window (s); default 5
 * @param {number} [opts.staWin]   STA half-window (s); default 2
 * @param {number} [opts.staBase]  STA per-event baseline window (s); default 0.5
 * @param {number} [opts.minSpikes] sufficiency advisory floor (default 20)
 * @returns {RegionRecovery}
 */
export function recoverRegion(view, opts = {}) {
  const {
    col = 0,
    lambda = LAMBDA_DEFAULT,
    win = WIN_S,
    staWin = STA_WIN_S,
    staBase = STA_BASE_S,
    minSpikes = SUFFICIENCY_MIN_SPIKES,
    stability = true, // §3 check 3 λ-sweep (the most expensive leg; skippable per call)
  } = opts;

  const name = view.name ?? (view.meta && view.meta.source) ?? '(region)';
  const spikeCount = view.spikeCount ?? (view.spikeTimes ? view.spikeTimes.length : 0);
  const spikeRateHz = view.spikeRateHz ?? regionRateHz(view);
  const sufficiency = spikeSufficiency(spikeCount, spikeRateHz, minSpikes);

  // Non-analyzable (windowRegion reported < 2 spikes): REPORT, never throw (ADR-0027 §4).
  if (view.analyzable === false) {
    return { name, analyzable: false, reason: view.reason, sufficiency, window: view.window };
  }

  const grid = view.grid;
  const rois = view.rois;
  if (!grid || !rois) throw new Error(`recoverRegion: view '${name}' has no windowed grid/rois`);
  if (col < 0 || col >= rois.length) throw new Error(`recoverRegion: col ${col} out of range (${rois.length} rois)`);

  const dt = grid.dt;
  const n = grid.n;
  const N = nextPow2(n);
  const ws = Math.round(win / dt);

  // Binned-count spike density on the window's frame grid (§13, ADR-0013 keep; ADR-0017
  // raw), zero-padded to a power of two — the SAME rasterization the slice viewer feeds
  // recovery, so region-local and whole-recording kernels are computed identically.
  const sd = rasterize(view.spikeTimes, grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
  const sdPad = new Float64Array(N);
  sdPad.set(sd.samples);

  // Targeted trace: NaN→0 + zero-padded for the deconvolution path; the raw (NaN-preserved)
  // trace for STA's omitnan averaging — exactly as Tab2.svelte does it.
  const traceRaw = rois[col].samples;
  const tracePad = new Float64Array(N);
  for (let k = 0; k < n; k++) tracePad[k] = Number.isFinite(traceRaw[k]) ? traceRaw[k] : 0;

  // METHOD 1 — free-vector (ADR-0004) and METHOD 2 — parametric (ADR-0021), both region-local.
  const fvKernel = recoverKernel(tracePad, sdPad, { windowSamples: ws, dt, lambda });
  const pm = recoverKernelParametric(tracePad, sdPad, { windowSamples: ws, dt, fitLength: n });

  // STA (ADR-0005) — method-independent cross-check, over the windowed trace + spikes.
  const sta = spikeTriggeredAverage(view.spikeTimes, traceRaw, grid.times, {
    window: staWin,
    baseline: staBase,
  });

  // ===== the four §3 checks, region-LOCAL (FOUNDATIONS §3; same recipe as the slice
  // viewer's `analysis`). Machinery-gated / fit-REPORTED (ADR-0011): every number here is
  // reported, never a pass/fail gate — a low region-local fit is a meaningful decoupling
  // read, not an error. =====

  // CHECK 1 — kernel plausibility (ADR-0014 diagnostics) for both methods.
  const fvDiag = kernelDiagnostics(fvKernel);
  const fvPreBaseline = preZeroBaselineMean(fvKernel, staBase);
  const pmDiag = kernelDiagnostics({ samples: pm.samples, zeroIndex: pm.zeroIndex, dt: pm.dt });

  // CHECK 2 — reconstruction residual. Free-vector: retained-±WIN-kernel R² (the §3 fit)
  // plus the full-latent R² (machinery sanity ≈ 1). Parametric: the Option-B full-kernel R²
  // already computed in the fit (reconstructParametric tail-extended).
  const fvKPad = embedKernel(fvKernel, N, ws);
  const fvReconArr = circularConvolve(sdPad, fvKPad);
  let ssRes = 0, ssTot = 0, mean = 0;
  for (let k = 0; k < n; k++) mean += tracePad[k];
  mean /= n;
  for (let k = 0; k < n; k++) {
    const r = tracePad[k] - fvReconArr[k];
    ssRes += r * r;
    const d = tracePad[k] - mean;
    ssTot += d * d;
  }
  const fvR2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;
  const fvRmse = Math.sqrt(ssRes / n);
  const latent = deconvolveCircular(tracePad, sdPad, lambda);
  const reconFull = circularConvolve(sdPad, latent);
  let ssResFull = 0;
  for (let k = 0; k < n; k++) { const r = tracePad[k] - reconFull[k]; ssResFull += r * r; }
  const fvR2Full = ssTot > 0 ? 1 - ssResFull / ssTot : NaN;
  const pmReconArr = reconstructParametric(sdPad, pm.fit.theta, dt, n, ws);

  // CHECK 3 — free-vector λ-stability (a property of the FV recovery; parametric has no λ).
  const stabilityResult = stability ? sweepStability(tracePad, sdPad, ws, dt) : null;

  // CHECK 4 — STA cross-method agreement: peak lags, Δ, accepted-event ratio, spike rate.
  let staPeakLagS = NaN, staPeakAmp = NaN;
  if (!sta.empty) {
    let bi = 0;
    for (let i = 1; i < sta.samples.length; i++) if (sta.samples[i] > sta.samples[bi]) bi = i;
    staPeakLagS = sta.times[bi];
    staPeakAmp = sta.samples[bi];
  }

  return {
    name,
    analyzable: true,
    reason: null,
    sufficiency,
    window: view.window,
    dt,
    ws,
    col,
    n,
    lambda,
    fv: {
      kernel: fvKernel,
      reconTrace: Array.from(fvReconArr.subarray(0, n)),
      // check 1 — plausibility
      peakLagS: fvDiag.peakLagS,
      peakAmp: fvDiag.peakAmp,
      peakAmpAdj: fvDiag.peakAmp - fvPreBaseline,
      tauDecayS: fvDiag.tauDecayS,
      acausalRatio: fvDiag.acausalRatio,
      // check 2 — reconstruction
      r2: fvR2,
      rmse: fvRmse,
      r2Full: fvR2Full,
    },
    pm: {
      kernel: { samples: pm.samples, zeroIndex: pm.zeroIndex, dt: pm.dt, times: pm.times },
      fit: pm.fit,
      reconTrace: Array.from(pmReconArr),
      // check 1 — plausibility
      peakLagS: pm.fit.peakLagS,
      peakAmp: pmDiag.peakAmp,
      tauRiseS: pm.fit.theta.tauRise,
      tauDecayS: pm.fit.theta.tauDecay,
      acausalRatio: pmDiag.acausalRatio,
      // check 2 — reconstruction (Option B full-kernel R², from the fit)
      r2: pm.fit.r2,
      converged: pm.fit.converged,
    },
    // check 3 — stability (free-vector λ sweep), null when stability:false
    stability: stabilityResult,
    // check 4 — STA + cross-method agreement
    sta,
    agreement: {
      staPeakLagS,
      staPeakAmp,
      dLagFvS: fvDiag.peakLagS - staPeakLagS,
      dLagPmS: pm.fit.peakLagS - staPeakLagS,
      nAccepted: sta.nAccepted,
      nEvents: sta.nEvents,
      rateHz: spikeRateHz,
    },
  };
}

/** Embed a symmetric kernel into a length-N circular signal (zero-lag at index 0). */
function embedKernel(kernel, N, ws) {
  const kPad = new Float64Array(N);
  kPad[0] = kernel.samples[ws];
  for (let j = 1; j <= ws; j++) {
    kPad[j] = kernel.samples[ws + j];
    kPad[N - j] = kernel.samples[ws - j];
  }
  return kPad;
}

/** §3 check 3 — free-vector peak lag / amp across the geometric λ sweep (0.002→3). */
function sweepStability(tracePad, sdPad, ws, dt) {
  const sweep = [];
  for (let s = 0; s < NSWEEP; s++) {
    const lam = LAM_LO * Math.pow(LAM_HI / LAM_LO, s / (NSWEEP - 1));
    const k = recoverKernel(tracePad, sdPad, { windowSamples: ws, dt, lambda: lam });
    const d = kernelDiagnostics(k);
    sweep.push({ lambda: lam, peakLagS: d.peakLagS, peakAmp: d.peakAmp });
  }
  const lags = sweep.map((s) => s.peakLagS);
  const amps = sweep.map((s) => s.peakAmp);
  return {
    sweep,
    peakLagMinS: Math.min(...lags),
    peakLagMaxS: Math.max(...lags),
    peakLagRangeS: Math.max(...lags) - Math.min(...lags),
    peakAmpMin: Math.min(...amps),
    peakAmpMax: Math.max(...amps),
  };
}

/** Spike rate (Hz) over a windowed view's in-trace span, when windowRegion didn't supply one. */
function regionRateHz(view) {
  if (!view.grid || !view.spikeTimes || view.grid.n < 2) return 0;
  const t0 = view.grid.times[0];
  const tEnd = view.grid.times[view.grid.n - 1];
  const span = tEnd - t0;
  return span > 0 ? view.spikeTimes.length / span : 0;
}
