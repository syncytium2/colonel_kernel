// Global timebase (ADR-0002): one shared sample grid across all tabs.
//
// Two modes via a flag:
//   - "authored"  — defaults the user can edit (teaching side; Tab 1).
//   - "loaded"    — derived from a CSV time column and locked (calcium side).
// Tab 1 only uses "authored"; the flag is carried so downstream code
// (rasterizer, plot axes, control enable/disable) can branch on it later.

/**
 * @typedef {Object} Grid
 * @property {number} t0         time of the first sample (seconds)
 * @property {number} dt         sample interval (seconds)
 * @property {number} n          number of samples
 * @property {number} sampleRate samples per second (1/dt)
 * @property {number} duration   window length (seconds), n*dt
 * @property {'authored'|'loaded'} mode
 * @property {Float64Array} times sample times, length n
 */

/**
 * Build an authored grid from a sample rate and window duration.
 * @param {{ sampleRate?: number, duration?: number, t0?: number }} [opts]
 * @returns {Grid}
 */
export function makeGrid({ sampleRate = 100, duration = 2, t0 = 0 } = {}) {
  if (!(sampleRate > 0)) throw new Error('sampleRate must be > 0');
  if (!(duration > 0)) throw new Error('duration must be > 0');

  const dt = 1 / sampleRate;
  const n = Math.max(1, Math.round(duration * sampleRate));
  const times = new Float64Array(n);
  for (let i = 0; i < n; i++) times[i] = t0 + i * dt;

  return { t0, dt, n, sampleRate, duration: n * dt, mode: 'authored', times };
}

/**
 * Derive a locked grid from a CSV time column (calcium side; ADR-0002 loaded mode).
 * Not used by Tab 1 yet — included so the loaded path has a home from day one.
 * @param {ArrayLike<number>} timeColumn dense, regular frame times (seconds)
 * @returns {Grid}
 */
export function gridFromTimeColumn(timeColumn) {
  const n = timeColumn.length;
  if (n < 2) throw new Error('time column needs at least 2 samples');
  const t0 = timeColumn[0];
  // mean(diff(timing)) — matches the MATLAB delta_t convention (reference §3.4).
  const dt = (timeColumn[n - 1] - t0) / (n - 1);
  const times = Float64Array.from(timeColumn);
  return { t0, dt, n, sampleRate: 1 / dt, duration: n * dt, mode: 'loaded', times };
}
