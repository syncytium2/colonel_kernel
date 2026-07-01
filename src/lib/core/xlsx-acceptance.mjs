// xlsx ingest-spine acceptance — runs the ADR-0019 reader against the THREE real
// golden workbooks produced by the MATLAB team (CONTRACT VERSION 1.0).
//
//   node src/lib/core/xlsx-acceptance.mjs       (or: npm run xlsx-acceptance)
//   GOLDEN_DIR=/path/to/golden node src/lib/core/xlsx-acceptance.mjs
//
// The goldens are unpublished-data-derived and live ONLY in the shared Dropbox bus
// (gitignored, never committed — FOUNDATIONS §6 / repo hygiene). So this is a LOCAL
// acceptance run, deliberately NOT part of `npm run test:core` (which is data-safe
// and runs anywhere). It prints a per-recording table — including the derived dt and
// its regularity (ADR-0012) — and hard-fails on any surprise.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkbook, windowRegion, regionsOf } from './load-xlsx.js';

const GOLDEN_DIR =
  process.env.GOLDEN_DIR ||
  '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/golden';

let failed = 0;
function check(name, cond, detail = '') {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}
const approx = (a, b, eps) => Math.abs(a - b) <= eps;

// Expected specs from golden/README.md (CONTRACT VERSION 1.0).
const GOLDENS = [
  { file: 'APs_xlsx_v1_20241121a_98.xlsx', nFrames: 31289, nROI: 28, nSpikes: 9531, regions: 3, t0: 0.011, tEnd: 3128.811, overhang: true },
  { file: 'APs_xlsx_v1_20240708_13.xlsx', nFrames: 36000, nROI: 34, nSpikes: 0, regions: 2, t0: 0.001, tEnd: 3599.901, overhang: false },
  { file: 'APs_xlsx_v1_20260121_250.xlsx', nFrames: 30690, nROI: 34, nSpikes: 3853, regions: 3, t0: 0.011, tEnd: 3068.911, overhang: false },
];

/** Max deviation of frame-to-frame spacing from the derived dt (ADR-0012). */
function maxJitter(times, dt) {
  let m = 0;
  for (let i = 1; i < times.length; i++) m = Math.max(m, Math.abs(times[i] - times[i - 1] - dt));
  return m;
}

console.log(`xlsx acceptance — GOLDEN_DIR=${GOLDEN_DIR}\n`);
const rows = [];

for (const g of GOLDENS) {
  console.log(`== ${g.file} ==`);
  let rec;
  try {
    rec = loadWorkbook(readFileSync(join(GOLDEN_DIR, g.file)), { source: g.file });
  } catch (e) {
    check(`read ${g.file}`, false, String(e && e.message ? e.message : e));
    continue;
  }
  const dt = rec.meta.dt;
  const jit = maxJitter(rec.grid.times, dt);

  // structural specs
  check('nFrames', rec.meta.nFrames === g.nFrames, `${rec.meta.nFrames} vs ${g.nFrames}`);
  check('nROI', rec.meta.nROIs === g.nROI, `${rec.meta.nROIs} vs ${g.nROI}`);
  check('nSpikes (no clamping)', rec.meta.nSpikes === g.nSpikes, `${rec.meta.nSpikes} vs ${g.nSpikes}`);
  check('regions', rec.regions.length === g.regions, `${rec.regions.length} vs ${g.regions}`);
  check('t0', approx(rec.meta.t0, g.t0, 1e-3), `${rec.meta.t0} vs ${g.t0}`);
  check('tEnd', approx(rec.meta.tEnd, g.tEnd, 1e-3), `${rec.meta.tEnd} vs ${g.tEnd}`);

  // dt: derived AND regular (ADR-0012). Catch unit mismatch / irregular spacing loudly.
  check('dt in plausible seconds range (0.001–1.0)', dt > 1e-3 && dt < 1.0, `dt=${dt}`);
  check('time spacing regular (max jitter < ½ dt)', jit < 0.5 * dt, `jitter=${jit.toExponential(2)}, dt=${dt}`);

  // ADR-0020: a region-end marker may overhang tEnd, and must be read raw.
  const over = rec.regions.find((r) => r.endS > rec.meta.tEnd);
  if (g.overhang) {
    check('region-end overhang present and read RAW (not clamped, ADR-0020)', !!over && over.endS > rec.meta.tEnd, over ? `'${over.name}' end_s=${over.endS} > tEnd=${rec.meta.tEnd}` : 'none found');
  }

  // window every region; the empty-spikes golden must come back all non-analyzable, no throw.
  let analyzable = 0;
  let degenerate = 0;
  for (const region of regionsOf(rec)) {
    const w = windowRegion(rec, region);
    if (w.analyzable) analyzable++;
    else degenerate++;
  }
  if (g.nSpikes === 0) {
    check('empty-spikes: all regions non-analyzable, no throw', analyzable === 0 && degenerate === rec.regions.length, `analyzable=${analyzable}, degenerate=${degenerate}`);
  } else {
    check('at least one analyzable region', analyzable >= 1, `analyzable=${analyzable}`);
  }

  rows.push({
    file: g.file.replace('APs_xlsx_v1_', '').replace('.xlsx', ''),
    nFrames: rec.meta.nFrames,
    nROI: rec.meta.nROIs,
    nSpikes: rec.meta.nSpikes,
    regions: rec.regions.length,
    dt: dt.toFixed(6),
    jitter: jit.toExponential(1),
    t0: rec.meta.t0,
    tEnd: rec.meta.tEnd,
    analyzable: `${analyzable}/${rec.regions.length || 1}`,
  });
  console.log('');
}

// --- summary table ---
console.log('=== acceptance table ===');
const cols = ['file', 'nFrames', 'nROI', 'nSpikes', 'regions', 'dt', 'jitter', 't0', 'tEnd', 'analyzable'];
const w = Object.fromEntries(cols.map((c) => [c, Math.max(c.length, ...rows.map((r) => String(r[c]).length))]));
const line = (vals) => cols.map((c) => String(vals[c]).padEnd(w[c])).join('  ');
console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
for (const r of rows) console.log(line(r));

console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL ACCEPTANCE CHECKS PASSED'}`);
process.exit(failed ? 1 : 0);
