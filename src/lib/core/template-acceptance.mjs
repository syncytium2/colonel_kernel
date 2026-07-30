// Input-template acceptance — proves the template we hand users is a file the app can
// actually read (ADR-0019 §5).
//
//   node src/lib/core/template-acceptance.mjs     (or: npm run template-acceptance)
//
// Separate from `npm run test:core` for the same reason xlsx-acceptance.mjs is: these
// are end-to-end round-trips through the real ingest, not unit tests. What distinguishes
// this one from xlsx-acceptance.mjs is that it needs NO golden data — the recording is
// synthesized from core — so it is data-safe and runs anywhere, with no GOLDEN_DIR.
// (It is NOT separated on account of SheetJS: core.test.mjs imports SheetJS too, for the
// ADR-0019 ingest-spine tests.)
//
// The point is round-tripping through the REAL loaders, not a shape assertion: a
// template that matches the ADR but trips the parser would be worse than no template,
// because the user would blame their own data. So we generate → load → window →
// recover, and check the recovered kernel against the numbers the template was built
// from. If the input contract ever changes and the generator is not updated, this fails.

import { loadCsv } from './load-csv.js';
import { loadWorkbook, windowRegion, regionsOf } from './load-xlsx.js';
import { recoverKernel, nextPow2 } from './deconvolve.js';
import { rasterize } from './rasterize.js';
import { templateCsvText } from './make-template.js';
import { TEMPLATE_FACTS } from './template-facts.js';
import { buildTemplateWorkbook } from './make-template-xlsx.js';

let failed = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Counts PUBLISHED in ADR-0038 and in the app's own Tab 0 copy. They are emergent
// properties of the seeded Poisson draw, not constants, so a seed or rate change would
// silently falsify documents that quote them. Pinned here so that change fails loudly
// instead. Integers only — the recovered amplitudes stay on a loose tolerance below,
// because those are floating-point FFT results and pinning them would be brittle.
const PUBLISHED = { nSpikes: 50, baselineSpikes: 11, hiKSpikes: 39 };

// --- 1. the CSV template loads through the CSV path (ADR-0016) ---------------
console.log('\nCSV template → loadCsv');
{
  const rec = loadCsv(templateCsvText(), { source: 'template.csv' });
  check('frame count matches the advertised example', rec.meta.nFrames === TEMPLATE_FACTS.frames, `${rec.meta.nFrames} frames`);
  check(`${TEMPLATE_FACTS.rois} ROI columns read`, rec.meta.nROIs === TEMPLATE_FACTS.rois, rec.rois.map((r) => r.id).join(', '));
  check('spikes read, ragged column not padded', rec.meta.nSpikes < rec.meta.nFrames, `${rec.meta.nSpikes} spikes`);
  check(`spike count is the published ${PUBLISHED.nSpikes}`, rec.meta.nSpikes === PUBLISHED.nSpikes, `${rec.meta.nSpikes} spikes`);
  check('dt derived at the advertised rate', Math.abs(rec.meta.dt - 1 / TEMPLATE_FACTS.rateHz) < 1e-9, `dt=${rec.meta.dt}`);
  check('t0 is zero-based', Math.abs(rec.meta.t0) < 1e-9, `t0=${rec.meta.t0}`);
  check('no machinery warnings', rec.warnings.length === 0, rec.warnings.join(' | ') || 'none');
}

// --- 2. the workbook loads through the xlsx path (ADR-0019) ------------------
console.log('\nxlsx template → loadWorkbook');
let recording = null;
{
  recording = loadWorkbook(buildTemplateWorkbook(), { source: 'template.xlsx' });
  check('frame count matches the advertised example', recording.meta.nFrames === TEMPLATE_FACTS.frames, `${recording.meta.nFrames} frames`);
  check(`${TEMPLATE_FACTS.rois} ROI columns read`, recording.meta.nROIs === TEMPLATE_FACTS.rois, recording.rois.map((r) => r.id).join(', '));
  check(`spike train read whole, at the published ${PUBLISHED.nSpikes}`, recording.meta.nSpikes === PUBLISHED.nSpikes, `${recording.meta.nSpikes} spikes`);
  check('no spikes outside the recording window', !recording.warnings.some((w) => w.includes('outside the recording window')), recording.warnings.join(' | ') || 'none');
  check('no non-finite trace samples', !recording.warnings.some((w) => w.includes('non-finite')), 'numeric cells only (ADR-0019 §5)');
  check(
    `metadata sheet read: ${TEMPLATE_FACTS.regions.length} regions`,
    recording.regions.length === TEMPLATE_FACTS.regions.length,
    recording.regions.map((r) => `${r.name} [${r.startS}, ${r.endS}]`).join(' · '),
  );
  check('region names survive verbatim', recording.regions.map((r) => r.name).join('|') === TEMPLATE_FACTS.regions.join('|'));
}

