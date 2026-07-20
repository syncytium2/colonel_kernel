// Export the 8 HUMAN-IDENTIFIED baseline ROI-1 kernels for the MLspike team.
//
// Source of the 8: docs/reviews/kernel-review-baseline-2026-07-19.md — Tony's eyeball
// verdict, which per ADR-0011/0018 is the authority on whether a kernel is real. The
// machine screen (scan_kernels.mjs) is a screen, never a verdict; where they disagree,
// the human list wins. That is why `fit_ok` below is the HUMAN column and the screen's
// opinion is carried separately as `screen_decent`.
//
// Scope: baseline region only, ROI 1 only. Region timing comes from indiegroups_db4
// exp_timing (same source as batch_dump.mjs) so these match the summaries that were
// reviewed by eye.
//
//   node scripts/dataset-summary/export_kernels.mjs
//
// Writes <BUS>/kernels/colonel_kernels_v1.csv + .json. Nothing is written to this repo:
// these are derived kernels from unpublished recordings and belong on the Dropbox bus.

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkbook, windowRegion, regionsOf, regionAnalysisWindow, regionType } from '../../src/lib/core/load-xlsx.js';
import { recoverRegion } from '../../src/lib/core/region-recovery.js';
import { recoverKernelShaped } from '../../src/lib/core/deconvolve-shaped.js';
import { rasterize } from '../../src/lib/core/rasterize.js';
import { nextPow2 } from '../../src/lib/core/deconvolve.js';
import { tauRailed } from '../../src/lib/core/readout.js';
import { GOLDEN_DIR } from './slice_lib.mjs';

const BUS = '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel';
const DB = '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/data/indiegroups_db4.xlsx';
const OUTDIR = `${BUS}/kernels`;
const WIN_S = 5;

// The human list. Order as in the review doc's priority set.
const HUMAN = [
  '20241004_80', '20250904_209', '20250925_233', '20250926_235',
  '20250926_237', '20260130_272', '20250731_151', '20250807_181',
];

// ---- region timing from db4, exactly as batch_dump.mjs sources it ----
const dbwb = XLSX.read(readFileSync(DB), { type: 'buffer' });
const et = {};
for (const sh of ['exp_timing (2)', 'exp_timing']) {
  const ws = dbwb.Sheets[sh];
  if (!ws) continue;
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: null })) et[String(r.experiment_id)] = r;
}
function dbRegions(id) {
  const r = et[id];
  if (!r) return null;
  const out = [{ name: 'baseline', startS: r.baseline_start * 60, endS: r.baseline_end * 60 }];
  for (const i of [1, 2, 3, 4]) {
    const n = r[`treat${i}_name`];
    if (n != null && n !== '') out.push({ name: String(n), startS: r[`treat${i}_start`] * 60, endS: r[`treat${i}_end`] * 60 });
  }
  return out;
}

const num = (v, p = 6) => (Number.isFinite(v) ? +v.toFixed(p) : null);
const csvCell = (v) => (v == null ? '' : String(v));

// The fit-quality flag the MLspike team asked for: "did a single kernel fit this
// recording, or is it a 'no single kernel' case?" Answered about the PARAMETRIC fit
// specifically — it is separate from `fit_ok`, which is the human "a kernel is visible
// here" verdict. A recording can have a real, eyeball-obvious kernel whose
// double-exponential fit still fails.
//
// Bound-pinning ("railed") is delegated to the canonical ADR-0025 `tauRailed`, so this
// gate tests against the SAME numbers the solver clamps to. Do not re-derive the bounds
// here: PARAM_BOUNDS has no tauDecayMin (the floor is the dynamic tauRise + gapMin), and
// tauRailed's tolerance is relative, not absolute.
//
// R2_POOR is a reporting cutoff for this handoff only, not a project constant: it splits
// "fit converged to an interior optimum but explains little" from a usable fit. It is
// arbitrary, so pm_r2 ships alongside it and the reader can pick their own line.
const R2_POOR = 0.5;

