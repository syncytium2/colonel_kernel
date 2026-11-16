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
import { frameMask, bridgeMasked } from '../src/lib/lab/compare.js';
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
    // from it, on EVERY ROI (Tony, 2026-11-16: "all rois should be tested"), two ways:
    //   as the page computes it  - excluded stretches bridged before F0, compared outside them
    //   straight through         - no exclusion applied, every frame compared
    // Reported, not judged. The first is what the page will show; the second says what the
    // producer's own dF/F0 was computed on when the two disagree.
    if (r.traces.dff_production) {
      const TOL = 1e-6;
      const modes = [
        { name: 'exclusions bridged, compared outside them', bridged: true },
        { name: 'straight through, every frame', bridged: false },
      ];
      for (const mode of modes) {
        let within = 0;
        let worst = { diff: -1, roi: '', nDiff: 0, nCmp: 0 };
        for (let k = 0; k < r.nRoi; k++) {
          const mask = mode.bridged ? frameMask(r, k) : new Uint8Array(r.nFrames);
          const soma = bridgeMasked(roiColumn(r.traces.raw_soma, r.nFrames, k), mask);
          const mine = dFoverF0(soma, f0RunningMin(soma, r.dt));
          const theirs = roiColumn(r.traces.dff_production, r.nFrames, k);
          let big = 0;
          let nDiff = 0;
          let nCmp = 0;
          for (let i = 0; i < r.nFrames; i++) {
            if (mask[i] || !Number.isFinite(theirs[i])) continue;
            nCmp++;
            const d = Math.abs(mine[i] - theirs[i]);
            if (d > TOL) nDiff++;
            if (d > big) big = d;
          }
          if (big <= TOL) within++;
          if (big > worst.diff) worst = { diff: big, roi: r.rois[k].label, nDiff, nCmp };
        }
        console.log(`     dF/F0 recomputed vs dff_production (${mode.name}): ${within} of ${r.nRoi} ROIs within ${TOL}; worst ${worst.roi}, largest difference ${worst.diff}, ${worst.nDiff} of ${worst.nCmp} samples beyond ${TOL}`);
      }
    }
    if (r.exclusions.length) {
      const all = r.exclusions.filter((e) => !e.rois).length;
      console.log(`     exclusions: ${r.exclusions.length} (${all} for every ROI, ${r.exclusions.length - all} for named ROIs)`);
    }
    for (const w of r.warnings) console.log(`     note: ${w}`);
  } catch (e) {
    refused++;
    console.log(`REFUSED ${path.basename(f)}: ${e.message}`);
  }
}
console.log(`\n${files.length - refused} of ${files.length} read`);
process.exit(refused ? 1 : 0);
