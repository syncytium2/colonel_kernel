// Hand-verifiable self-checks for the Tab 1 non-visual core.
// Pure JS, no deps — run with:  node src/lib/core/core.test.mjs
//
// These assert the trivial cases a human can confirm on paper, so the
// foundation is proven before any UI or animation depends on it.

import { makeGrid, gridFromTimeColumn } from './timebase.js';
import { rasterize } from './rasterize.js';
import { buildKernel, defaultParams } from './kernels.js';
import { convolveLinear, convolveOnGrid } from './convolve.js';
import {
  nextPow2,
  circularConvolve,
  deconvolveCircular,
  extractSymmetric,
  recoverKernel,
} from './deconvolve.js';
import {
  doubleExpCausal,
  doubleExpCausalFull,
  forwardConvolveCausal,
  reconstructParametric,
  recoverKernelParametric,
} from './deconvolve-parametric.js';
import { kernelDiagnostics, compareKernels } from './kernel-diagnostics.js';
import { sigmaForLevel, addAWGN, mulberry32, SIGMA_COHORT_TYPICAL } from './noise.js';
import { loadCsv } from './load-csv.js';
import { spikeTriggeredAverage } from './sta.js';
import * as XLSX from 'xlsx';
import { loadWorkbook, windowRegion, regionsOf, regionViewToLoadedRegion } from './load-xlsx.js';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// --- timebase ---------------------------------------------------------------
const grid = makeGrid({ sampleRate: 100, duration: 2 });
ok('grid n', grid.n === 200, `n=${grid.n}`);
ok('grid dt', approx(grid.dt, 0.01), `dt=${grid.dt}`);
ok('grid times[50]', approx(grid.times[50], 0.5), `t=${grid.times[50]}`);
ok('grid mode authored', grid.mode === 'authored');

// --- rasterize: snap + unit -------------------------------------------------
const r1 = rasterize([0.5], grid, { method: 'snap', amplitudeMode: 'unit' });
ok('snap places at nearest sample', r1.samples[50] === 1 && r1.placed === 1);
ok('snap leaves other bins empty', r1.samples[49] === 0 && r1.samples[51] === 0);

const r2 = rasterize([0.5, 2.5], grid); // 2.5s is past the 2s window
ok('out-of-range spike dropped', r2.placed === 1 && r2.dropped === 1);

const r3 = rasterize([0.5, 0.504], grid); // both round to index 50
ok('unit clamps collision to weight 1', r3.samples[50] === 1);
ok('collision is logged', r3.collisions === 1, `collisions=${r3.collisions}`);

// --- convolveLinear: textbook case -----------------------------------------
// [0,1,0] ⊗ [1,2,3] = [0,1,2,3,0]
const cl = convolveLinear([0, 1, 0], [1, 2, 3]);
ok('linear conv length n+m-1', cl.length === 5);
ok('linear conv values', [0, 1, 2, 3, 0].every((v, i) => approx(cl[i], v)), `[${cl}]`);

// --- the headline hand-verify: spike ⊗ boxcar reproduces the boxcar ---------
const box = buildKernel('boxcar', { length: 0.3 }, grid.dt); // 30 samples of 1
const out = convolveOnGrid(r1.samples, grid, box);
ok('boxcar kernel length', box.samples.length === 30, `len=${box.samples.length}`);
let boxFlat = true;
for (let i = 50; i < 80; i++) if (!approx(out.samples[i], 1)) boxFlat = false;
ok('output = 1 across the boxcar span at the spike', boxFlat);
ok('output zero before the spike', out.samples[49] === 0);
ok('output zero after the boxcar', out.samples[80] === 0);
ok('boxcar output starts at the spike time', approx(out.times[50], 0.5), `t=${out.times[50]}`);

// --- centered Gaussian sits ON the spike (origin alignment) -----------------
const g = buildKernel('gaussian', { sigma: 0.1 }, grid.dt);
const gout = convolveOnGrid(r1.samples, grid, g);
let peakIdx = 0;
for (let i = 1; i < gout.samples.length; i++) if (gout.samples[i] > gout.samples[peakIdx]) peakIdx = i;
ok('gaussian peak ~1', approx(gout.samples[peakIdx], 1, 1e-6));
ok('gaussian peak centered on spike time', approx(gout.times[peakIdx], 0.5), `t=${gout.times[peakIdx]}`);

// --- calcium kernel: causal rise from 0, normalized peak 1 ------------------
const ca = buildKernel('calcium', defaultParams('calcium'), grid.dt);
ok('calcium starts at 0 (causal rise)', approx(ca.samples[0], 0));
let caPeak = 0;
for (const v of ca.samples) if (v > caPeak) caPeak = v;
ok('calcium normalized to peak 1', approx(caPeak, 1, 1e-12));
ok('calcium origin causal', ca.zeroIndex === 0);

