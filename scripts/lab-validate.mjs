// Check lab recording files against the contract (docs/lab-recording-contract.md), with the
// same reader the lab page uses.
//
//   npm run lab-validate -- FILE.klab.json [more files or folders]
//
// Exit 0 when every file reads; exit 1 when any is refused or none was given. For each file
// it prints what a person would want to confirm by eye: shape, the target ROI, spike count
// and where the spikes fall on the imaging clock, the regions, and every warning.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseLabRecording, roiColumn } from '../src/lib/lab/recording.js';
import { f0RunningMin, dFoverF0 } from '../src/lib/lab/extraction.js';

const args = process.argv.slice(2);
const files = [];
for (const a of args) {
  if (statSync(a).isDirectory()) {
    for (const f of readdirSync(a).sort()) if (/\.klab\.json$/i.test(f)) files.push(path.join(a, f));
  } else files.push(a);
}
if (!files.length) {
  console.error('no .klab.json files given');
  process.exit(1);
}

let refused = 0;
for (const f of files) {
  try {
    const r = await parseLabRecording(readFileSync(f, 'utf8'));
    const t0 = r.time[0];
    const t1 = r.time[r.nFrames - 1];
    console.log(`OK   ${path.basename(f)}`);
    console.log(`     slice ${r.sliceId}; ${r.nFrames} frames x ${r.nRoi} ROIs; time ${t0} to ${t1.toFixed(3)} s; dt ${r.dt} s`);
    console.log(`     target ROI: ${r.targetIndex == null ? 'not stated' : `${r.targetIndex + 1} (${r.rois[r.targetIndex].label})`}`);
    console.log(`     traces: ${Object.keys(r.traces).join(', ')}`);
    if (r.spikeTimes) {
      const n = r.spikeTimes.length;
      let outside = 0;
      for (const s of r.spikeTimes) if (s < t0 || s > t1) outside++;
      console.log(`     spikes: ${n}${n ? `, first ${r.spikeTimes[0]} s, last ${r.spikeTimes[n - 1]} s` : ''}; ${outside} outside the imaging time span`);
    }
    console.log(`     regions: ${r.regions.map((g) => `${g.name} ${g.startS}-${g.endS}`).join('; ') || 'none'}`);

    // The producer's cleaning manifest (contract v2). Printed in full: a person confirms it.
    const roiNames = (s) => (s ? [...s].map((i) => r.rois[i].label).join(',') : 'ALL');
    console.log(`     cleaning: ${r.bridged.length} bridged stretch(es), ${r.dropped.length} roi-dropped entr(ies)`);
    for (const b of r.bridged) {
      console.log(`       bridged ${b.startS}-${b.endS} s, frames ${b.firstFrame + 1}-${b.lastFrame + 1}, ROIs ${roiNames(b.rois)}: ${b.reason}${b.rule ? ` [${b.rule}]` : ''}${b.calledBy ? ` (${b.calledBy})` : ''}`);
    }
    for (const d of r.dropped) console.log(`       dropped ${d.labels.join(', ')}: ${d.reason}${d.calledBy ? ` (${d.calledBy})` : ''}`);

    // Check, do not repair: every bridged frame of every trace it applies to should lie on the
    // straight line between its neighbours. Reported per stretch; nothing is changed.
    const offLine = [];
    for (const b of r.bridged) {
      const cols = b.rois ? [...b.rois] : r.rois.map((_, i) => i);
      for (const name of ['raw_soma', 'raw_pen']) {
        if (!r.traces[name]) continue;
        let worst = 0;
        for (const k of cols) {
          const x = roiColumn(r.traces[name], r.nFrames, k);
          const a = b.firstFrame - 1;
          const c = b.lastFrame + 1;
          for (let i = b.firstFrame; i <= b.lastFrame; i++) {
            const want = a < 0 ? x[c] : c >= r.nFrames ? x[a] : x[a] + ((x[c] - x[a]) * (i - a)) / (c - a);
            worst = Math.max(worst, Math.abs(x[i] - want) / Math.max(1, Math.abs(want)));
          }
        }
        if (worst > 1e-5) offLine.push(`${name} ${b.startS}-${b.endS} s: largest relative departure ${worst.toExponential(2)}`);
      }
    }
    console.log(`     bridged frames on a straight line: ${offLine.length ? `NO, ${offLine.length} case(s)` : 'yes, every stretch'}`);
    for (const m of offLine) console.log(`       ${m}`);

    // Where the producer shipped its dF/F0 (v2: recomputed from the cleaned raw), say how far
    // this reader's recomputation is from it, on EVERY ROI (Tony, 2026-11-16: "all rois should
    // be tested"). No bridging on this side. Reported, not judged: a difference is information.
    if (r.traces.dff_production) {
      const rows = [];
      for (let k = 0; k < r.nRoi; k++) {
        const soma = roiColumn(r.traces.raw_soma, r.nFrames, k);
        const mine = dFoverF0(soma, f0RunningMin(soma, r.dt));
        const theirs = roiColumn(r.traces.dff_production, r.nFrames, k);
        let worst = 0;
        let worstAt = -1;
        let nBig = 0;
        for (let i = 0; i < r.nFrames; i++) {
          const d = Math.abs(mine[i] - theirs[i]);
          if (d > 1e-5) nBig++;
          if (d > worst) {
            worst = d;
            worstAt = i;
          }
        }
        rows.push({ k, nBig, worst, worstAt });
      }
      const bad = rows.filter((x) => x.nBig > 0);
      console.log(`     dF/F0 recomputed from raw_soma vs dff_production, all ${r.nRoi} ROIs:`);
      console.log(`       ${r.nRoi - bad.length} of ${r.nRoi} ROIs agree to 1e-5 on every sample; largest difference anywhere ${Math.max(...rows.map((x) => x.worst)).toExponential(2)}`);
      for (const x of bad) {
        console.log(`       ROI ${x.k + 1}: ${x.nBig} of ${r.nFrames} samples differ by more than 1e-5, largest ${x.worst.toExponential(3)} at ${r.time[x.worstAt].toFixed(2)} s`);
      }
    }
    for (const w of r.warnings) console.log(`     note: ${w}`);
  } catch (e) {
    refused++;
    console.log(`REFUSED ${path.basename(f)}: ${e.message}`);
  }
}
console.log(`\n${files.length - refused} of ${files.length} read`);
process.exit(refused ? 1 : 0);
