// Rasterization (ADR-0001): place continuous spike times onto the discrete grid.
//
// ONE function, TWO independent axes:
//   - method        ∈ {"snap", "antialias"}      — timing placement
//   - amplitudeMode  ∈ {"unit", "binned-count"}  — collision / bin value
//
// v1 implements "snap" + "unit". "antialias" and "binned-count" are stubbed
// behind this same interface so they are drop-in later with no call-site churn.

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
 * @param {{ method?: 'snap'|'antialias', amplitudeMode?: 'unit'|'binned-count' }} [opts]
 * @returns {RasterResult}
 */
export function rasterize(
  spikeTimes,
  grid,
  { method = 'snap', amplitudeMode = 'unit' } = {},
) {
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

  // Binned-count: bin value is the spike count (3 spikes -> 3). Required for
  // real calcium data (ADR-0001); stubbed behind this interface for v1.
  'binned-count'() {
    throw new Error(
      "rasterize amplitudeMode 'binned-count' is not implemented yet (ADR-0001: planned)",
    );
  },
};