// --- binned-count: reproduce MATLAB hist(spikes, timing) EXACTLY (ADR-0001/§13) ---
// Integer-exact centers so the midpoint tie-break is float-safe.
// centers [0,1,2,3] -> edges 0.5, 1.5, 2.5; max=3 (pre-filter `< 3`).
//   bin0 [-inf,0.5) bin1 [0.5,1.5) bin2 [1.5,2.5) bin3 [2.5,3)
// spikes: -0.2 below-first->bin0; 0.5 ON edge->upper bin1; 0.7->bin1; 1.5 ON
//   edge->upper bin2; 2.9->bin3; 3.0 ==max->dropped; 3.5 above->dropped.
const bcGrid = gridFromTimeColumn([0, 1, 2, 3]);
const bc = rasterize([-0.2, 0.5, 0.7, 1.5, 2.9, 3.0, 3.5], bcGrid, { amplitudeMode: 'binned-count' });
ok('binned-count exact count vector [1,2,1,1]', [1, 2, 1, 1].every((v, i) => bc.samples[i] === v), `[${bc.samples}]`);
ok('binned-count placed=5 dropped=2', bc.placed === 5 && bc.dropped === 2, `placed=${bc.placed} dropped=${bc.dropped}`);
ok('midpoint tie -> UPPER bin (0.5->bin1, 1.5->bin2)', bc.samples[1] === 2 && bc.samples[2] === 1);
ok('below-first-center counted in bin 0', bc.samples[0] === 1);
ok('spike == max(timing) is dropped (strict pre-filter)', bc.placed === 5);

// Float-safe 0.1-spaced centers, spikes deliberately OFF the edges.
// centers [0.1..0.4] -> edges ~0.15,0.25,0.35; spikes 0.12,0.18,0.22,0.31,0.39.
const bc2 = rasterize([0.12, 0.18, 0.22, 0.31, 0.39], gridFromTimeColumn([0.1, 0.2, 0.3, 0.4]), {
  amplitudeMode: 'binned-count',
});
ok('binned-count 0.1-spaced counts [1,2,1,1]', [1, 2, 1, 1].every((v, i) => bc2.samples[i] === v), `[${bc2.samples}]`);

// Jittery (non-uniform) centers: bins follow the REAL centers, not a uniform dt.
// centers [0,0.1,0.2,1.0] -> last edge midpoint(0.2,1.0)=0.6. spike 0.62 > 0.6
// -> last bin (3); a uniform-dt grid (dt=0.333) would misplace it to bin 2.
const bc3 = rasterize([0.04, 0.62], gridFromTimeColumn([0, 0.1, 0.2, 1.0]), { amplitudeMode: 'binned-count' });
ok('binned bins follow real centers (0.62->bin3, not bin2)', bc3.samples[3] === 1 && bc3.samples[2] === 0, `[${bc3.samples}]`);
ok('jittery below-first in bin 0', bc3.samples[0] === 1);

// --- preFirstBin: keep (default) vs drop (ADR-0013) --------------------------
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Explicit 'keep' must equal the default — locks default == keep.
const bcKeepExplicit = rasterize([-0.2, 0.5, 0.7, 1.5, 2.9, 3.0, 3.5], bcGrid, {
  amplitudeMode: 'binned-count',
  preFirstBin: 'keep',
});
ok('explicit keep == default output', eq(bcKeepExplicit.samples, bc.samples) && bcKeepExplicit.dropped === bc.dropped);

// Fixture with a pre-first-bin spike (-0.2) and NO upper-out-of-range spikes.
// centers [0,1,2,3]: -0.2 pre-first; 0.7->bin1; 1.7->bin2; 2.9->bin3.
const pfSpikes = [-0.2, 0.7, 1.7, 2.9];
const pfKeep = rasterize(pfSpikes, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
const pfDrop = rasterize(pfSpikes, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'drop' });
ok('keep: pre-first-bin spike lands in bin 0', pfKeep.samples[0] === 1);
ok('keep: dropped === 0 (nothing removed)', pfKeep.dropped === 0, `dropped=${pfKeep.dropped}`);
ok('drop: pre-first-bin spike absent everywhere', pfDrop.samples[0] === 0 && pfDrop.placed === 3);
ok('drop: dropped === count of pre-first-bin spikes (1)', pfDrop.dropped === 1, `dropped=${pfDrop.dropped}`);
ok(
  'drop: in-range bins bit-identical to keep (only bin 0 differs)',
  eq([...pfDrop.samples.slice(1)], [...pfKeep.samples.slice(1)]),
  `keep=[${pfKeep.samples}] drop=[${pfDrop.samples}]`,
);

// Fixture with NO pre-first-bin spike (0.0 == first center is NOT pre-first):
// the option is a no-op — identical output and dropped===0 under both.
const noPf = [0, 0.7, 1.7, 2.9];
const npKeep = rasterize(noPf, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
const npDrop = rasterize(noPf, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'drop' });
ok(
  'no pre-first-bin: keep == drop, both dropped 0',
  eq([...npKeep.samples], [...npDrop.samples]) && npKeep.dropped === 0 && npDrop.dropped === 0,
);

// Invalid value throws.
ok(
  'unknown preFirstBin throws',
  throws(() => rasterize([0.5], bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'bogus' })),
);

// --- stubs throw behind the shared interface (ADR-0001) ---------------------
ok('antialias stub throws', throws(() => rasterize([0.5], grid, { method: 'antialias' })));

// --- noise model (ADR-0015) -------------------------------------------------
ok('nextPow2', nextPow2(8000) === 8192 && nextPow2(8192) === 8192 && nextPow2(5) === 8);
ok('sigmaForLevel 1x == cohort-typical', approx(sigmaForLevel(1), SIGMA_COHORT_TYPICAL));
ok('sigmaForLevel 0 == 0, clamps >10', sigmaForLevel(0) === 0 && approx(sigmaForLevel(99), 10 * SIGMA_COHORT_TYPICAL));
const clean = new Float64Array([1, 1, 1, 1]);
ok('addAWGN sigma=0 is a faithful copy', addAWGN(clean, 0).every((v) => v === 1));
// seeded AWGN: empirical std of a large draw lands near sigma
const big = new Float64Array(20000);
const noisy = addAWGN(big, 0.01, mulberry32(7));
let mean = 0;
for (const v of noisy) mean += v;
mean /= noisy.length;
let varr = 0;
for (const v of noisy) varr += (v - mean) ** 2;
const std = Math.sqrt(varr / noisy.length);
ok('addAWGN std ≈ sigma (seeded)', Math.abs(std - 0.01) < 0.0005, `std=${std}`);

