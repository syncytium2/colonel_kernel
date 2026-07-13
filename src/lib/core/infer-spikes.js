// Tab 3 (honest illustration): naive spike inference by deconvolution.
//
// Given a measured trace y and an ASSUMED kernel k, recover the input x such
// that x ⊛ k ≈ y. This is the SAME regularized circular deconvolution as the
// Tab 2 flagship (`deconvolveCircular`, ADR-0004) pointed the other way: Tab 2
// solves for the kernel given known spikes; Tab 3 solves for the spikes given
// an assumed kernel.
//
// FOUNDATIONS §2: Tab 3 is kept as an HONEST ILLUSTRATION of why naive spike
// inference is hard — NOT a recommended workflow (the real methods — CASCADE,
// MLspike, OASIS — live in a separate project). The recovered x is expected to
// be messy next to the true delta train: ringing, and lobes that go NEGATIVE
// even though a real spike count cannot. That mess is the lesson, so nothing
// here clamps or prettifies it.

import { nextPow2, deconvolveCircular } from './deconvolve.js';

/**
 * Build a circular PSF (length N, zero-lag at index 0) from a symmetric-lag
 * kernel Signal {samples, zeroIndex}. Positive lags map to indices 1.., negative
 * lags wrap to the high end, lag 0 sits at index 0 — the convention
 * `deconvolveCircular` expects for its PSF operand.
 * @param {{samples: ArrayLike<number>, zeroIndex: number}} kernel
 * @param {number} N power-of-two length
 * @returns {Float64Array} length N
 */
export function kernelToCircularPsf(kernel, N) {
  const psf = new Float64Array(N);
  const { samples, zeroIndex } = kernel;
  for (let i = 0; i < samples.length; i++) {
    const lag = i - zeroIndex; // lag in samples (negative on the acausal half)
    const idx = ((lag % N) + N) % N; // wrap negative lags to the high end
    psf[idx] += samples[i];
  }
  return psf;
}

/**
 * Naive spike inference: recover the input x on the recording grid from a trace
 * y and an assumed kernel, by regularized circular deconvolution.
 *
 * λ = 0 is the naive inverse — noise-amplifying, the "watch it fail" case that
 * is the whole point of Tab 3. λ > 0 (Tikhonov / Laplacian, same prior as
 * Tab 2) tames the ringing but blurs the deltas and never restores a clean
 * count. The trace is zero-padded to a power of two before the FFT, which also
 * softens the circular wrap-around at the ends.
 *
 * @param {ArrayLike<number>} trace measured trace on the grid (length n)
 * @param {{samples: ArrayLike<number>, zeroIndex: number}} kernel assumed kernel (symmetric-lag)
 * @param {{lambda?: number}} [opts]
 * @returns {Float64Array} recovered input, length n, aligned to the grid samples
 */
export function inferSpikes(trace, kernel, { lambda = 0 } = {}) {
  const n = trace.length;
  const N = nextPow2(Math.max(2, n));
  const y = new Float64Array(N);
  y.set(trace.length <= N ? trace : Array.prototype.slice.call(trace, 0, N));
  const psf = kernelToCircularPsf(kernel, N);
  const latent = deconvolveCircular(y, psf, lambda);
  return latent.slice(0, n); // input sample i ↔ grid sample i
}

/**
 * Honest-illustration summary of a recovered input against the true spike
 * train — the numbers Tab 3 surfaces to make the failure legible rather than
 * hiding it.
 * @param {ArrayLike<number>} recovered length n
 * @param {ArrayLike<number>} truthRaster the true binned spike density, length n
 * @returns {{ negativeFraction: number, peakRatio: number, correlation: number }}
 *   negativeFraction — share of recovered samples below zero (a real count can't be),
 *   peakRatio — recovered peak / true peak (naive inversion overshoots),
 *   correlation — Pearson r between recovered and truth (how much structure survived).
 */
export function inferenceReport(recovered, truthRaster) {
  const n = recovered.length;
  let neg = 0;
  let recPeak = 0;
  let truthPeak = 0;
  for (let i = 0; i < n; i++) {
    if (recovered[i] < 0) neg++;
    const a = Math.abs(recovered[i]);
    if (a > recPeak) recPeak = a;
    if (truthRaster[i] > truthPeak) truthPeak = truthRaster[i];
  }
  return {
    negativeFraction: n ? neg / n : 0,
    peakRatio: truthPeak > 0 ? recPeak / truthPeak : Infinity,
    correlation: pearson(recovered, truthRaster),
  };
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : NaN;
}
