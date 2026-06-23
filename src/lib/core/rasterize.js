// Rasterization (ADR-0001): place continuous spike times onto the discrete grid.
//
// ONE function, TWO independent axes:
//   - method        ∈ {"snap", "antialias"}      — timing placement
//   - amplitudeMode  ∈ {"unit", "binned-count"}  — collision / bin value
//
// "snap" + "unit" and "binned-count" are implemented; "antialias" is stubbed
// behind this same interface so it is drop-in later with no call-site churn.
//
// "binned-count" is the validation-path mode (ADR-0001 / FOUNDATIONS §13): it
// reproduces MATLAB `hist(spikes, timing)` EXACTLY, because the reference kernels
// were computed from that exact binning. It is a complete placement+amplitude
// path of its own (midpoint bins against the real `times` centers), so the
// `method` axis does not apply to it — see rasterizeBinnedCount below.

/**
 * @typedef {Object} RasterResult
 * @property {Float64Array} samples  dense signal on the grid, length grid.n
 * @property {number} placed         spikes that landed on the grid
 * @property {number} dropped        spikes outside the grid window (discarded)
 * @property {number} collisions     spikes that snapped onto an already-filled
 *                                   bin and were clamped away (unit mode only)
 */

/**
 * Rasterize a spike-time list onto a grid.
 * @param {ArrayLike<number>} spikeTimes  event times (seconds), sparse list
 * @param {import('./timebase.js').Grid} grid
 * @param {{ method?: 'snap'|'antialias', amplitudeMode?: 'unit'|'binned-count', preFirstBin?: 'keep'|'drop' }} [opts]
 * @returns {RasterResult}
 */
export function rasterize(
  spikeTimes,
  grid,
  { method = 'snap', amplitudeMode = 'unit', preFirstBin = 'keep' } = {},
) {
  // binned-count is its own complete path (hist binning); it does not compose
  // with the snap/antialias placement axis. `preFirstBin` (ADR-0013) only
  // applies here.
  if (amplitudeMode === 'binned-count') return rasterizeBinnedCount(spikeTimes, grid, preFirstBin);

  const place = PLACERS[method];
  if (!place) throw new Error(`unknown rasterize method: ${method}`);
  const accumulate = ACCUMULATORS[amplitudeMode];
  if (!accumulate) throw new Error(`unknown amplitudeMode: ${amplitudeMode}`);

  const samples = new Float64Array(grid.n);
  const counts = new Int32Array(grid.n); // spikes landed per bin, for collision logic
  let placed = 0;
  let dropped = 0;

  for (let s = 0; s < spikeTimes.length; s++) {
    const t = spikeTimes[s];
    if (!Number.isFinite(t)) continue;
    // Drop spikes outside the window. Mirrors MATLAB `spikes < max(timing)`
    // (reference §3.3): out-of-range events do not exist on this grid.
    const idx = place(t, grid);
    if (idx == null) {
      dropped++;
      continue;
    }
    placed++;
    accumulate(samples, counts, idx);
  }

  let collisions = 0;
  if (amplitudeMode === 'unit') {
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 1) collisions += counts[i] - 1;
    }
  }

  return { samples, placed, dropped, collisions };
}

// --- timing-placement axis --------------------------------------------------

const PLACERS = {
  // Snap to nearest sample. Returns the bin index, or null if out of range.
  snap(t, grid) {
    const idx = Math.round((t - grid.t0) / grid.dt);
    return idx >= 0 && idx < grid.n ? idx : null;
  },

  // Anti-alias: distribute weight across straddling samples for sub-sample
  // timing. Reserved (ADR-0001) — not implemented for v1.
  antialias() {
    throw new Error(
      "rasterize method 'antialias' is not implemented yet (ADR-0001: planned)",
    );
  },
};

// --- amplitude / collision axis ---------------------------------------------

const ACCUMULATORS = {
  // Unit amplitude: each occupied bin holds weight 1, regardless of how many
  // spikes snapped into it. Extra spikes are counted as collisions (logged via
  // the `collisions` return field) — the core Tab 2 identifiability assumption.
  unit(samples, counts, idx) {
    counts[idx]++;
    samples[idx] = 1;
  },
  // Binned-count is not an accumulator here — it is a complete path
  // (rasterizeBinnedCount) routed before this table, because it bins differently
  // (midpoint edges against real centers), not just "accumulate instead of clamp".
};