// --- deconvolution round-trip (ADR-0004) ------------------------------------
// circularConvolve then deconvolveCircular(λ=0) recovers the planted signal.
const Ntest = 64;
const sDens = new Float64Array(Ntest); // a few unit spikes
sDens[3] = 1; sDens[10] = 1; sDens[10] += 1; sDens[40] = 1; // bin 10 has count 2
const plant = new Float64Array(Ntest);
// short causal bump at lag 0 (indices 0..3)
plant[0] = 0.1; plant[1] = 0.24; plant[2] = 0.12; plant[3] = 0.04;
const conv = circularConvolve(sDens, plant);
const latent = deconvolveCircular(conv, sDens, 0); // λ=0 exact inverse
ok('deconv λ=0 inverts circular conv', plant.every((v, i) => approx(latent[i], v, 1e-6)), `latent0=${latent[0]}`);

// extractSymmetric: zero-lag at window, negatives wrap from the high end.
const sym = extractSymmetric(latent, 5, 0.1);
ok('extractSymmetric length & zeroIndex', sym.samples.length === 11 && sym.zeroIndex === 5);
ok('extractSymmetric zero-lag = latent[0]', approx(sym.samples[5], latent[0], 1e-9));
ok('extractSymmetric +1 lag = latent[1]', approx(sym.samples[6], latent[1], 1e-9));
ok('extractSymmetric −1 lag wraps to latent[N-1]', approx(sym.samples[4], latent[Ntest - 1], 1e-9));
ok('extractSymmetric times centered', approx(sym.times[5], 0) && approx(sym.times[6], 0.1) && approx(sym.times[4], -0.1));

// --- kernel diagnostics (ADR-0014) ------------------------------------------
// Known causal kernel: peak at lag +0.2 s, clean exponential decay τ.
const dt2 = 0.1;
const kd = { zeroIndex: 3, dt: dt2, samples: new Float64Array(13) };
// negative-lag (indices 0..2) left at 0; peak at index 5 (lag +0.2)
kd.samples[3] = 0.0; kd.samples[4] = 0.5; kd.samples[5] = 1.0;
for (let i = 6; i < 13; i++) kd.samples[i] = Math.exp(-((i - 5) * dt2) / 0.4); // τ=0.4 from peak
const dg = kernelDiagnostics(kd);
ok('diagnostics peak lag +0.2 s', approx(dg.peakLagS, 0.2, 1e-9), `peakLag=${dg.peakLagS}`);
ok('diagnostics peak amp 1.0', approx(dg.peakAmp, 1.0));
ok('diagnostics τ ≈ 0.4 s', Math.abs(dg.tauDecayS - 0.4) < 0.02, `τ=${dg.tauDecayS}`);
ok('diagnostics acausal ≈ 0 (causal kernel)', dg.acausalRatio < 1e-9, `ratio=${dg.acausalRatio}`);
const cmp = compareKernels(dg, dg);
ok('compareKernels self → zero deltas, ampRatio 1', approx(cmp.dPeakLagS, 0) && approx(cmp.ampRatio, 1));

// --- end-to-end: recover a planted calcium kernel at σ=0 (oracle in miniature)
const gridN = makeGrid({ sampleRate: 10, duration: nextPow2(1024) / 10, t0: 0 });
const Nk = gridN.n;
const sd = rasterize([20, 35, 35, 60, 80], gridN, { amplitudeMode: 'binned-count' }).samples;
const caK = buildKernel('calcium', { tauRise: 0.22, tauDecay: 2.7 }, 0.1);
const plantedFull = new Float64Array(Nk);
for (let i = 0; i < caK.samples.length && i < Nk; i++) plantedFull[i] = caK.samples[i] * 0.24;
const trace0 = circularConvolve(sd, plantedFull);
const rec = recoverKernel(trace0, sd, { windowSamples: 50, dt: 0.1, lambda: 2e-3 });
const recDg = kernelDiagnostics(rec);
const plDg = kernelDiagnostics(extractSymmetric(plantedFull, 50, 0.1));
ok('oracle(mini): peak lag recovered within ½ sample', Math.abs(recDg.peakLagS - plDg.peakLagS) <= 0.05 + 1e-9, `rec=${recDg.peakLagS} pl=${plDg.peakLagS}`);
ok('oracle(mini): peak amp within 5%', Math.abs(recDg.peakAmp / plDg.peakAmp - 1) <= 0.05, `ratio=${recDg.peakAmp / plDg.peakAmp}`);
ok('oracle(mini): acausal ratio < 0.02', recDg.acausalRatio < 0.02, `ratio=${recDg.acausalRatio}`);

