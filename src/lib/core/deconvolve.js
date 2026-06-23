// Regularized kernel recovery (ADR-0004), the flagship Tab 2 math, reimplemented
// from the lab `deconvreg` pipeline (docs/reference/matlab-deconv-pipeline.md).
//
// The commutativity trick (reference §3.1): the calcium TRACE is the "image" and
// the binned spike density is the "PSF", so the deconvolved "input" that comes
// back IS the kernel. Recovery is regularized least squares (Tikhonov) with a
// Laplacian smoothness prior — the `deconvreg` family — but with the
// regularization strength EXPLICIT (λ), not silently defaulted (ADR-0004, §3.2).
//
// Convention: frequency-domain (circular) deconvolution, matching `deconvreg`.
// Zero-lag lands at index 0 of the circular result; the symmetric ±window kernel
// (ADR-0009: length 2·window+1, zeroIndex = window) is extracted by wrapping the
// negative lags from the high end of the array. Retaining the negative-lag half is
// deliberate — it encodes coupling direction (ADR-0004, FOUNDATIONS §4).

import FFT from 'fft.js';

/** Smallest power of two ≥ n. */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// --- minimal complex-spectrum helpers over fft.js ---------------------------
// fft.js stores complex arrays interleaved [re,im,re,im,…] of length 2N, and its
// inverseTransform is already 1/N-normalized.

function forwardFFT(fft, real) {
  const input = fft.toComplexArray(real); // imag = 0
  const out = fft.createComplexArray();
  fft.transform(out, input);
  return out;
}

function inverseFFTReal(fft, complex) {
  const out = fft.createComplexArray();
  fft.inverseTransform(out, complex);
  const N = fft.size;
  const re = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = out[2 * i];
  return re;
}

/**
 * Circular convolution of two length-N real signals via FFT (pointwise product).
 * Used to forward-generate synthetic traces in the machinery check — the exact
 * inverse of the circular deconvolution below, so a noise-free recovery is exact
 * up to regularization bias.
 * @param {ArrayLike<number>} a length N (power of two)
 * @param {ArrayLike<number>} b length N (power of two)
 * @returns {Float64Array} length N
 */
export function circularConvolve(a, b) {
  const N = a.length;
  if (b.length !== N) throw new Error('circularConvolve: length mismatch');
  if ((N & (N - 1)) !== 0) throw new Error('circularConvolve: length must be a power of two');
  const fft = new FFT(N);
  const A = forwardFFT(fft, a);
  const B = forwardFFT(fft, b);
  const C = fft.createComplexArray();
  for (let i = 0; i < N; i++) {
    const ar = A[2 * i], ai = A[2 * i + 1];
    const br = B[2 * i], bi = B[2 * i + 1];
    C[2 * i] = ar * br - ai * bi;
    C[2 * i + 1] = ar * bi + ai * br;
  }
  return inverseFFTReal(fft, C);
}

/**
 * Recover the kernel from a trace and a spike density by regularized least
 * squares (ADR-0004). Both inputs are length N (power of two); the result is the
 * full circular latent signal — zero-lag at index 0.
 *
 *   H[k] = conj(S[k])·Y[k] / ( |S[k]|² + λ·|Lap[k]|² )
 *
 * |Lap[k]|² = (2 − 2cos(2πk/N))² is the DFT power of the discrete second
 * difference [1,−2,1] — the Laplacian smoothness prior. λ = 0 is the naive inverse
 * (noise-amplifying; ADR-0004 keeps it only as a teaching "watch it fail").
 *
 * @param {ArrayLike<number>} trace length N
 * @param {ArrayLike<number>} spikeDensity length N
 * @param {number} lambda regularization strength (≥ 0), explicit (ADR-0004)
 * @returns {Float64Array} recovered latent signal, length N, zero-lag at index 0
 */
export function deconvolveCircular(trace, spikeDensity, lambda) {
  const N = trace.length;
  if (spikeDensity.length !== N) throw new Error('deconvolveCircular: length mismatch');
  if ((N & (N - 1)) !== 0) throw new Error('deconvolveCircular: length must be a power of two');
  const fft = new FFT(N);
  const Y = forwardFFT(fft, trace);
  const S = forwardFFT(fft, spikeDensity);
  const H = fft.createComplexArray();
  for (let k = 0; k < N; k++) {
    const sr = S[2 * k], si = S[2 * k + 1];
    const yr = Y[2 * k], yi = Y[2 * k + 1];
    // Laplacian power at this bin.
    const c = Math.cos((2 * Math.PI * k) / N);
    const lap = (2 - 2 * c) ** 2;
    const denom = sr * sr + si * si + lambda * lap + 1e-12;
    // conj(S)·Y = (sr − i·si)(yr + i·yi)
    const numRe = sr * yr + si * yi;
    const numIm = sr * yi - si * yr;
    H[2 * k] = numRe / denom;
    H[2 * k + 1] = numIm / denom;
  }
  return inverseFFTReal(fft, H);
}

/**
 * Extract the symmetric ±window kernel (ADR-0009 contract) from a circular latent
 * signal whose zero-lag is at index 0. Negative lags are taken by wrapping from
 * the high end of the array.
 * @param {ArrayLike<number>} latent length N, zero-lag at index 0
 * @param {number} windowSamples half-window in samples
 * @param {number} dt sample interval (seconds)
 * @returns {{ samples: Float64Array, zeroIndex: number, dt: number, times: Float64Array }}
 */
export function extractSymmetric(latent, windowSamples, dt) {
  const N = latent.length;
  const len = 2 * windowSamples + 1;
  const samples = new Float64Array(len);
  const times = new Float64Array(len);
  for (let j = -windowSamples; j <= windowSamples; j++) {
    samples[windowSamples + j] = latent[((j % N) + N) % N];
    times[windowSamples + j] = j * dt;
  }
  return { samples, zeroIndex: windowSamples, dt, times };
}

/**
 * Full recovery: trace + spike density → symmetric recovered kernel.
 * @param {ArrayLike<number>} trace length N (power of two)
 * @param {ArrayLike<number>} spikeDensity length N
 * @param {{ windowSamples: number, dt: number, lambda?: number }} opts
 * @returns {{ samples: Float64Array, zeroIndex: number, dt: number, times: Float64Array }}
 */
export function recoverKernel(trace, spikeDensity, { windowSamples, dt, lambda = 0 }) {
  const latent = deconvolveCircular(trace, spikeDensity, lambda);
  return extractSymmetric(latent, windowSamples, dt);
}
