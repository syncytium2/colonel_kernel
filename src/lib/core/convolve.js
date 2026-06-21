// Linear convolution (ADR-0006): hand-written, zero-padded, NO circular wrap.
//
// Direct "stamp and sum": for each occupied input sample, add a scaled copy of
// the kernel at that offset and accumulate the overlaps. This is exactly the
// teaching description (stamp the kernel at each delta, scaled by amplitude),
// and it is the sparse-efficient form for spike trains — empty samples are
// skipped. The full linear output has length x.length + h.length - 1; a kernel
// tail running past the window extends the output rather than folding back.

/**
 * Linear convolution of a dense signal with a kernel.
 * @param {ArrayLike<number>} x input samples (e.g. rasterized spike train)
 * @param {ArrayLike<number>} h kernel samples
 * @returns {Float64Array} length x.length + h.length - 1
 */
export function convolveLinear(x, h) {
  const nx = x.length;
  const nh = h.length;
  if (nx === 0 || nh === 0) return new Float64Array(0);
  const out = new Float64Array(nx + nh - 1);
  for (let i = 0; i < nx; i++) {
    const xi = x[i];
    if (xi === 0) continue; // sparse: nothing to stamp here
    for (let j = 0; j < nh; j++) out[i + j] += xi * h[j];
  }
  return out;
}

/**
 * Convolve a rasterized input with a built kernel and return the result on a
 * spike-aligned time axis. The kernel's `originOffset` shifts the axis so that
 * kernel-time-0 lands at the spike: causal kernels extend right from the spike,
 * symmetric kernels straddle it.
 *
 * @param {Float64Array} samples rasterized input on the grid
 * @param {import('./timebase.js').Grid} grid
 * @param {import('./kernels.js').Kernel} kernel
 * @returns {{ values: Float64Array, times: Float64Array }}
 */
export function convolveOnGrid(samples, grid, kernel) {
  const values = convolveLinear(samples, kernel.values);
  const times = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    times[i] = grid.t0 + (i - kernel.originOffset) * grid.dt;
  }
  return { values, times };
}
