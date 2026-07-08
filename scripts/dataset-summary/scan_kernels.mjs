// Scan the golden batch for DECENT recovered kernels → find good app test cases.
// Per recording: pick the analyzable region with the most targeted-cell APs (protocol
// windowing, ADR-0035), recover the free-vector kernel for every ROI column, score
// plausibility, and report the top ROIs. Writes a JSON + prints a ranked table.
//   node darkroom/scan_kernels.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkbook, windowRegion, regionsOf } from '../../src/lib/core/load-xlsx.js';
import { recoverRegion } from '../../src/lib/core/region-recovery.js';

const DIR = '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/golden';
const files = readdirSync(DIR).filter((f) => /^APs_xlsx_v1_.*\.xlsx$/.test(f)).sort();

// Plausible calcium kernel: peak just after the spike, positive baseline-relative amp,
// mostly-causal energy, free-vector peak lag agreeing with STA. Score = strength (amp)
// with a plausibility gate; `decent` is the boolean gate.
function scoreRoi(rr) {
  const { peakLagS, peakAmpAdj, acausalRatio } = rr.fv;
  const dLag = rr.agreement.dLagFvS;
  const plausibleLag = peakLagS >= -0.2 && peakLagS <= 1.5;
  const causal = acausalRatio <= 0.5;
  const staAgrees = Number.isFinite(dLag) && Math.abs(dLag) <= 0.5;
  const posAmp = peakAmpAdj > 0;
  const decent = plausibleLag && causal && staAgrees && posAmp;
  return { decent, score: decent ? peakAmpAdj : -Infinity, peakLagS, peakAmpAdj, acausalRatio, dLag, r2Full: rr.fv.r2Full };
}

const rows = [];
for (const f of files) {
  let rec;
  try { rec = loadWorkbook(readFileSync(join(DIR, f)), { source: f }); }
  catch (e) { console.log(`SKIP ${f}: ${e.message}`); continue; }
  const id = f.replace('APs_xlsx_v1_', '').replace('.xlsx', '');
  if (rec.spikeTimes.length < 5) { rows.push({ id, region: '—', nRoi: rec.rois.length, note: `${rec.spikeTimes.length} APs total`, top: [] }); continue; }

  // pick the analyzable region with the most spikes (protocol windowing)
  let best = null;
  for (const r of regionsOf(rec)) {
    const v = windowRegion(rec, r, { protocol: true });
    if (v.analyzable && (!best || v.spikeCount > best.v.spikeCount)) best = { r, v };
  }
  if (!best) { rows.push({ id, region: '—', nRoi: rec.rois.length, note: 'no analyzable region', top: [] }); continue; }

  const scored = [];
  for (let col = 0; col < rec.rois.length; col++) {
    let rr;
    try { rr = recoverRegion(best.v, { col, stability: false }); } catch (e) { continue; }
    if (!rr.analyzable) continue;
    const s = scoreRoi(rr);
    scored.push({ roi: rec.rois[col].id, col, ...s });
  }
  scored.sort((a, b) => b.score - a.score);
  const decent = scored.filter((s) => s.decent);
  rows.push({
    id, region: best.r.name, nRoi: rec.rois.length, nSpk: best.v.spikeCount,
    nDecent: decent.length,
    roi1decent: scored.find((s) => s.col === 0)?.decent ?? false,
    top: scored.slice(0, 5),
    note: '',
  });
  process.stderr.write('.');
}
process.stderr.write('\n');

writeFileSync('darkroom/scan_kernels.json', JSON.stringify(rows, null, 0));

// ranked table — recordings with the most decent ROIs first
rows.sort((a, b) => (b.nDecent ?? -1) - (a.nDecent ?? -1));
console.log('\nrecording      region        ROIs  APs   decent  roi1?  top ROIs (col: ampAdj @ lag s, acausal, ΔlagSTA)');
for (const r of rows) {
  if (!r.top.length) { console.log(`${r.id.padEnd(14)} ${(r.region||'—').padEnd(12)}  ${String(r.nRoi).padStart(3)}   —     —       —      ${r.note}`); continue; }
  const tops = r.top.filter((t) => t.decent).slice(0, 5)
    .map((t) => `${t.col}:${t.peakAmpAdj.toFixed(4)}@${t.peakLagS.toFixed(2)}s`).join('  ');
  console.log(`${r.id.padEnd(14)} ${r.region.padEnd(12)}  ${String(r.nRoi).padStart(3)}  ${String(r.nSpk).padStart(5)}   ${String(r.nDecent).padStart(4)}   ${r.roi1decent ? 'YES' : ' no'}   ${tops}`);
}
console.log(`\n${rows.filter((r) => r.nDecent > 0).length}/${rows.length} recordings have ≥1 decent kernel ROI.`);