function pmQuality(rr) {
  const why = [];
  if (!rr.pm.fit.converged) why.push('not-converged');
  const railed = tauRailed({ tauRise: rr.pm.tauRiseS, tauDecay: rr.pm.tauDecayS });
  if (railed.railed) why.push(...railed.which.map((w) => `railed:${w.replace(/\s+/g, '-')}`));
  if (!(rr.pm.r2 > 0)) why.push('r2<=0');
  if (why.length) return { q: 'failed', why: why.join('|') };
  if (rr.pm.r2 < R2_POOR) return { q: 'poor', why: `r2<${R2_POOR}` };
  return { q: 'good', why: '' };
}

const rows = [], waveforms = [];

for (const id of HUMAN) {
  const file = `APs_xlsx_v1_${id}.xlsx`;
  process.stderr.write(`${id} … `);
  const rec = loadWorkbook(readFileSync(join(GOLDEN_DIR, file)), { source: file });
  const dt = rec.meta.dt;

  const regionList = dbRegions(id) ?? regionsOf(rec);
  const baselines = regionList.filter((r) => regionType(r.name) === 'baseline');
  // same pick rule as slice_lib: the analyzable baseline with the most spikes
  let best = null;
  for (const r of baselines) {
    const v = windowRegion(rec, r, { protocol: true });
    if (!best || (v.spikeCount ?? 0) > (best.v.spikeCount ?? 0)) best = { r, v };
  }
  if (!best || !best.v.analyzable) { process.stderr.write('SKIP: no analyzable baseline\n'); continue; }

  const view = best.v;
  const rr = recoverRegion(view, { col: 0, stability: false }); // col 0 === ROI 1
  if (rec.rois[0].id !== 'roi1') throw new Error(`${id}: col 0 is ${rec.rois[0].id}, not roi1`);

  // Method 3 (shape-regularized), same construction as slice_lib.panelFor
  const grid = view.grid, n = grid.n, N = nextPow2(n), ws = Math.round(WIN_S / grid.dt);
  const sd = rasterize(view.spikeTimes, grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
  const sdPad = new Float64Array(N); sdPad.set(sd.samples);
  const tr = view.rois[0].samples, tp = new Float64Array(N);
  for (let k = 0; k < n; k++) tp[k] = Number.isFinite(tr[k]) ? tr[k] : 0;
  const shaped = recoverKernelShaped(tp, sdPad, { windowSamples: ws, dt: grid.dt, fitLength: n });

  const pw = regionAnalysisWindow(best.r);
  const pq = pmQuality(rr);

  rows.push({
    slice_id: id,
    // --- their requested schema ---
    a: num(rr.pm.peakAmp),            // per-spike dF/F0 peak of the fitted parametric kernel
    tau: num(rr.pm.tauDecayS),        // decay time constant, s (parametric fit)
    ton: null,                        // NOT MODELLED — see tau_rise_s; we fit a time constant, not a 10-90% rise time
    sat: null,                        // NOT MODELLED — forward model is strictly linear (ADR-0006)
    fit_ok: 'yes',                    // HUMAN verdict (kernel-review-baseline-2026-07-19)
    // --- fit quality: READ THIS BEFORE USING a/tau ---
    // pm_fit_quality answers "did a single parametric kernel fit?" — a DIFFERENT question
    // from fit_ok ("is a kernel visible here?"). Where it is `failed`, a and tau above are
    // not a usable forward model; use a_robust (free-vector peak) for amplitude.
    pm_fit_quality: pq.q,
    pm_fit_why: pq.why,
    a_robust: num(rr.fv.peakAmpAdj),  // free-vector peak — what the human actually reviewed
    // acausal ratio > 1 means MORE recovered mass before the spike than after, which no
    // real calcium kernel can have. Treat as a red flag on that recovery, not a kernel.
    acausal_flag: rr.fv.acausalRatio > 1 ? 'ACAUSAL' : '',
    // --- the honest extras ---
    tau_rise_s: num(rr.pm.tauRiseS),
    pm_peak_lag_s: num(rr.pm.peakLagS),
    pm_r2: num(rr.pm.r2),
    pm_converged: rr.pm.fit.converged ? 'yes' : 'no',
    fv_a: num(rr.fv.peakAmpAdj),      // free-vector peak, baseline-corrected
    fv_tau_s: num(rr.fv.tauDecayS),   // log-linear tail fit; null when baseline tilt defeats it
    fv_peak_lag_s: num(rr.fv.peakLagS),
    fv_acausal_ratio: num(rr.fv.acausalRatio),
    sta_a: num(rr.agreement.staPeakAmp),
    sta_peak_lag_s: num(rr.agreement.staPeakLagS),
    sta_empty: rr.sta.empty ? 'yes' : 'no',
    n_spikes: view.spikeCount,
    region: best.r.name,
    region_start_s: num(pw.analyzable ? pw.winStart : best.r.startS, 3),
    region_end_s: num(pw.analyzable ? pw.winEnd : best.r.endS, 3),
    dt_s: num(rr.dt, 9),
    // The Tikhonov regularization strength behind every fv_* column. ADR-0004 requires
    // this stay visible: the free-vector amplitude is a function of lambda, so an
    // amplitude quoted without it is not reproducible.
    fv_lambda: num(rr.lambda, 9),
    fv_lambda_stability_checked: 'no',
    screen_decent: (rr.fv.peakLagS >= -0.2 && rr.fv.peakLagS <= 1.5 && rr.fv.acausalRatio <= 0.5 &&
      Number.isFinite(rr.agreement.dLagFvS) && Math.abs(rr.agreement.dLagFvS) <= 0.5 &&
      rr.fv.peakAmpAdj > 0) ? 'yes' : 'no',
  });

  waveforms.push({
    slice_id: id,
    dt: num(rr.dt, 12),
    region: best.r.name,
    roi: 'roi1',
    n_spikes: view.spikeCount,
    fv_lambda: num(rr.lambda, 9),
    // time vectors are lags in seconds; 0 = spike time. Negative lags are the acausal
    // side, retained deliberately as a diagnostic (a real kernel has ~nothing there).
    fv: { times: Array.from(rr.fv.kernel.times), samples: Array.from(rr.fv.kernel.samples) },
    pm: { times: Array.from(rr.pm.kernel.times), samples: Array.from(rr.pm.kernel.samples) },
    shaped: { times: Array.from(shaped.times), samples: Array.from(shaped.samples) },
    // when the STA is empty, emit an empty time vector too — otherwise times and samples
    // have mismatched lengths and a consumer zipping them silently misreads the record.
    sta_empty: !!rr.sta.empty,
    sta: rr.sta.empty
      ? { times: [], samples: [] }
      : { times: Array.from(rr.sta.times), samples: Array.from(rr.sta.samples) },
    // RAW fit parameters. `scale_coeff` is the scale term of the double exponential, NOT
    // the peak height — the shape is not peak-normalized, so this differs from the CSV `a`
    // (by ~35% on 80, and by >100x where the fit did not converge). Use the CSV `a`.
    pm_theta: { scale_coeff: num(rr.pm.fit.theta.amp, 9), tau_rise_s: num(rr.pm.tauRiseS), tau_decay_s: num(rr.pm.tauDecayS) },
  });

  process.stderr.write(`a=${num(rr.pm.peakAmp, 4)} tau=${num(rr.pm.tauDecayS, 3)}s sta=${rr.sta.empty ? 'EMPTY' : 'ok'}\n`);
}

mkdirSync(OUTDIR, { recursive: true });

const COLS = Object.keys(rows[0]);
const csv = [COLS.join(','), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
writeFileSync(`${OUTDIR}/colonel_kernels_v1.csv`, csv);

writeFileSync(`${OUTDIR}/colonel_kernels_v1.json`, JSON.stringify({
  schema: 'colonel_kernels_v1',
  generated_from: 'colonel_kernel @ ' + (process.env.GIT_DESC || 'see status/app_team.md'),
  contract_version: '1.0',
  scope: 'baseline region, ROI 1, the 8 human-identified kernels',
  authority: 'docs/reviews/kernel-review-baseline-2026-07-19.md (human eyeball, ADR-0011/0018)',
  units: { times: 's (lag from spike; 0 = spike time)', samples: 'dF/F0', a: 'dF/F0 peak per spike', tau: 's' },
  definitions: {
    a: 'peak height (argmax over causal lags) of the FITTED PARAMETRIC kernel, in dF/F0 per spike. NOT pm_theta.scale_coeff.',
    tau: 'tau_decay of the fitted double exponential, seconds.',
    tau_rise_s: 'the fitted rise TIME CONSTANT, seconds. NOT a 10-90% rise time, and not the requested `ton`.',
    a_robust: "free-vector (Method 1) peak minus the mean of that kernel's own pre-spike [-0.5 s, 0) samples, in dF/F0.",
    pm_r2: 'R^2 of the reconstructed trace (spike density convolved with the fitted kernel) against the recorded calcium trace, over the analysis window. Can be negative: the fit is then no better than predicting the trace mean.',
    fv_acausal_ratio: 'sum of squares of the negative-lag samples divided by sum of squares of the causal samples — an ENERGY ratio. >1 means more recovered energy before the spike than after, which no real calcium kernel can have.',
    peak_lag: 'fv_peak_lag_s and pm_peak_lag_s are searched over CAUSAL lags only, so they cannot be negative by construction. sta_peak_lag_s is unconstrained and CAN be negative (it is -1.9 s on 20250731_151). Do not compare them as like for like.',
    fv_lambda: 'Tikhonov regularization strength used for every fv_* column. The free-vector amplitude depends on it.',
    screen_decent: "our automated plausibility screen's own pass/fail for this row — a machine screen, not a verdict. Included only so you can see where it disagrees with the human.",
    region_start_s: 'absolute start/end of the analysed baseline region in the recording, seconds. Not the kernel lag window.',
  },
  methods: {
    fv: 'Method 1 free-vector Tikhonov+Laplacian, per-tap unconstrained recovery (ADR-0004)',
    pm: 'Method 2 parametric double-exponential Levenberg-Marquardt fit (ADR-0021)',
    shaped: 'Method 3 shape-regularized (ADR-0023) — INCLUDED FOR REFERENCE ONLY. ADR-0021 flags this method as the one whose outputs need the most scrutiny (it can suppress the acausal bowl via the regularizer rather than by fitting it). Do not adopt it as a forward model.',
    sta: 'spike-triggered average (ADR-0005), method-independent cross-check',
  },
  caveats: [
    'ton and saturation are NOT modelled. tau_rise_s is a time constant, not a 10-90% rise time. The forward model has no saturation term at all, so a/tau describe a strictly linear response.',
    'These ARE the human-identified ROI 1 kernels. ROI 1 is the targeted cell, confirmed by the author of the review. Our automated screen disagrees on 7 of 8, which is a known shortcoming of the screen on dense-firing recordings and is our cleanup, not yours.',
    'READ pm_fit_quality PER ROW. fit_ok=yes is the human "a kernel is visible here" verdict; it is NOT a statement that the double-exponential fit succeeded. Only 1 of 8 is good; 5 failed and 2 are poor. For anything other than good, prefer a_robust for amplitude and treat tau as unfitted.',
    'a_robust is somewhat more consistent across recordings than the parametric a (spread 2.8x vs 3.6x; CV 0.30 vs 0.43) and is the quantity the human review actually looked at.',
    'a_robust depends on the regularization strength fv_lambda, and the lambda-stability sweep was NOT run for this export (fv_lambda_stability_checked=no). Treat it as one draw at lambda=0.002, not a certified stable optimum.',
    'STA and deconvolution amplitudes disagree in BOTH directions: STA is higher on 3 of the 7 recordings that have one (max 10.5x vs a_robust on 20250925_233) and lower on the other 4 (down to 0.43x on 20260130_272). It is not a one-sided offset you can correct for; do not average them.',
  ],
  kernels: waveforms,
}));

console.log(`\nwrote ${rows.length} kernels →\n  ${OUTDIR}/colonel_kernels_v1.csv\n  ${OUTDIR}/colonel_kernels_v1.json`);
console.table(rows.map((r) => ({
  slice: r.slice_id, a: r.a, tau: r.tau, quality: r.pm_fit_quality, why: r.pm_fit_why,
  a_robust: r.a_robust, acausal: r.acausal_flag, sta_a: r.sta_a, spk: r.n_spikes,
})));
const good = rows.filter((r) => r.pm_fit_quality === 'good');
console.log(`\nparametric fit usable on ${good.length}/${rows.length}: ${good.map((r) => r.slice_id).join(', ') || '(none)'}`);
console.log(`acausal red flag on: ${rows.filter((r) => r.acausal_flag).map((r) => r.slice_id).join(', ') || '(none)'}`);