// --- constrained-parametric recovery (ADR-0021 method 2) --------------------
// doubleExpCausal: anchored t=0 (lag-0 value is exactly 0), rises then decays.
const decK = doubleExpCausal({ tauRise: 0.1, tauDecay: 1.0, amp: 1 }, 50, 0.1);
ok('doubleExp k[0]=0 (zero baseline, anchored t=0)', decK[0] === 0);
ok('doubleExp rises off zero then is positive', decK[1] > 0 && decK[5] > 0);
{
  // analytic peak lag t* = ln(τd/τr)·(τr·τd)/(τd−τr) ≈ 0.2558 s for (0.1, 1.0)
  let bi = 0;
  for (let i = 1; i < decK.length; i++) if (decK[i] > decK[bi]) bi = i;
  ok('doubleExp peak near analytic t* (~0.26 s)', Math.abs(bi * 0.1 - 0.2558) <= 0.1, `peak=${bi * 0.1}`);
}

// forwardConvolveCausal: a single unit spike stamps the kernel at the spike index.
{
  const d = new Float64Array(8); d[2] = 1;
  const kk = Float64Array.from([0, 0.5, 0.25]);
  const y = forwardConvolveCausal(d, kk, 8);
  ok('forwardConvolveCausal stamps causal kernel at spike',
    y[2] === 0 && y[3] === 0.5 && y[4] === 0.25 && y[0] === 0,
    `[${Array.from(y)}]`);
}

// Recover a KNOWN planted double-exponential from a synthetic trace. Plant θ,
// forward-convolve a binned-count density with it, then fit and confirm θ + the
// kernel contract come back within tolerance.
{
  const dtP = 0.1;
  const wsP = 50;                       // ±5 s window → kernel length 101
  const Mp = 1024;
  const gP = makeGrid({ sampleRate: 10, duration: Mp / 10, t0: 0 });
  const densP = rasterize([12, 12, 27, 41, 63, 78, 95], gP, { amplitudeMode: 'binned-count' }).samples;
  const truth = { tauRise: 0.18, tauDecay: 1.4, amp: 0.22 };
  const truthK = doubleExpCausal(truth, wsP, dtP);
  const tracePlanted = forwardConvolveCausal(densP, truthK, Mp);
  const fitRes = recoverKernelParametric(tracePlanted, densP, { windowSamples: wsP, dt: dtP });

  // (1) ADR-0009 contract shape.
  ok('parametric: contract length 2·ws+1', fitRes.samples.length === 2 * wsP + 1);
  ok('parametric: zeroIndex = ws, dt carried', fitRes.zeroIndex === wsP && approx(fitRes.dt, dtP));
  ok('parametric: times centered at zeroIndex', approx(fitRes.times[wsP], 0) && approx(fitRes.times[wsP + 1], dtP) && approx(fitRes.times[wsP - 1], -dtP));
  // (2) zero baseline by construction (lag-0 sample is exactly 0).
  ok('parametric: zero baseline at lag 0', fitRes.samples[wsP] === 0);
  // (3) causal — every negative-lag sample is identically zero.
  let negAllZero = true;
  for (let i = 0; i < wsP; i++) if (fitRes.samples[i] !== 0) negAllZero = false;
  ok('parametric: causal (negative lags all zero)', negAllZero);
  const pDg = kernelDiagnostics(fitRes);
  ok('parametric: acausalRatio exactly 0 (causal by construction)', pDg.acausalRatio === 0, `ratio=${pDg.acausalRatio}`);
  // (4) recovers the planted θ within tolerance.
  ok('parametric: recovers τ_rise within 10%', Math.abs(fitRes.fit.theta.tauRise / truth.tauRise - 1) <= 0.1, `τr=${fitRes.fit.theta.tauRise}`);
  ok('parametric: recovers τ_decay within 10%', Math.abs(fitRes.fit.theta.tauDecay / truth.tauDecay - 1) <= 0.1, `τd=${fitRes.fit.theta.tauDecay}`);
  ok('parametric: recovers amp within 10%', Math.abs(fitRes.fit.theta.amp / truth.amp - 1) <= 0.1, `amp=${fitRes.fit.theta.amp}`);
  ok('parametric: τ_decay reported as a real number (no n/a tilt)', Number.isFinite(fitRes.fit.theta.tauDecay));
  ok('parametric: near-perfect reconstruction on noise-free plant (R²>0.99)', fitRes.fit.r2 > 0.99, `r2=${fitRes.fit.r2}`);
  // peak lag matches the planted transient's analytic peak.
  const tStar = (Math.log(truth.tauDecay / truth.tauRise) * (truth.tauRise * truth.tauDecay)) / (truth.tauDecay - truth.tauRise);
  ok('parametric: peak lag matches planted (within ½ sample)', Math.abs(fitRes.fit.peakLagS - tStar) <= dtP / 2 + 1e-9, `peak=${fitRes.fit.peakLagS} t*=${tStar}`);
}

