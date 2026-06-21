// Hand-verifiable self-checks for the Tab 1 non-visual core.
// Pure JS, no deps — run with:  node src/lib/core/core.test.mjs
//
// These assert the trivial cases a human can confirm on paper, so the
// foundation is proven before any UI or animation depends on it.

import { makeGrid } from './timebase.js';
import { rasterize } from './rasterize.js';
import { buildKernel, defaultParams } from './kernels.js';
import { convolveLinear, convolveOnGrid } from './convolve.js';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// --- timebase ---------------------------------------------------------------
const grid = makeGrid({ sampleRate: 100, duration: 2 });
ok('grid n', grid.n === 200, `n=${grid.n}`);
ok('grid dt', approx(grid.dt, 0.01), `dt=${grid.dt}`);
ok('grid times[50]', approx(grid.times[50], 0.5), `t=${grid.times[50]}`);
ok('grid mode authored', grid.mode === 'authored');

// --- rasterize: snap + unit -------------------------------------------------
const r1 = rasterize([0.5], grid, { method: 'snap', amplitudeMode: 'unit' });
ok('snap places at nearest sample', r1.samples[50] === 1 && r1.placed === 1);
ok('snap leaves other bins empty', r1.samples[49] === 0 && r1.samples[51] === 0);

const r2 = rasterize([0.5, 2.5], grid); // 2.5s is past the 2s window
ok('out-of-range spike dropped', r2.placed === 1 && r2.dropped === 1);

const r3 = rasterize([0.5, 0.504], grid); // both round to index 50
ok('unit clamps collision to weight 1', r3.samples[50] === 1);
ok('collision is logged', r3.collisions === 1, `collisions=${r3.collisions}`);

// --- convolveLinear: textbook case -----------------------------------------
// [0,1,0] ⊗ [1,2,3] = [0,1,2,3,0]
const cl = convolveLinear([0, 1, 0], [1, 2, 3]);
ok('linear conv length n+m-1', cl.length === 5);
ok('linear conv values', [0, 1, 2, 3, 0].every((v, i) => approx(cl[i], v)), `[${cl}]`);

// --- the headline hand-verify: spike ⊗ boxcar reproduces the boxcar ---------
const box = buildKernel('boxcar', { length: 0.3 }, grid.dt); // 30 samples of 1
const out = convolveOnGrid(r1.samples, grid, box);
ok('boxcar kernel length', box.values.length === 30, `len=${box.values.length}`);
let boxFlat = true;
for (let i = 50; i < 80; i++) if (!approx(out.values[i], 1)) boxFlat = false;
ok('output = 1 across the boxcar span at the spike', boxFlat);
ok('output zero before the spike', out.values[49] === 0);
ok('output zero after the boxcar', out.values[80] === 0);
ok('boxcar output starts at the spike time', approx(out.times[50], 0.5), `t=${out.times[50]}`);

// --- centered Gaussian sits ON the spike (origin alignment) -----------------
const g = buildKernel('gaussian', { sigma: 0.1 }, grid.dt);
const gout = convolveOnGrid(r1.samples, grid, g);
let peakIdx = 0;
for (let i = 1; i < gout.values.length; i++) if (gout.values[i] > gout.values[peakIdx]) peakIdx = i;
ok('gaussian peak ~1', approx(gout.values[peakIdx], 1, 1e-6));
ok('gaussian peak centered on spike time', approx(gout.times[peakIdx], 0.5), `t=${gout.times[peakIdx]}`);

// --- calcium kernel: causal rise from 0, normalized peak 1 ------------------
const ca = buildKernel('calcium', defaultParams('calcium'), grid.dt);
ok('calcium starts at 0 (causal rise)', approx(ca.values[0], 0));
let caPeak = 0;
for (const v of ca.values) if (v > caPeak) caPeak = v;
ok('calcium normalized to peak 1', approx(caPeak, 1, 1e-12));
ok('calcium origin causal', ca.originOffset === 0);

// --- stubs throw behind the shared interface (ADR-0001) ---------------------
ok('antialias stub throws', throws(() => rasterize([0.5], grid, { method: 'antialias' })));
ok('binned-count stub throws', throws(() => rasterize([0.5], grid, { amplitudeMode: 'binned-count' })));

// --- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
