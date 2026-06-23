// Hand-verifiable self-checks for the Tab 1 non-visual core.
// Pure JS, no deps — run with:  node src/lib/core/core.test.mjs
//
// These assert the trivial cases a human can confirm on paper, so the
// foundation is proven before any UI or animation depends on it.

import { makeGrid, gridFromTimeColumn } from './timebase.js';
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
ok('boxcar kernel length', box.samples.length === 30, `len=${box.samples.length}`);
let boxFlat = true;
for (let i = 50; i < 80; i++) if (!approx(out.samples[i], 1)) boxFlat = false;
ok('output = 1 across the boxcar span at the spike', boxFlat);
ok('output zero before the spike', out.samples[49] === 0);
ok('output zero after the boxcar', out.samples[80] === 0);
ok('boxcar output starts at the spike time', approx(out.times[50], 0.5), `t=${out.times[50]}`);

// --- centered Gaussian sits ON the spike (origin alignment) -----------------
const g = buildKernel('gaussian', { sigma: 0.1 }, grid.dt);
const gout = convolveOnGrid(r1.samples, grid, g);
let peakIdx = 0;
for (let i = 1; i < gout.samples.length; i++) if (gout.samples[i] > gout.samples[peakIdx]) peakIdx = i;
ok('gaussian peak ~1', approx(gout.samples[peakIdx], 1, 1e-6));
ok('gaussian peak centered on spike time', approx(gout.times[peakIdx], 0.5), `t=${gout.times[peakIdx]}`);

// --- calcium kernel: causal rise from 0, normalized peak 1 ------------------
const ca = buildKernel('calcium', defaultParams('calcium'), grid.dt);
ok('calcium starts at 0 (causal rise)', approx(ca.samples[0], 0));
let caPeak = 0;
for (const v of ca.samples) if (v > caPeak) caPeak = v;
ok('calcium normalized to peak 1', approx(caPeak, 1, 1e-12));
ok('calcium origin causal', ca.zeroIndex === 0);

// --- binned-count: reproduce MATLAB hist(spikes, timing) EXACTLY (ADR-0001/§13) ---
// Integer-exact centers so the midpoint tie-break is float-safe.
// centers [0,1,2,3] -> edges 0.5, 1.5, 2.5; max=3 (pre-filter `< 3`).
//   bin0 [-inf,0.5) bin1 [0.5,1.5) bin2 [1.5,2.5) bin3 [2.5,3)
// spikes: -0.2 below-first->bin0; 0.5 ON edge->upper bin1; 0.7->bin1; 1.5 ON
//   edge->upper bin2; 2.9->bin3; 3.0 ==max->dropped; 3.5 above->dropped.
const bcGrid = gridFromTimeColumn([0, 1, 2, 3]);
const bc = rasterize([-0.2, 0.5, 0.7, 1.5, 2.9, 3.0, 3.5], bcGrid, { amplitudeMode: 'binned-count' });
ok('binned-count exact count vector [1,2,1,1]', [1, 2, 1, 1].every((v, i) => bc.samples[i] === v), `[${bc.samples}]`);
ok('binned-count placed=5 dropped=2', bc.placed === 5 && bc.dropped === 2, `placed=${bc.placed} dropped=${bc.dropped}`);
ok('midpoint tie -> UPPER bin (0.5->bin1, 1.5->bin2)', bc.samples[1] === 2 && bc.samples[2] === 1);
ok('below-first-center counted in bin 0', bc.samples[0] === 1);
ok('spike == max(timing) is dropped (strict pre-filter)', bc.placed === 5);

// Float-safe 0.1-spaced centers, spikes deliberately OFF the edges.
// centers [0.1..0.4] -> edges ~0.15,0.25,0.35; spikes 0.12,0.18,0.22,0.31,0.39.
const bc2 = rasterize([0.12, 0.18, 0.22, 0.31, 0.39], gridFromTimeColumn([0.1, 0.2, 0.3, 0.4]), {
  amplitudeMode: 'binned-count',
});
ok('binned-count 0.1-spaced counts [1,2,1,1]', [1, 2, 1, 1].every((v, i) => bc2.samples[i] === v), `[${bc2.samples}]`);

// Jittery (non-uniform) centers: bins follow the REAL centers, not a uniform dt.
// centers [0,0.1,0.2,1.0] -> last edge midpoint(0.2,1.0)=0.6. spike 0.62 > 0.6
// -> last bin (3); a uniform-dt grid (dt=0.333) would misplace it to bin 2.
const bc3 = rasterize([0.04, 0.62], gridFromTimeColumn([0, 0.1, 0.2, 1.0]), { amplitudeMode: 'binned-count' });
ok('binned bins follow real centers (0.62->bin3, not bin2)', bc3.samples[3] === 1 && bc3.samples[2] === 0, `[${bc3.samples}]`);
ok('jittery below-first in bin 0', bc3.samples[0] === 1);

// --- preFirstBin: keep (default) vs drop (ADR-0013) --------------------------
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Explicit 'keep' must equal the default — locks default == keep.
const bcKeepExplicit = rasterize([-0.2, 0.5, 0.7, 1.5, 2.9, 3.0, 3.5], bcGrid, {
  amplitudeMode: 'binned-count',
  preFirstBin: 'keep',
});
ok('explicit keep == default output', eq(bcKeepExplicit.samples, bc.samples) && bcKeepExplicit.dropped === bc.dropped);

// Fixture with a pre-first-bin spike (-0.2) and NO upper-out-of-range spikes.
// centers [0,1,2,3]: -0.2 pre-first; 0.7->bin1; 1.7->bin2; 2.9->bin3.
const pfSpikes = [-0.2, 0.7, 1.7, 2.9];
const pfKeep = rasterize(pfSpikes, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
const pfDrop = rasterize(pfSpikes, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'drop' });
ok('keep: pre-first-bin spike lands in bin 0', pfKeep.samples[0] === 1);
ok('keep: dropped === 0 (nothing removed)', pfKeep.dropped === 0, `dropped=${pfKeep.dropped}`);
ok('drop: pre-first-bin spike absent everywhere', pfDrop.samples[0] === 0 && pfDrop.placed === 3);
ok('drop: dropped === count of pre-first-bin spikes (1)', pfDrop.dropped === 1, `dropped=${pfDrop.dropped}`);
ok(
  'drop: in-range bins bit-identical to keep (only bin 0 differs)',
  eq([...pfDrop.samples.slice(1)], [...pfKeep.samples.slice(1)]),
  `keep=[${pfKeep.samples}] drop=[${pfDrop.samples}]`,
);

// Fixture with NO pre-first-bin spike (0.0 == first center is NOT pre-first):
// the option is a no-op — identical output and dropped===0 under both.
const noPf = [0, 0.7, 1.7, 2.9];
const npKeep = rasterize(noPf, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
const npDrop = rasterize(noPf, bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'drop' });
ok(
  'no pre-first-bin: keep == drop, both dropped 0',
  eq([...npKeep.samples], [...npDrop.samples]) && npKeep.dropped === 0 && npDrop.dropped === 0,
);

// Invalid value throws.
ok(
  'unknown preFirstBin throws',
  throws(() => rasterize([0.5], bcGrid, { amplitudeMode: 'binned-count', preFirstBin: 'bogus' })),
);

// --- stubs throw behind the shared interface (ADR-0001) ---------------------
ok('antialias stub throws', throws(() => rasterize([0.5], grid, { method: 'antialias' })));

// --- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