// --- Option B: full-analytic-kernel reconstruction (no ±window tail clipping) ---
// When τ_decay is LONG relative to the display window, the ±ws slice clips the
// decay tail. The reconstruction must use the FULL analytic kernel (~5·τdecay), not
// the truncated array, so the residual is honest — not decoupling-plus-clipping.
{
  const dtB = 0.1;
  const wsB = 10;                      // display window ±1.0 s — DELIBERATELY short
  const Mb = 512;
  const gB = makeGrid({ sampleRate: 10, duration: Mb / 10, t0: 0 });
  const densB = rasterize([8, 8, 19, 33, 47], gB, { amplitudeMode: 'binned-count' }).samples;
  const thetaB = { tauRise: 0.15, tauDecay: 1.0, amp: 0.3 }; // 5·τ = 5.0 s = 50 samples ≫ ws

  // doubleExpCausalFull extends well past the display window; the floor keeps it ≥ ws.
  const full = doubleExpCausalFull(thetaB, dtB, wsB);
  ok('doubleExpCausalFull extends past the ±window (tail not clipped)', full.length > wsB + 1, `len=${full.length}`);
  ok('doubleExpCausalFull reaches ~5·τdecay', Math.abs(full.length - 1 - Math.ceil(5 * thetaB.tauDecay / dtB)) <= 1, `len=${full.length}`);
  ok('doubleExpCausalFull floor honored (≥ minSamples)', doubleExpCausalFull({ ...thetaB, tauDecay: 0.05 }, dtB, wsB).length === wsB + 1);

  // Truth trace generated with the FULL kernel (real tails present).
  const truthFull = doubleExpCausalFull(thetaB, dtB, wsB);
  const truth = forwardConvolveCausal(densB, truthFull, Mb);

  // Truncated reconstruction (±ws kernel) CLIPS the tail; full reconstruction is exact.
  const reconTrunc = forwardConvolveCausal(densB, doubleExpCausal(thetaB, wsB, dtB), Mb);
  const reconFull = reconstructParametric(densB, thetaB, dtB, Mb, wsB);
  let maxTrunc = 0, maxFull = 0;
  for (let i = 0; i < Mb; i++) {
    maxTrunc = Math.max(maxTrunc, Math.abs(truth[i] - reconTrunc[i]));
    maxFull = Math.max(maxFull, Math.abs(truth[i] - reconFull[i]));
  }
  ok('Option B: full reconstruction matches the full-kernel truth (exact)', maxFull < 1e-12, `maxFull=${maxFull}`);
  ok('Option B: truncated reconstruction visibly clips the tail', maxTrunc > 1e-3, `maxTrunc=${maxTrunc}`);
  ok('Option B: full reconstruction is strictly better than truncated', maxFull < maxTrunc);

  // recoverKernelParametric reports the FULL-kernel R² (not the clipped one). With the
  // truth made from the full kernel, the reported R² is near-perfect.
  const recB = recoverKernelParametric(truth, densB, { windowSamples: wsB, dt: dtB });
  ok('Option B: recoverKernelParametric reports full-kernel R² (>0.99 on full-kernel truth)', recB.fit.r2 > 0.99, `r2=${recB.fit.r2}`);
  // The returned display contract is still the ±ws slice (unchanged ADR-0009 object).
  ok('Option B: returned contract is still the ±ws slice', recB.samples.length === 2 * wsB + 1 && recB.zeroIndex === wsB);
}

// --- CSV loader (ADR-0016) --------------------------------------------------
// Canonical small region: dense time + roi1/roi2, ragged spikes (blank below the
// last spike), one NaN trace sample. Headers carry stray whitespace to prove the
// role detection trims.
const csvText = [
  'time, spikes , roi1,roi2',
  '0.0,0.05,0.1,0.5',
  '0.1,0.15,0.2,0.6',
  '0.2,,0.3,NaN',
  '0.3,,0.4,0.8',
].join('\n');
const L = loadCsv(csvText, { source: 'unit.csv' });
ok('loadCsv grid is loaded-mode, n & dt from time column', L.grid.mode === 'loaded' && L.grid.n === 4 && approx(L.grid.dt, 0.1));
ok('loadCsv detects 2 roi columns (trimmed ids, file order)', L.rois.length === 2 && L.rois[0].id === 'roi1' && L.rois[1].id === 'roi2');
ok('loadCsv roi1 dense samples', [0.1, 0.2, 0.3, 0.4].every((v, i) => approx(L.rois[0].samples[i], v)), `[${L.rois[0].samples}]`);
ok('loadCsv preserves NaN trace sample', Number.isNaN(L.rois[1].samples[2]));
ok('loadCsv ragged spikes: only the 2 finite values, ascending', L.spikeTimes.length === 2 && approx(L.spikeTimes[0], 0.05) && approx(L.spikeTimes[1], 0.15));
ok('loadCsv meta counts', L.meta.nFrames === 4 && L.meta.nROIs === 2 && L.meta.nSpikes === 2);
ok('loadCsv warns about the NaN roi column', L.warnings.some((w) => w.includes('non-finite')));
// end-to-end: loaded spikes rasterize on the loaded grid (binned-count path)
const ld = rasterize(L.spikeTimes, L.grid, { amplitudeMode: 'binned-count' });
ok('loadCsv → binned-count places both spikes', ld.placed === 2, `placed=${ld.placed}`);
// machinery gates (hard errors)
ok('loadCsv throws on missing time column', throws(() => loadCsv('spikes,roi1\n0,0.1\n1,0.2')));
ok('loadCsv throws with no roi columns', throws(() => loadCsv('time,spikes\n0,0.1\n0.1,0.2')));
ok('loadCsv throws on non-increasing time', throws(() => loadCsv('time,roi1\n0,0.1\n0,0.2')));
ok('loadCsv throws on < 2 data rows', throws(() => loadCsv('time,roi1\n0,0.1')));
// out-of-window spike → warning, not an error
const Lw = loadCsv('time,spikes,roi1\n0,0.05,0.1\n0.1,9.9,0.2\n0.2,,0.3');
ok('loadCsv warns on out-of-window spike', Lw.warnings.some((w) => w.includes('outside the time window')));

