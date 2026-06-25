// Non-visual core — the reusable spine shared across all tabs.
export { makeGrid, gridFromTimeColumn } from './timebase.js';
export { rasterize } from './rasterize.js';
export { KERNEL_LIBRARY, defaultParams, buildKernel } from './kernels.js';
export { convolveLinear, convolveOnGrid } from './convolve.js';
// Tab 2 spine: noise model (ADR-0015), regularized recovery (ADR-0004), and the
// kernel diagnostics that judge a recovered kernel (ADR-0014).
export { SIGMA_COHORT_TYPICAL, NOISE_LEVEL_MAX, sigmaForLevel, addAWGN, mulberry32, gaussian } from './noise.js';
export { nextPow2, circularConvolve, deconvolveCircular, extractSymmetric, recoverKernel } from './deconvolve.js';
// Constrained-parametric recovery (ADR-0021 method 2): causal double-exponential fit,
// a PARALLEL method to the free-vector recoverKernel above (never replaces it).
export {
  doubleExpCausal, doubleExpCausalFull, forwardConvolveCausal,
  reconstructParametric, recoverKernelParametric, PARAM_BOUNDS,
} from './deconvolve-parametric.js';
export { kernelDiagnostics, compareKernels, preZeroBaselineMean } from './kernel-diagnostics.js';
// Tab 2 readout display helpers (ADR-0024 normalization, ADR-0025 indicator facts) —
// pure, framework-free, so the Svelte readout stays wiring and the logic is test-covered.
export { tauRailed, peakAtBoundary, normalizeUnitPeak, rebinCounts } from './readout.js';
// STA (ADR-0005): the model-free cross-method validation partner for the kernel.
export { spikeTriggeredAverage } from './sta.js';
// CSV ingestion (ADR-0016): one region's exported CSV → the signal contract.
export { loadCsv } from './load-csv.js';
