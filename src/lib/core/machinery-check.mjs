// Machinery-check harness — the synthetic oracle (NEXT_SESSION item 2; ADR-0011,
// ADR-0014, ADR-0015).
//
//   plant a physiological kernel → circular-convolve with a binned spike train
//   → add AWGN across the ADR-0015 slider range (0–10× cohort-typical σ)
//   → recover by regularized least squares (ADR-0004)
//   → compare recovered vs planted in ADR-0014 terms (peak lag / τ / amplitude /
//      acausal energy).
//
// Because the planted answer is KNOWN, the noise-free recovery is an automated
// pass/fail gate on the recovery arithmetic ("does the machinery invert?" —
// FOUNDATIONS §3, machinery is gated). Degradation as σ rises is REPORTED, not
// gated — that is the §3 Stability leg, and exactly what the app's noise slider
// will show interactively. Run:  node src/lib/core/machinery-check.mjs
//
// This validates the recovery on a self-consistent synthetic model (circular
// forward = circular inverse). Linear-vs-circular edge realism and the lab
// deconvreg cross-check are separate, human-judged comparisons (ADR-0014).

import { makeGrid } from './timebase.js';
import { rasterize } from './rasterize.js';
import { buildKernel } from './kernels.js';
import { nextPow2, circularConvolve, recoverKernel } from './deconvolve.js';
import { kernelDiagnostics, compareKernels } from './kernel-diagnostics.js';
import { extractSymmetric } from './deconvolve.js';
import { sigmaForLevel, addAWGN, mulberry32 } from './noise.js';

// --- experiment setup -------------------------------------------------------
const DT = 0.1; // 10 Hz, matching the recordings
const WIN = 5; // kernel half-window (s), matching the lab driver
const WINDOW_SAMPLES = Math.round(WIN / DT); // 50 → symmetric kernel length 101
const N = nextPow2(8000); // 8192 samples ≈ 819 s circular grid
const SPIKE_RATE = 0.4; // Hz, ~ the cohort-typical valid-row rate (ADR-0015 recon)
const PEAK_AMP = 0.24; // dF/F₀, a realistic single-event transient (README ROI-1)
const LAMBDA = 2e-3; // explicit Tikhonov strength (ADR-0004); see sensitivity note
const SEED = 12345;

// Planted calcium kernel: tuned to the observed physiology (sharp onset at lag 0,
// peak ≈ +0.6 s, decay τ ≈ 2.7 s — NEXT_SESSION item 2).
const PLANT_PARAMS = { tauRise: 0.22, tauDecay: 2.7 };

const grid = makeGrid({ sampleRate: 1 / DT, duration: N * DT, t0: 0 });
if (grid.n !== N) throw new Error(`grid.n ${grid.n} !== N ${N}`);

// --- build the planted kernel in the length-N circular layout ---------------
// buildKernel gives a causal calcium transient normalized to peak 1 (zeroIndex 0);
// place it at circular index 0 and scale to a realistic peak amplitude.
const planted = buildKernel('calcium', PLANT_PARAMS, DT);
const plantedFull = new Float64Array(N);
for (let i = 0; i < planted.samples.length && i < N; i++) {
  plantedFull[i] = planted.samples[i] * PEAK_AMP;
}
const plantedSym = extractSymmetric(plantedFull, WINDOW_SAMPLES, DT);
const plantedDiag = kernelDiagnostics(plantedSym);

// --- synthetic spike train → binned-count density (the validation path) -----
const rng = mulberry32(SEED);
const nSpikes = Math.round(SPIKE_RATE * N * DT);
const spikeTimes = [];
// keep spikes a few kernel-lengths from the wrap seam so the report is clean
const guardS = 20;
for (let s = 0; s < nSpikes; s++) {
  spikeTimes.push(guardS + rng() * (N * DT - 2 * guardS));
}
spikeTimes.sort((a, b) => a - b);
const { samples: spikeDensity, placed } = rasterize(spikeTimes, grid, {
  amplitudeMode: 'binned-count',
});

