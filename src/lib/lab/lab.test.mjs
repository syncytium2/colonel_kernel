// Checks for the lab-only modules (ADR-0053). Pure JS, no test framework, same style as
// core.test.mjs. Run with:  npm run test:lab
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { barF, minBarF, dFoverF0, prctFilt, f0Samples, buildVariants } from './extraction.js';
import { parseLabRecording, encodeArray, roiColumn, LAB_FORMAT } from './recording.js';
import { simulateRaw, simulatedLabRecording, producerBridge } from './simulate.js';
import { analyzeVariants, analysisWindows, windowIndices, bridgedSpans } from './compare.js';
import { verdictLine, parseVerdicts, currentVerdict, verdictKey, isStale, VERDICT_HEADER } from './verdicts.js';
import { riseCrossingLag, indexAtLag } from './timing.js';

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
  await refuses(() => { const j = clone(); j.version = 1; return parseLabRecording(j); }, /version/, 'refuses version 1 (raw plus exclusions, cleaned by the reader)');
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

// ---- contract v2: the producer cleans, the page reads the manifest (2026-11-17) ------------
{
  // The modelled producer step (the page never calls it).
  const x = Float64Array.from([0, 1, 2, 99, 99, 99, 6, 7, 8, 9]);
  const b = producerBridge(x, [{ first: 3, last: 5 }]);
  ok(b[3] === 3 && b[4] === 4 && b[5] === 5 && x[3] === 99, 'producer bridge: an interior run becomes a straight line; input untouched');
  const e = producerBridge(x, [{ first: 0, last: 1 }, { first: 9, last: 9 }]);
  ok(e[0] === 2 && e[1] === 2 && e[9] === 8, 'producer bridge: a run at either end is held at its one good neighbour');

  const clone = () => JSON.parse(JSON.stringify(file));
  const entry = (o) => ({ method: 'linear-bridge', reason: 'r', rule: '', called_by: 'test', rois: 'ALL', ...o });
  // Frames are 1-based: time[i] = (i-1)*0.1 s in the simulation, so 700 s is frame 7001.
  const scoped = clone();
  scoped.cleaning = [
    entry({ start_s: 700, end_s: 720, first_frame: 7001, last_frame: 7201 }),
    entry({ start_s: 900, end_s: 910, first_frame: 9001, last_frame: 9101, rois: ['roi2'] }),
    { method: 'roi-dropped', rois: ['roi7'], reason: 'duplicate pick', rule: '', called_by: 'test', start_s: null, end_s: null, first_frame: null, last_frame: null },
  ];
  const rs = await parseLabRecording(scoped);
  ok(rs.bridged.length === 2 && rs.bridged[0].rois === null && rs.bridged[1].rois.has(1) && rs.bridged[0].firstFrame === 7000, 'cleaning: ALL is null, ["roi2"] is column 1, frames read 0-based');
  ok(rs.dropped.length === 1 && rs.dropped[0].labels[0] === 'roi7', 'a roi-dropped entry is carried');
  ok(bridgedSpans(rs, 0).length === 1 && bridgedSpans(rs, 1).length === 2, 'a stretch naming roi2 applies to roi2 and not to roi1');
  const m0 = analyzeVariants(rs, { roiIndex: 0, startS: 600, endS: 1200 }).masked.nFrames;
  const m1 = analyzeVariants(rs, { roiIndex: 1, startS: 600, endS: 1200 }).masked.nFrames;
  ok(m0 === 201 && m1 === 302, `bridged frames are left out of the fit by exact frame (${m0}, ${m1})`);

  await refuses(() => { const j = clone(); j.exclusions = []; return parseLabRecording(j); }, /version-1 field/, 'refuses a file carrying exclusions');
  await refuses(() => { const j = clone(); delete j.cleaning; return parseLabRecording(j); }, /cleaning missing/, 'refuses a file with no cleaning manifest');
  await refuses(() => { const j = clone(); j.cleaning = [entry({ start_s: 700, end_s: 720, first_frame: 7001, last_frame: 7201, rois: ['roi9'] })]; return parseLabRecording(j); }, /does not have/, 'refuses a stretch naming a ROI the file does not have');
  await refuses(() => { const j = clone(); j.cleaning = [entry({ start_s: 700, end_s: 720, first_frame: 5001, last_frame: 5201 })]; return parseLabRecording(j); }, /not inside/, 'refuses frames that disagree with the seconds');
  await refuses(() => { const j = clone(); j.cleaning = [{ method: 'roi-dropped', rois: ['roi1'], reason: 'x' }]; return parseLabRecording(j); }, /dropped but is in the file/, 'refuses a dropped ROI that is still in the file');
  await refuses(() => { const j = clone(); j.cleaning = [entry({ method: 'nan-fill', start_s: 1, end_s: 2, first_frame: 11, last_frame: 21 })]; return parseLabRecording(j); }, /method/, 'refuses an unknown cleaning method');
  await refuses(() => { const j = clone(); j.rois[1].label = 'roi1'; return parseLabRecording(j); }, /appears twice/, 'refuses duplicate ROI labels');

  // The page uses the cleaned trace as given: an artifact the producer bridged never reaches F0.
  const sim = simulateRaw();
  const dipped = Float64Array.from(sim.soma);
  for (let i = 7000; i <= 7200; i++) dipped[i] *= 0.3; // roi1, 700-720 s
  const cleaned = new Float32Array(sim.soma);
  cleaned.set(producerBridge(dipped.subarray(0, sim.n), [{ first: 7000, last: 7200 }]), 0);
  const ref = new Float32Array(sim.soma);
  ref.set(producerBridge(Float64Array.from(sim.soma.subarray(0, sim.n)), [{ first: 7000, last: 7200 }]), 0);
  const mk = async (arr) => {
    const j = clone();
    const enc = await encodeArray(arr, [sim.n, 4]);
    j.traces.raw_soma = { ...enc, order: 'column-major' };
    j.cleaning = [entry({ start_s: 700, end_s: 720, first_frame: 7001, last_frame: 7201 })];
    return parseLabRecording(j);
  };
  const o = { roiIndex: 0, startS: 600, endS: 1200 };
  const fA = analyzeVariants(await mk(cleaned), o).variants.find((v) => v.id === 'dff').f0;
  const fB = analyzeVariants(await mk(ref), o).variants.find((v) => v.id === 'dff').f0;
  let worst = 0;
  for (let i = 0; i < fA.length; i++) worst = Math.max(worst, Math.abs(fA[i] - fB[i]) / fB[i]);
  ok(worst < 1e-6, `a producer-bridged artifact leaves F0 as if it had never happened (${worst.toExponential(1)})`);
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

// ---- t50 rise ---------------------------------------------------------------------------
{
  const times = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
  const ys = [0, 0, 0, 0, 0.2, 0.6, 1.0, 0.8];
  const t = riseCrossingLag(ys, times, 6);
  ok(Math.abs(t - 0.175) < 1e-12, `the half-height crossing is interpolated between samples (${t})`);
  ok(Math.abs(riseCrossingLag(ys, times, 6, 0.1) - 0.05) < 1e-12, 'another fraction crosses where it should');
  // A wiggle above half far before the rise must not be taken for it: walk back from the peak.
  const wig = [0.9, 0, 0, 0, 0.2, 0.6, 1.0, 0.8];
  ok(Math.abs(riseCrossingLag(wig, times, 6) - 0.175) < 1e-12, 'an earlier excursion above half is not the rise');
  // A rise that crosses half before the spike gives a negative lag.
  const early = [0, 0.2, 0.8, 1.0, 0.7, 0.4, 0.2, 0.1];
  ok(Math.abs(riseCrossingLag(early, times, 3) - (-0.15)) < 1e-12, 'a crossing before the spike is a negative lag');
  ok(Number.isNaN(riseCrossingLag([0.6, 0.8, 1.0], [0, 0.1, 0.2], 2)), 'never below half inside the window: no answer');
  ok(Number.isNaN(riseCrossingLag([0, -0.5, -1], [0, 0.1, 0.2], 2)), 'a peak at or below zero: no answer');
  ok(Number.isNaN(riseCrossingLag([0, NaN, 0.8, 1.0], [0, 0.1, 0.2, 0.3], 3)), 'a missing sample before the crossing: no answer');
  ok(indexAtLag(times, 0.21) === 5 && indexAtLag(times, NaN) === -1, 'indexAtLag finds the nearest sample');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
