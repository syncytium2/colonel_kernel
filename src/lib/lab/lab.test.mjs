// Checks for the lab-only modules (ADR-0053). Pure JS, no test framework, same style as
// core.test.mjs. Run with:  npm run test:lab
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { barF, minBarF, dFoverF0, prctFilt, f0Samples, buildVariants } from './extraction.js';
import { parseLabRecording, encodeArray, roiColumn, LAB_FORMAT } from './recording.js';
import { simulateRaw, simulatedLabRecording } from './simulate.js';
import { analyzeVariants, analysisWindows, windowIndices, frameMask, bridgeMasked, maskedSpans } from './compare.js';
import { verdictLine, parseVerdicts, currentVerdict, verdictKey, isStale, VERDICT_HEADER } from './verdicts.js';

let passed = 0;
let failed = 0;
function ok(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
async function refuses(fn, pattern, name) {
  try {
    await fn();
    ok(false, name, 'accepted');
  } catch (e) {
    ok(pattern.test(String(e.message)), name, String(e.message));
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const V = JSON.parse(readFileSync(path.join(here, 'fixtures/f0-parity.json'), 'utf8'));

// ---- F0 parity with the validated Python port ---------------------------------------
{
  const { half, n4 } = f0Samples(V.dt);
  ok(half === V.half && n4 === V.n4, `seconds to samples at dt ${V.dt}: half ${half}, n4 ${n4}`);
  const raw = Float32Array.from(V.raw);
  const b = barF(raw, half);
  let bad = 0;
  for (let i = 0; i < b.length; i++) if (b[i] !== Math.fround(V.barF[i])) bad++;
  ok(bad === 0, `barF equals the reference on all ${b.length} samples, bit for bit`, `${bad} differ`);
  const m = minBarF(b, n4);
  bad = 0;
  for (let i = 0; i < m.length; i++) if (m[i] !== Math.fround(V.f0[i])) bad++;
  ok(bad === 0, 'F0 (running minimum with slope fill) equals the reference, bit for bit', `${bad} differ`);
  let sloped = 0;
  for (let i = 1; i < m.length; i++) if (m[i] !== m[i - 1]) sloped++;
  ok(sloped > 100, `the reference exercises the slope-fill branch (${sloped} changing samples)`);
  const d = dFoverF0(raw, m);
  bad = 0;
  for (let i = 0; i < d.length; i++) if (d[i] !== Math.fround(V.dff[i])) bad++;
  ok(bad === 0, 'dF/F0 equals the reference, bit for bit', `${bad} differ`);

  for (const c of V.prct) {
    const base = prctFilt(Float64Array.from(V.dff), c.p, c.window, c.shift);
    let worst = 0;
    for (let i = 0; i < base.length; i++) worst = Math.max(worst, Math.abs(base[i] - c.baseline[i]));
    ok(worst < 1e-12, `percentile baseline p=${c.p} window=${c.window} shift=${c.shift} matches the reference`, `worst ${worst}`);
  }
}

// ---- hand-checkable cases -------------------------------------------------------------
{
  const flat = new Float32Array(500).fill(7);
  const f0 = minBarF(barF(flat, 5), 200);
  ok(f0.every((v) => v === 7), 'a constant trace has F0 equal to the constant');
  ok(dFoverF0(flat, f0).every((v) => v === 0), 'and dF/F0 of zero');
  const base = prctFilt(new Float64Array(300).fill(2.5), 10, 50, 1);
  ok(base.every((v) => v === 2.5), 'the percentile baseline of a constant is the constant');
}

// ---- the file: round trip and refusals --------------------------------------------------
const file = await simulatedLabRecording();
{
  const rec = await parseLabRecording(JSON.stringify(file));
  const sim = simulateRaw();
  ok(rec.nFrames === sim.n && rec.nRoi === 4 && rec.targetIndex === 0, 'simulated file reads back with its shape and target');
  const col = roiColumn(rec.traces.raw_soma, rec.nFrames, 2);
  let same = true;
  for (let i = 0; i < sim.n; i++) if (col[i] !== sim.soma[2 * sim.n + i]) same = false;
  ok(same, 'ROI 3 raw soma reads back bit for bit (column-major)');
  ok(rec.spikeTimes.length === sim.spikes.length && rec.spikeTimes[5] === sim.spikes[5], 'spike times read back exactly');
  ok(rec.regions.length === 3 && rec.truth && rec.warnings.some((w) => /SIMULATED/.test(w)), 'regions, planted kernel and the simulated warning are carried');
  ok(rec.warnings.some((w) => /not reviewed/.test(w)), 'unreviewed spikes are warned about');

  const clone = () => JSON.parse(JSON.stringify(file));
  await refuses(() => { const j = clone(); j.version = 2; return parseLabRecording(j); }, /version/, 'refuses another version');
  await refuses(() => { const j = clone(); j.format = 'x'; return parseLabRecording(j); }, /not a lab recording/, 'refuses another format');
  await refuses(async () => {
    const j = clone();
    const t = new Float32Array(sim.soma);
    t[1234] += 1;
    j.traces.raw_soma.b64 = (await encodeArray(t)).b64;
    return parseLabRecording(j);
  }, /sha256/, 'refuses a trace with one value altered');
  await refuses(() => { const j = clone(); j.traces.raw_soma.shape = [sim.n, 3]; return parseLabRecording(j); }, /bytes|shape/, 'refuses a shape that disagrees with the bytes');
  await refuses(() => { const j = clone(); j.traces.raw_soma.order = 'row-major'; return parseLabRecording(j); }, /column-major/, 'refuses row-major traces');
  await refuses(() => { const j = clone(); j.spikes.clock = 'patchmaster'; return parseLabRecording(j); }, /imaging/, 'refuses spikes that are not on the imaging clock');
  await refuses(() => { const j = clone(); j.spikes.n += 1; return parseLabRecording(j); }, /spikes\.n/, 'refuses a spike count that disagrees with the array');
  await refuses(() => { const j = clone(); j.target_roi = 9; return parseLabRecording(j); }, /target_roi/, 'refuses a target outside the ROI list');
  await refuses(() => { const j = clone(); j.regions[1].start_s = 500; return parseLabRecording(j); }, /overlap/, 'refuses overlapping regions');
  await refuses(() => { const j = clone(); j.dt_nominal_s = 0.2; return parseLabRecording(j); }, /dt_nominal_s/, 'refuses a declared dt that the time column contradicts');
  ok(file.format === LAB_FORMAT, 'format name is stable');
}

// ---- the comparison, on the planted kernel -------------------------------------------------
{
  const rec = await parseLabRecording(file);
  const wins = analysisWindows(rec);
  ok(wins.length === 4 && wins[0].name === 'whole recording', 'windows: whole recording plus the three regions');
  const { i0, i1 } = windowIndices(rec.time, 600, 1200);
  ok(rec.time[i0] === 600 && rec.time[i1 - 1] === 1200, 'window indices bracket the region inclusively');

  const w = wins[1];
  const a = analyzeVariants(rec, { roiIndex: 0, startS: w.startS, endS: w.endS });
  const ids = a.variants.map((v) => v.id).join(' ');
  ok(ids === 'frozen dff frozen-pensub dff-pensub dff-prct', `five variants in order (${ids})`);
  const by = Object.fromEntries(a.variants.map((v) => [v.id, v]));
  for (const v of a.variants) {
    ok(v.analyzable && Math.abs(v.truth.shaped.dPeakLagS) <= 0.2, `${v.id}: shaped kernel peaks within 0.2 s of the planted peak`, `${v.truth?.shaped.dPeakLagS}`);
  }
  // The soma signal carries neuropil, so its F0 is too high and the kernel comes out small;
  // subtracting the penumbra brings the amplitude back toward the planted value.
  const rSoma = by.frozen.truth.shaped.ampRatio;
  const rSub = by['frozen-pensub'].truth.shaped.ampRatio;
  ok(rSoma < 0.85 && Math.abs(rSub - 1) < Math.abs(rSoma - 1), `neuropil dilutes the amplitude (${rSoma.toFixed(2)}); penumbra subtraction restores it (${rSub.toFixed(2)})`);
  // The percentile filter removes slow signal by construction; the kernel's tail goes with it.
  ok(by['dff-prct'].truth.shaped.shapeRms > by.dff.truth.shaped.shapeRms, 'the percentile-filtered variant is further from the planted shape than plain dF/F0');

  const other = analyzeVariants(rec, { roiIndex: 1, startS: w.startS, endS: w.endS });
  ok(other.variants[0].shaped.peakAmp < 0.3 * by.frozen.shaped.peakAmp, 'an uncoupled ROI gives a far smaller kernel than the target');

  const bv = buildVariants({ soma: roiColumn(rec.traces.raw_soma, rec.nFrames, 0), pen: null, dt: rec.dt, i0: 0, i1: 100 });
  ok(bv.map((v) => v.id).join(' ') === 'frozen dff dff-prct', 'without a penumbra trace the penumbra variants are absent');
}

// ---- exclusions are applied BEFORE any baseline ------------------------------------------
{
  ok(Array.from(bridgeMasked([1, 9, 9, 9, 5], [0, 1, 1, 1, 0])).join() === '1,2,3,4,5', 'a masked run is bridged by a straight line');
  ok(Array.from(bridgeMasked([9, 9, 4, 6, 9], [1, 1, 0, 0, 1])).join() === '4,4,4,6,6', 'a masked run at an end holds the nearest valid sample');

  // A blanked stretch: 30 frames of ROI 1's soma and penumbra forced to zero at 300 s, as a
  // blank motion-correction frame is, with an exclusion window declared over it.
  const sim = simulateRaw();
  const soma = Float32Array.from(sim.soma);
  const pen = Float32Array.from(sim.pen);
  for (let i = 3000; i < 3030; i++) { soma[i] = 0; pen[i] = 0; }
  const bad = JSON.parse(JSON.stringify(file));
  bad.traces.raw_soma = { ...(await encodeArray(soma, [sim.n, 4])), order: 'column-major' };
  bad.traces.raw_pen = { ...(await encodeArray(pen, [sim.n, 4])), order: 'column-major' };
  const clean = await parseLabRecording(file);
  const ref = analyzeVariants(clean, { roiIndex: 0, startS: 0, endS: 600 });
  const refDff = ref.variants.find((v) => v.id === 'dff');

  const undeclared = analyzeVariants(await parseLabRecording(bad), { roiIndex: 0, startS: 0, endS: 600 });
  const uDff = undeclared.variants.find((v) => v.id === 'dff');
  ok(!(Math.abs(uDff.fv.peakAmp - refDff.fv.peakAmp) < 0.2 * refDff.fv.peakAmp), 'the blanked stretch, undeclared, wrecks the dF/F0 kernel (the fixture can fail)', `${uDff.fv.peakAmp} vs ${refDff.fv.peakAmp}`);

  bad.exclusions = [
    { start_s: 299.95, end_s: 303.0, reason: 'blank frames', rois: 'ALL', rule: '', called_by: 'test' },
    { start_s: 100, end_s: 110, reason: 'this ROI only', rois: '2', rule: '', called_by: 'test' },
  ];
  const rec = await parseLabRecording(bad);
  ok(rec.exclusions[0].rois === null && rec.exclusions[1].rois.join() === '2', 'rois reads as every ROI or as a list of ROI numbers');
  ok(maskedSpans(rec, 0).length === 1 && maskedSpans(rec, 1).length === 2, 'a window naming ROI 2 applies to ROI 2 and not to ROI 1');
  const m0 = frameMask(rec, 0);
  const m1 = frameMask(rec, 1);
  ok(m0[3010] === 1 && m0[1050] === 0 && m1[1050] === 1, 'the frame mask follows the per-ROI windows');

  const a = analyzeVariants(rec, { roiIndex: 0, startS: 0, endS: 600 });
  const dff = a.variants.find((v) => v.id === 'dff');
  ok(a.masked.nFrames === 31 || a.masked.nFrames === 30, `the declared stretch is masked (${a.masked.nFrames} frames)`);
  ok(Number.isNaN(dff.samples[3010]) && Number.isFinite(dff.samples[2990]), 'masked samples are removed from what is drawn');
  // F0 is a running minimum over everything earlier, so one zero frame would hold F0 at zero
  // for the rest of the recording. Bridged first, the F0 after the stretch is the clean one.
  ok(Math.abs(dff.f0[4000] - refDff.f0[4000]) < 1e-3 * refDff.f0[4000], 'F0 after the stretch is not pulled down by it', `${dff.f0[4000]} vs ${refDff.f0[4000]}`);
  for (const v of a.variants) {
    const r0 = ref.variants.find((x) => x.id === v.id);
    ok(Math.abs(v.fv.peakAmp - r0.fv.peakAmp) < 0.1 * r0.fv.peakAmp && Math.abs(v.shaped.peakAmp - r0.shaped.peakAmp) < 0.1 * r0.shaped.peakAmp,
      `${v.id}: with the stretch declared, the kernel is within 10% of the kernel from the undamaged recording`, `fv ${v.fv.peakAmp} vs ${r0.fv.peakAmp}; shaped ${v.shaped.peakAmp} vs ${r0.shaped.peakAmp}`);
  }
  const bogus = JSON.parse(JSON.stringify(bad));
  bogus.exclusions[1].rois = 'second one';
  const rb = await parseLabRecording(bogus);
  ok(rb.exclusions[1].rois === null && rb.warnings.some((w) => /not understood/.test(w)), 'an unreadable rois value masks every ROI and says so');
}

// ---- the review log ---------------------------------------------------------------------
{
  const base = { time_utc: '2026-11-16T12:00:00.000Z', slice_id: 'S1', roi: 'roi1', window: 'baseline', start_s: 0, end_s: 600, spike_cell: 'c1', spike_revision: 2, spike_sha256: 'aa', verdict: 'accept', note: 'clean\trise\nok' };
  const l1 = verdictLine(base);
  ok(l1.split('\t').length === 11 && !/[\r\n]/.test(l1), 'a note with a tab and a newline still makes one 11-field line');
  const l2 = verdictLine({ ...base, time_utc: '2026-11-16T13:00:00.000Z', verdict: 'reject', note: '' });
  const l3 = verdictLine({ ...base, roi: 'roi2', verdict: 'unsure' });
  const rows = parseVerdicts([VERDICT_HEADER, l1, l3, l2].join('\n') + '\n');
  ok(rows.length === 3 && rows[0].note === 'clean rise ok', 'the log parses back, note flattened to one line');
  ok(currentVerdict(rows, verdictKey(base)).verdict === 'reject', 'the last line for a kernel is the verdict in force');
  ok(currentVerdict(rows, verdictKey({ ...base, roi: 'roi2' })).verdict === 'unsure', 'another ROI keeps its own verdict');
  ok(currentVerdict(rows, verdictKey({ ...base, window: 'whole recording' })) === null, 'another window has none');
  ok(!isStale(rows[2], { cell: 'c1', revision: 2, sha256: 'aa' }), 'same spike file: not stale');
  ok(isStale(rows[2], { cell: 'c1', revision: 3, sha256: 'bb' }), 'a new spike revision makes the verdict stale');
  ok(isStale({ ...rows[2], spike_sha256: '' }, { cell: 'c1', revision: 3 }), 'without hashes, cell and revision decide');
  ok(parseVerdicts('').length === 0, 'an empty log is no verdicts');
  await refuses(() => verdictLine({ ...base, verdict: 'maybe' }), /verdict must be/, 'refuses a verdict outside accept, reject, unsure');
  await refuses(() => verdictLine({ ...base, slice_id: '' }), /slice_id/, 'refuses a verdict with no slice');
  await refuses(() => parseVerdicts('a\tb\n' + l1 + '\n'), /header/, 'refuses a log with another header');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