// --- clean forward trace ----------------------------------------------------
const cleanTrace = circularConvolve(spikeDensity, plantedFull);
let tracePeak = 0;
for (const v of cleanTrace) if (v > tracePeak) tracePeak = v;

// --- noise sweep across the ADR-0015 slider range ---------------------------
const LEVELS = [0, 0.5, 1, 2, 5, 10];

function fmt(x, p = 4) {
  return Number.isFinite(x) ? x.toFixed(p) : '—';
}

console.log('=== Machinery check — synthetic oracle ===');
console.log(
  `N=${N} (${(N * DT).toFixed(0)} s @ ${(1 / DT).toFixed(0)} Hz)  spikes placed=${placed}  ` +
    `λ=${LAMBDA}  win=±${WIN}s (${2 * WINDOW_SAMPLES + 1} samples)  clean trace peak=${fmt(tracePeak, 3)}`,
);
console.log(
  `PLANTED: peakLag=${fmt(plantedDiag.peakLagS, 2)}s  peakAmp=${fmt(plantedDiag.peakAmp, 3)}  ` +
    `τ=${fmt(plantedDiag.tauDecayS, 2)}s  acausalRatio=${fmt(plantedDiag.acausalRatio, 4)}`,
);
console.log('');
console.log(
  'level   σ(dF/F₀)  SNR   | peakLag  Δlag   peakAmp  ampRatio  τ(s)    Δτ      acausalRatio',
);
console.log(
  '------  --------  ----  | -------  -----  -------  --------  ------  ------  ------------',
);

const rows = [];
for (const level of LEVELS) {
  const sigma = sigmaForLevel(level);
  // fresh seeded stream per level so the run is fully reproducible
  const noiseRng = mulberry32(SEED + Math.round(level * 1000) + 1);
  const trace = addAWGN(cleanTrace, sigma, noiseRng);
  const recovered = recoverKernel(trace, spikeDensity, {
    windowSamples: WINDOW_SAMPLES,
    dt: DT,
    lambda: LAMBDA,
  });
  const diag = kernelDiagnostics(recovered);
  const cmp = compareKernels(diag, plantedDiag);
  const snr = sigma > 0 ? tracePeak / sigma : Infinity;
  rows.push({ level, sigma, snr, diag, cmp });
  console.log(
    `${String(level).padStart(5)}  ${fmt(sigma, 5).padStart(8)}  ${
      Number.isFinite(snr) ? snr.toFixed(0).padStart(4) : ' inf'
    }  | ${fmt(diag.peakLagS, 2).padStart(7)}  ${fmt(cmp.dPeakLagS, 2).padStart(5)}  ${fmt(
      diag.peakAmp,
      3,
    ).padStart(7)}  ${fmt(cmp.ampRatio, 2).padStart(8)}  ${fmt(diag.tauDecayS, 2).padStart(
      6,
    )}  ${fmt(cmp.dTauDecayS, 2).padStart(6)}  ${fmt(diag.acausalRatio, 4).padStart(12)}`,
  );
}

// --- the oracle gate: noise-free recovery must reproduce the planted kernel ---
const clean = rows.find((r) => r.level === 0);
const checks = [
  ['peak lag within ½ sample', Math.abs(clean.cmp.dPeakLagS) <= DT / 2 + 1e-9],
  ['peak amplitude within 5%', Math.abs(clean.cmp.ampRatio - 1) <= 0.05],
  ['decay τ within 10%', Math.abs(clean.cmp.dTauDecayS) <= 0.1 * plantedDiag.tauDecayS],
  ['acausal energy ratio < 0.02', clean.diag.acausalRatio < 0.02],
];

console.log('\n--- oracle gate (noise-free recovery vs planted) ---');
let allPass = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
  if (!pass) allPass = false;
}
console.log(
  allPass
    ? '\nMACHINERY OK — regularized recovery inverts the planted kernel at σ=0.'
    : '\nMACHINERY FAIL — recovery does not reproduce the planted kernel.',
);
process.exit(allPass ? 0 : 1);
