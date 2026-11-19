// A synthetic recording for the review page (ADR-0054): runs jsMLspike's own generator, from the checkout
// named by CK_JSMLSPIKE_DIR, into exports/review/ (gitignored). No lab data: a simulated recording whose
// six ROIs land in each case a reviewer meets, with a blind-key file (review_key.json).
//
//   CK_JSMLSPIKE_DIR=<jsMLspike checkout> npm run review-fixture [-- --small]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.env.CK_JSMLSPIKE_DIR;
if (!dir) { console.error('CK_JSMLSPIKE_DIR is not set: name a jsMLspike checkout at the commit in src/lib/review/engine-pin.json'); process.exit(1); }
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(here, 'exports', 'review');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^synth-0001_.*\.(json|bin)$/.test(f)) fs.rmSync(path.join(out, f));   // a fresh synthetic set; the decision log is kept
execFileSync(process.execPath, [path.join(path.resolve(dir), 'tools', 'make_synthetic_results.mjs'), out, ...process.argv.slice(2)], { stdio: 'inherit' });
console.log(`\nsynthetic results in ${out}; start the page with: CK_JSMLSPIKE_DIR=<checkout> npm run dev, then open http://localhost:5173/#review`);
