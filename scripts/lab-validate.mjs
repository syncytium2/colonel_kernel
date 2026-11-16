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

    // Where the producer shipped its own dF/F0, say how far this reader's recomputation is
    // from it on the target ROI. Reported, not judged: a difference is information.
    if (r.traces.dff_production) {
      const k = r.targetIndex ?? 0;
      const soma = roiColumn(r.traces.raw_soma, r.nFrames, k);
      const mine = dFoverF0(soma, f0RunningMin(soma, r.dt));
      const theirs = roiColumn(r.traces.dff_production, r.nFrames, k);
      let worst = 0;
      let nDiff = 0;
      for (let i = 0; i < r.nFrames; i++) {
        const d = Math.abs(mine[i] - theirs[i]);
        if (d > 0) nDiff++;
        if (d > worst) worst = d;
      }
      console.log(`     dF/F0 recomputed from raw_soma vs dff_production, ROI ${k + 1}: ${nDiff} of ${r.nFrames} samples differ, largest difference ${worst}`);
    }
    for (const w of r.warnings) console.log(`     note: ${w}`);
  } catch (e) {
    refused++;
    console.log(`REFUSED ${path.basename(f)}: ${e.message}`);
  }
}
console.log(`\n${files.length - refused} of ${files.length} read`);
process.exit(refused ? 1 : 0);