// --- STA (ADR-0005, spikeTriggeredAverage.m) --------------------------------
// Helper: dense uniform timebase + a trace built by stamping one causal "kernel"
// shape at each spike sample. STA must average those windows back to the shape.
const staDt = 0.1;
const staN = 600; // 60 s at 10 Hz
const staTimes = new Float64Array(staN);
for (let i = 0; i < staN; i++) staTimes[i] = i * staDt;
// Causal shape: 0 at the spike, ramp to a peak at +0.2 s (m=2), exp(−t/0.4) decay.
const KSH = new Float64Array(21);
KSH[0] = 0.0; KSH[1] = 0.5;
for (let m = 2; m < 21; m++) KSH[m] = Math.exp(-((m - 2) * staDt) / 0.4); // KSH[2]=1.0 peak
function stampTrace(spikeSamples, dc = 0) {
  const tr = new Float64Array(staN).fill(dc);
  for (const s0 of spikeSamples) for (let m = 0; m < KSH.length && s0 + m < staN; m++) tr[s0 + m] += KSH[m];
  return tr;
}
// These tests place spikes exactly on grid points and use tolerance 0.05 (< dt) so
// each spike matches its own frame deterministically. With the default 0.1 s
// tolerance a grid-aligned spike also falls within 0.1 s of the PREVIOUS frame, so
// find(...,1) would match that lower neighbor — faithful to the lab code, but it
// would shift the window a sample and is not what these averaging assertions probe.
// Spikes 6 s apart at exact sample times → exact tindex; first/last skipped, 7 interior accepted.
const staSpikes = [6, 12, 18, 24, 30, 36, 42, 48, 54];
const trA = stampTrace(staSpikes.map((t) => Math.round(t / staDt)));
const staA = spikeTriggeredAverage(staSpikes, trA, staTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
ok('STA length 2·windowSamples+1', staA.samples.length === 41 && staA.windowSamples === 20, `len=${staA.samples.length}`);
ok('STA zeroIndex = windowSamples (t=0 at center)', staA.zeroIndex === 20 && approx(staA.times[20], 0));
ok('STA times symmetric ±window', approx(staA.times[40], 2) && approx(staA.times[0], -2) && approx(staA.times[22], 0.2));
ok('STA endpoints skipped → 7 of 9 accepted, none blocked', staA.nAccepted === 7 && staA.nBlocked === 0, `acc=${staA.nAccepted} blk=${staA.nBlocked}`);
ok('STA recovers the stamped peak at lag +0.2 s', approx(staA.samples[22], 1.0, 1e-9), `peak=${staA.samples[22]}`);
ok('STA pre-spike samples ≈ 0 (causal shape)', approx(staA.samples[20], 0, 1e-9) && approx(staA.samples[19], 0, 1e-9));

// Baseline zeroing: same shape on a constant DC pedestal → STA subtracts it away.
const trDC = stampTrace(staSpikes.map((t) => Math.round(t / staDt)), 3.0);
const staDC = spikeTriggeredAverage(staSpikes, trDC, staTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
ok('STA per-event baseline removes the DC pedestal', approx(staDC.samples[22], 1.0, 1e-9) && approx(staDC.samples[19], 0, 1e-9), `peak=${staDC.samples[22]}`);

// Overlap rejection: a neighbor within block = 0.5·window = 1 s blocks both.
const ovSpikes = [6, 30, 30.4, 54];
const ovTrace = stampTrace(ovSpikes.map((t) => Math.round(t / staDt)));
const staOv = spikeTriggeredAverage(ovSpikes, ovTrace, staTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
ok('STA blocks overlapping events (both 30 & 30.4) → empty', staOv.empty && staOv.nAccepted === 0 && staOv.nBlocked === 2, `acc=${staOv.nAccepted} blk=${staOv.nBlocked}`);
ok('STA empty result still carries lag geometry', staOv.samples.length === 0 && staOv.zeroIndex === 20 && staOv.times.length === 41);

// First/last structurally skipped: with 3 spikes only the middle is eligible.
const triSpikes = [6, 30, 54];
const staTri = spikeTriggeredAverage(triSpikes, stampTrace(triSpikes.map((t) => Math.round(t / staDt))), staTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
ok('STA skips first & last event (1 of 3 used)', staTri.nAccepted === 1, `acc=${staTri.nAccepted}`);

// omitnan: a NaN inside one event's averaging window drops only that lag's sample,
// not the whole STA — the surviving identical windows still average to the shape.
const trNaN = stampTrace(staSpikes.map((t) => Math.round(t / staDt)));
trNaN[Math.round(12 / staDt) + 2] = NaN; // peak sample of the first accepted event (spike 12)
const staNaN = spikeTriggeredAverage(staSpikes, trNaN, staTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
ok('STA omitnan: peak still recovered from the other events', approx(staNaN.samples[22], 1.0, 1e-9) && Number.isFinite(staNaN.samples[22]));

// machinery gate: malformed inputs are hard errors (fit is never gated here).
ok('STA throws on signal/time length mismatch', throws(() => spikeTriggeredAverage([10], new Float64Array(5), new Float64Array(4), { window: 1, baseline: 0.2 })));
ok('STA throws on window ≤ 0', throws(() => spikeTriggeredAverage([10], trA, staTimes, { window: 0, baseline: 0.2 })));

// --- cross-method agreement (FOUNDATIONS §3 check 4) ------------------------
// Plant the calcium kernel, stamp it at far-apart spikes, and confirm the STA
// waveform's diagnostics agree with the planted kernel — the leg the deconv
// machinery check does not exercise (the reason STA exists, ADR-0005).
const caKsta = buildKernel('calcium', { tauRise: 0.22, tauDecay: 2.7 }, staDt);
const PEAK_AMP = 0.24;
const caBig = new Float64Array(2000); // 200 s at 10 Hz
const caTimes = new Float64Array(2000);
for (let i = 0; i < 2000; i++) caTimes[i] = i * staDt;
const caSpikes = [20, 60, 100, 140, 180]; // 40 s apart → tails fully decayed between events
for (const t of caSpikes) {
  const s0 = Math.round(t / staDt);
  for (let m = 0; m < caKsta.samples.length && s0 + m < 2000; m++) caBig[s0 + m] += caKsta.samples[m] * PEAK_AMP;
}
const caSTA = spikeTriggeredAverage(caSpikes, caBig, caTimes, { window: 2, baseline: 0.5, tolerance: 0.05 });
const caSTAdg = kernelDiagnostics(caSTA);
// planted peak lag = argmax of the causal calcium shape × dt
let pkArg = 0;
for (let m = 1; m < caKsta.samples.length; m++) if (caKsta.samples[m] > caKsta.samples[pkArg]) pkArg = m;
const plantedPeakLag = pkArg * staDt;
ok('STA cross-method: 3 interior events accepted', caSTA.nAccepted === 3, `acc=${caSTA.nAccepted}`);
ok('STA cross-method: peak lag agrees with planted kernel (≤ ½ sample)', Math.abs(caSTAdg.peakLagS - plantedPeakLag) <= staDt / 2 + 1e-9, `sta=${caSTAdg.peakLagS} planted=${plantedPeakLag}`);
ok('STA cross-method: peak amp within 5 % of planted', Math.abs(caSTAdg.peakAmp / (caKsta.samples[pkArg] * PEAK_AMP) - 1) <= 0.05, `ratio=${caSTAdg.peakAmp / (caKsta.samples[pkArg] * PEAK_AMP)}`);
ok('STA cross-method: causal shape, acausal energy small', caSTAdg.acausalRatio < 0.05, `ratio=${caSTAdg.acausalRatio}`);

// --- xlsx ingest spine (ADR-0019) -------------------------------------------
// Synthetic, data-safe workbooks built in-memory (the real goldens are
// unpublished-data-derived and stay out of the repo, §6 — they are exercised by
// the separate `npm run xlsx-acceptance` script).
function makeXlsx({ trace, spikes, metadata, names = {} }) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trace), names.trace ?? 'trace');
  if (spikes !== undefined) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(spikes), names.spikes ?? 'spikes');
  if (metadata !== undefined) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metadata), names.metadata ?? 'metadata');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
