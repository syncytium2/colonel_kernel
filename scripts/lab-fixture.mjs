// Write a SIMULATED lab recording into exports/ (gitignored), for the lab page (ADR-0053).
//
//   npm run lab-fixture            -> exports/SIMULATED_<seed>.klab.json
//   npm run lab-fixture -- 7       -> the same with seed 7
//
// No lab data: see src/lib/lab/simulate.js for what is modelled and what is chosen.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulatedLabRecording, SIM_DEFAULTS } from '../src/lib/lab/simulate.js';
import { parseLabRecording } from '../src/lib/lab/recording.js';

const seed = process.argv[2] ? Number(process.argv[2]) : SIM_DEFAULTS.seed;
if (!Number.isInteger(seed)) throw new Error('seed must be a whole number');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'exports');
mkdirSync(dir, { recursive: true });
const file = await simulatedLabRecording({ seed });
file.provenance.created = new Date().toISOString();
const dest = path.join(dir, `${file.slice_id}.klab.json`);
writeFileSync(dest, JSON.stringify(file));

// Read it back before calling it written.
const back = await parseLabRecording(readFileSync(dest, 'utf8'));
console.log(`wrote ${dest}`);
console.log(`  ${back.nRoi} ROIs, ${back.nFrames} frames at ${1 / back.dt} Hz, ${back.spikeTimes.length} spikes, ${back.regions.length} regions`);
