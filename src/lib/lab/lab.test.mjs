// Checks for the lab-only modules (ADR-0053). Pure JS, no test framework, same style as
// core.test.mjs. Run with:  npm run test:lab
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { barF, minBarF, dFoverF0, prctFilt, f0Samples, buildVariants } from './extraction.js';
import { parseLabRecording, encodeArray, roiColumn, LAB_FORMAT } from './recording.js';
import { simulateRaw, simulatedLabRecording } from './simulate.js';
import { analyzeVariants, analysisWindows, windowIndices } from './compare.js';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