// --- 3. every region survives protocol windowing -----------------------------
// The trap this guards: regionType() sends any unrecognized name down the TREATMENT
// path, which trims SOLUTION_DELAY_S (120 s) off the front. At the template's 60 s
// regions no window survives that trim, and the region comes back non-analyzable with a
// reason the user has no way to connect back to the region's NAME. Names are chosen to
// avoid it; this is the check that keeps them chosen.
console.log('\nxlsx template → windowRegion (protocol: true, as Tab 2 runs it)');
const views = [];
const expectedRegionSpikes = { baseline: PUBLISHED.baselineSpikes, 'high K+': PUBLISHED.hiKSpikes };
for (const region of regionsOf(recording)) {
  const v = windowRegion(recording, region, { protocol: true });
  views.push(v);
  check(`region '${v.name}' is analyzable`, v.analyzable, v.analyzable ? `${v.spikeCount} spikes, ${v.grid.n} frames` : v.reason);
  const want = expectedRegionSpikes[v.name];
  if (want !== undefined) {
    check(`region '${v.name}' holds the published ${want} spikes`, v.spikeCount === want, `${v.spikeCount} spikes`);
  }
}

// --- 4. a kernel actually comes out, and it is the one we built in ------------
// The template's whole promise is "drop this in and see it work". Assert the payoff,
// not just the parse. Tolerances are loose on purpose: this is noisy synthetic data
// through a regularized inverse, so the claim is "recovers the right shape", not
// "reproduces the constants".
console.log('\nrecovered kernel vs the kernel the template was built from');
for (const v of views) {
  if (!v.analyzable) continue;
  // Mirrors Tab 2's own recovery path (Tab2.svelte `density` / `noisyTrace` / METHOD 1)
  // rather than inventing a call: binned-count density and the trace both zero-padded
  // to a power of two, NaN→0 on the trace, free-vector recovery at the default λ.
  const dt = v.grid.dt;
  const n = v.grid.n;
  const N = nextPow2(n);
  const sd = rasterize(v.spikeTimes, v.grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
  const sdPad = new Float64Array(N);
  sdPad.set(sd.samples);
  const trace = new Float64Array(N);
  for (let i = 0; i < n; i++) trace[i] = Number.isFinite(v.rois[0].samples[i]) ? v.rois[0].samples[i] : 0;

  // Tab 2's own defaults, so this run reproduces the shipped path rather than a variant:
  // winS = 5 s half-window (Tab2.svelte:64) and λ = 0.002 (Tab2.svelte:161, the UI default
  // and the λ-sweep floor).
  const k = recoverKernel(trace, sdPad, { windowSamples: Math.round(5 / dt), dt, lambda: 0.002 });
  let peak = -Infinity;
  let peakIdx = 0;
  for (let i = 0; i < k.samples.length; i++) {
    if (k.samples[i] > peak) { peak = k.samples[i]; peakIdx = i; }
  }
  const peakLag = (peakIdx - k.zeroIndex) * dt;
  check(
    `region '${v.name}': peak lag is causal and early`,
    peakLag >= 0 && peakLag <= 1.0,
    `peak lag ${peakLag.toFixed(2)} s (τ_rise ${TEMPLATE_FACTS.tauRise} s in)`,
  );
  check(
    `region '${v.name}': peak amplitude within 2× of the ${TEMPLATE_FACTS.peak} dF/F₀ built in`,
    peak > TEMPLATE_FACTS.peak / 2 && peak < TEMPLATE_FACTS.peak * 2,
    `peak ${peak.toFixed(4)} dF/F₀`,
  );
}

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL TEMPLATE ACCEPTANCE CHECKS PASSED'}`);
process.exit(failed ? 1 : 0);