// a 0..5.0 s @ dt=0.1 recording (51 frames), 2 roi cols (roi2 carries one NaN)
const xtTrace = [['time', 'cellA', 'cellB']];
for (let i = 0; i < 51; i++) xtTrace.push([i * 0.1, i, i === 3 ? '' : 100 + i]);
const xtSpikes = [['spikes'], [2.0], [1.0], [3.0]]; // unsorted on purpose
const xtMeta = [
  ['region', 'start_s', 'end_s'],
  ['A', 0, 2.5],
  ['B', 2.6, 10], // end_s 10 > tEnd 5.0 (ADR-0020 overhang)
];
const wbBuf = makeXlsx({ trace: xtTrace, spikes: xtSpikes, metadata: xtMeta });
const REC = loadWorkbook(wbBuf, { source: 'synthetic.xlsx' });

ok('xlsx: dt derived from time column (ADR-0012)', approx(REC.meta.dt, 0.1), `dt=${REC.meta.dt}`);
ok('xlsx: nFrames / nROIs / nSpikes', REC.meta.nFrames === 51 && REC.meta.nROIs === 2 && REC.meta.nSpikes === 3);
ok('xlsx: t0 / tEnd', approx(REC.meta.t0, 0) && approx(REC.meta.tEnd, 5.0));
ok('xlsx: first roi column positionally = targeted (header name kept)', REC.rois[0].id === 'cellA' && REC.rois[1].id === 'cellB');
ok('xlsx: spikes nan-stripped + sorted ascending', REC.spikeTimes.length === 3 && approx(REC.spikeTimes[0], 1.0) && approx(REC.spikeTimes[2], 3.0));
ok('xlsx: NaN roi cell preserved as non-finite', !Number.isFinite(REC.rois[1].samples[3]));
ok('xlsx: NaN roi warning present', REC.warnings.some((w) => w.includes('non-finite')));
ok('xlsx: 2 metadata regions, sorted', REC.regions.length === 2 && REC.regions[0].name === 'A' && REC.regions[1].name === 'B');
ok('xlsx: end_s > tEnd read RAW, not clamped (ADR-0020)', REC.regions[1].endS === 10);

// windowing — region A [0,2.5] selects spikes 1.0,2.0; default buffer 1.0 s → 10 samples
const wA = windowRegion(REC, REC.regions[0]);
ok('xlsx win A: analyzable', wA.analyzable === true);
ok('xlsx win A: spikeCount 2', wA.spikeCount === 2);
ok('xlsx win A: bufferSamples = round(1.0/dt) = 10', wA.window.bufferSamples === 10);
ok('xlsx win A: bracket [firstIdx-10, lastIdx+10] = [0,30]', wA.window.startIdx === 0 && wA.window.endIdx === 30, `[${wA.window.startIdx},${wA.window.endIdx}]`);
ok('xlsx win A: windowed grid length 31, rois sliced to match', wA.grid.n === 31 && wA.rois[0].samples.length === 31);
ok('xlsx win A: start clamp warned (firstIdx-10 = 0 boundary, no clamp)', wA.warnings.length === 0, `[${wA.warnings}]`);

