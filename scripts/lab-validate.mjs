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
import { f0RunningMin, dFoverF0, bridgeSpans } from '../src/lib/lab/extraction.js';

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

    console.log(`     exclusions: ${r.exclusions.map((e) => `${e.startS}-${e.endS} s${e.rois ? ` (ROIs ${[...e.rois].map((i) => i + 1).join(',')})` : ''}`).join('; ') || 'none'}`);

    // Where the producer shipped its own dF/F0, say how far this reader's recomputation is
    // from it, on EVERY ROI (Tony, 2026-11-16: "all rois should be tested"). Reported, not
    // judged: a difference is information.
    //
    // Parity bridges exactly the frames production bridged (the archive's blankfix frames,
    // `provenance.archive_notes.blank_frames`, 1-based) and nothing else: the stored dF/F0
    // was computed before the reviewer's blank windows existed, so bridging those too would
    // manufacture a difference. The lab page itself bridges every exclusion window.
    if (r.traces.dff_production) {
      const blank = r.provenance?.archive_notes?.blank_frames ?? [];
      const blankSpans = blank.map((f) => ({ startS: r.time[f - 1], endS: r.time[f - 1] }));
      const bridgeNote = blank.length ? `, archive blank frames ${blank[0]}-${blank[blank.length - 1]} bridged as production did` : '';
      const rows = [];
      for (let k = 0; k < r.nRoi; k++) {
        const raw = roiColumn(r.traces.raw_soma, r.nFrames, k);
        const soma = blankSpans.length ? bridgeSpans(raw, r.time, blankSpans).x : raw;
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
      console.log(`     dF/F0 recomputed from raw_soma vs dff_production, all ${r.nRoi} ROIs${bridgeNote}:`);
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