// --- binned-count: exact MATLAB hist(spikes, timing) -------------------------

/**
 * Reproduce MATLAB `hist(spikes, timing)` exactly — the validation-path
 * rasterization (ADR-0001 / FOUNDATIONS §13). This is NOT `histc`: `timing` is a
 * vector of bin CENTERS, with edges at the midpoints between consecutive centers;
 * the first bin extends to -inf and the last to +inf.
 *
 * Bins are defined by the grid's `times` vector (authoritative when present,
 * ADR-0012) — the real, possibly-jittery frame centers — NOT a reconstructed
 * uniform dt grid. (A uniform `makeGrid` simply has uniform `times`.)
 *
 * Semantics, read off TDdeconvStack.m / aCa98_batch_APs.m:
 *  - Tie-break: a spike exactly on a midpoint goes to the UPPER center
 *    (`histc` interval is [left, right) — right-open).
 *  - Upper out-of-range: MATLAB pre-filters `spikes < max(timing)` BEFORE hist,
 *    so spikes at/after the last center are dropped before binning and the open
 *    last bin never absorbs them. A spike exactly at the last center is dropped.
 *  - Below the first center (the pre-first-bin region, `t < timing(1)`): governed
 *    by `preFirstBin` (ADR-0013). 'keep' (default) accumulates into the first bin
 *    (open to -inf), `hist`-faithful — the teaching path, never drops loaded data
 *    silently. 'drop' excludes such spikes and counts them in `dropped` — the
 *    validation opt-in, a v1 stand-in for the v2 buffered window (where the
 *    upstream driver's `first_spike − buffer` pad makes these impossible by
 *    construction; cf. its `AP_times > fluo_time(1)` filter, out of v1 scope).
 *
 * @param {ArrayLike<number>} spikeTimes event times (seconds)
 * @param {import('./timebase.js').Grid} grid  centers come from grid.times
 * @param {'keep'|'drop'} [preFirstBin]  pre-first-bin policy (ADR-0013)
 * @returns {import('./rasterize.js').RasterResult} samples are integer counts
 */
function rasterizeBinnedCount(spikeTimes, grid, preFirstBin = 'keep') {
  if (preFirstBin !== 'keep' && preFirstBin !== 'drop') {
    throw new Error(`unknown preFirstBin: ${preFirstBin} (expected 'keep' or 'drop')`);
  }
  const dropPreFirst = preFirstBin === 'drop';
  const centers = grid.times;
  const n = centers.length;
  const samples = new Float64Array(n);
  let placed = 0;
  let dropped = 0;
  if (n === 0) return { samples, placed, dropped, collisions: 0 };

  const firstCenter = centers[0];
  const maxTiming = centers[n - 1];
  for (let s = 0; s < spikeTimes.length; s++) {
    const t = spikeTimes[s];
    if (!Number.isFinite(t)) continue;
    // Pre-filter: mirror MATLAB `spikes < max(timing)` (strict). Dropped before
    // binning so the open last bin can't absorb out-of-range events.
    if (t >= maxTiming) {
      dropped++;
      continue;
    }
    // Pre-first-bin policy (ADR-0013): on the 'drop' path, spikes below the
    // first bin center are excluded and tallied rather than accumulated into
    // bin 0. ONLY this cell changes; in-range binning below is untouched.
    if (dropPreFirst && t < firstCenter) {
      dropped++;
      continue;
    }
    // Bin index = number of internal midpoint edges <= t. The midpoint edge
    // between centers j and j+1 is (centers[j]+centers[j+1])/2. Using `edge <= t`
    // (not `<`) places an exact-midpoint spike in the UPPER bin (right-open).
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const edge = (centers[mid] + centers[mid + 1]) / 2;
      if (edge <= t) lo = mid + 1;
      else hi = mid;
    }
    samples[lo] += 1;
    placed++;
  }
  return { samples, placed, dropped, collisions: 0 };
}