// region B [2.6,10] selects only spike 3.0 → single-spike degenerate (ADR-0019 §7)
const wB = windowRegion(REC, REC.regions[1]);
ok('xlsx win B: single spike → non-analyzable, no throw', wB.analyzable === false && wB.spikeCount === 1);
ok('xlsx win B: reason distinguishes 1 spike', wB.reason.includes('(1 spike)'));
ok('xlsx win B: non-analyzable carries null grid/rois', wB.grid === null && wB.rois === null);

// buffer_s override + non-clamped interior window
const wbBuf2 = makeXlsx({
  trace: xtTrace,
  spikes: [['spikes'], [1.0], [2.0]],
  metadata: [['region', 'start_s', 'end_s', 'buffer_s'], ['C', 0, 5, 0.2]],
});
const REC2 = loadWorkbook(wbBuf2);
const wC = windowRegion(REC2, REC2.regions[0]);
ok('xlsx: buffer_s override honored (0.2 s → 2 samples)', wC.window.bufferSamples === 2);
ok('xlsx win C: interior bracket [10-2, 20+2] = [8,22]', wC.window.startIdx === 8 && wC.window.endIdx === 22, `[${wC.window.startIdx},${wC.window.endIdx}]`);

// no metadata → one default region over the full trace, bracketed to all spikes
const wbBuf3 = makeXlsx({ trace: xtTrace, spikes: [['spikes'], [1.0], [3.0]] });
const REC3 = loadWorkbook(wbBuf3);
const regs3 = regionsOf(REC3);
ok('xlsx: no metadata → 1 default region spanning full trace', regs3.length === 1 && approx(regs3[0].startS, 0) && approx(regs3[0].endS, 5.0));
ok('xlsx: no-metadata warning present', REC3.warnings.some((w) => w.includes('default region')));
const wD = windowRegion(REC3, regs3[0]);
ok('xlsx: default region brackets to spikes (analyzable)', wD.analyzable === true && wD.spikeCount === 2);

// empty-spikes whole recording → reads fine; every region non-analyzable, no throw
const wbEmpty = makeXlsx({ trace: xtTrace, spikes: [['spikes']], metadata: xtMeta });
const RECe = loadWorkbook(wbEmpty);
ok('xlsx: empty spikes sheet → nSpikes 0, no throw', RECe.meta.nSpikes === 0);
const wEmpty = windowRegion(RECe, RECe.regions[0]);
ok('xlsx: empty-spikes region → non-analyzable, reason distinguishes 0', wEmpty.analyzable === false && wEmpty.reason.includes('(0 spikes)'));

// sheet-name match is case-insensitive (ADR-0019)
const wbCase = makeXlsx({ trace: xtTrace, spikes: xtSpikes, names: { trace: 'TRACE', spikes: 'Spikes' } });
ok('xlsx: sheet names matched case-insensitively', loadWorkbook(wbCase).meta.nROIs === 2);

// adapter: RegionView → loadCsv shape (so the xlsx path feeds the existing readout)
const adapted = regionViewToLoadedRegion(wA, { source: 'syn — A' });
ok('xlsx adapter: loadCsv-shaped (grid/spikeTimes/rois/meta/warnings)', !!adapted.grid && !!adapted.spikeTimes && !!adapted.rois && !!adapted.meta);
ok('xlsx adapter: meta.t0/tEnd from windowed grid edges', approx(adapted.meta.t0, wA.grid.times[0]) && approx(adapted.meta.tEnd, wA.grid.times[wA.grid.n - 1]));
ok('xlsx adapter: meta counts + dt match the window', adapted.meta.nFrames === wA.grid.n && adapted.meta.nROIs === wA.rois.length && approx(adapted.meta.dt, wA.grid.dt));
ok('xlsx adapter: rois[0] preserved as targeted', adapted.rois[0].id === wA.rois[0].id);
ok('xlsx adapter: throws on a non-analyzable region', throws(() => regionViewToLoadedRegion(wB)));

// machinery gates — hard errors
ok('xlsx: missing trace sheet throws', throws(() => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(xtSpikes), 'spikes');
  loadWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}));
ok('xlsx: missing spikes sheet throws', throws(() => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(xtTrace), 'trace');
  loadWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}));
ok('xlsx: non-increasing time throws', throws(() => loadWorkbook(makeXlsx({
  trace: [['time', 'r1'], [0, 1], [0, 2], [0.2, 3]],
  spikes: [['spikes'], [0.1]],
}))));
ok('xlsx: overlapping regions throw', throws(() => loadWorkbook(makeXlsx({
  trace: xtTrace,
  spikes: xtSpikes,
  metadata: [['region', 'start_s', 'end_s'], ['A', 0, 2.5], ['B', 2.0, 4]],
}))));
ok('xlsx: metadata missing required column throws', throws(() => loadWorkbook(makeXlsx({
  trace: xtTrace,
  spikes: xtSpikes,
  metadata: [['region', 'start_s'], ['A', 0]],
}))));

// --- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
