// Parameterized kernel library (ADR-0003): a fixed set of canonical shapes,
// each with live parameters. No freehand / typed kernels.
//
// A built kernel is a dense array of `samples` on the grid's dt, plus a
// `zeroIndex`: the index in `samples` that aligns with the spike (kernel
// time 0). Causal shapes have zeroIndex 0 (kernel starts at the spike); symmetric
// shapes center the origin. Convolution uses zeroIndex to place the output
// on the correct time axis (see convolve.js).
//
// This is the signal contract of ADR-0009 / FOUNDATIONS §13:
// { samples, dt, zeroIndex } with an optional authoritative `times`
// (ADR-0012). A kernel is a constructed uniform signal, so `dt + zeroIndex +
// length` is exact; `times` is carried as a derived convenience and is always
// consistent with dt here (never in disagreement).
//
// Samples carry literal amplitudes (peak ~1), NOT area-normalization, so the
// teaching identity holds: one unit spike ⊗ a kernel reproduces the kernel's
// samples at the spike location.

/**
 * @typedef {Object} Kernel
 * @property {string} id
 * @property {string} label
 * @property {Float64Array} samples
 * @property {number} zeroIndex  index of kernel-time-0 within `samples`
 * @property {number} dt         sample interval (seconds), derived convenience
 * @property {Float64Array} times kernel time axis (seconds), length samples.length
 * @property {Object} params
 */

/** Library metadata + parameter schemas — drives the UI controls. */
export const KERNEL_LIBRARY = [
  {
    id: 'gaussian',
    label: 'Gaussian',
    params: [{ key: 'sigma', label: 'width σ (s)', min: 0.01, max: 0.5, step: 0.01, default: 0.1 }],
  },
  {
    id: 'exponential',
    label: 'Exponential decay',
    params: [{ key: 'tau', label: 'τ (s)', min: 0.02, max: 1, step: 0.01, default: 0.2 }],
  },
  {
    id: 'boxcar',
    label: 'Boxcar',
    params: [{ key: 'length', label: 'length (s)', min: 0.02, max: 1, step: 0.01, default: 0.3 }],
  },
  {
    id: 'calcium',
    label: 'Calcium indicator',
    params: [
      { key: 'tauRise', label: 'τ rise (s)', min: 0.01, max: 0.3, step: 0.01, default: 0.2 },
      { key: 'tauDecay', label: 'τ decay (s)', min: 0.05, max: 2, step: 0.05, default: 0.4 },
    ],
  },
];

/** Default params for a library entry, keyed by param key. */
export function defaultParams(id) {
  const entry = KERNEL_LIBRARY.find((k) => k.id === id);
  if (!entry) throw new Error(`unknown kernel id: ${id}`);
  return Object.fromEntries(entry.params.map((p) => [p.key, p.default]));
}

/**
 * Build a kernel's samples on a given dt.
 *
 * Builders emit the canonical peak-1 shape; `amplitude` scales that peak to a
 * literal dF/F₀ height. This is the ONE place kernel height is set, so the
 * teaching identity still holds — a unit spike ⊗ kernel reproduces these
 * (now scaled) samples — and the convolution output, the kernel plot, and the
 * SNR readout all inherit the same scale. Default 1 keeps every existing caller
 * (and the peak-1 core tests) byte-identical.
 * @param {string} id
 * @param {Object} params
 * @param {number} dt sample interval (seconds)
 * @param {number} [amplitude=1] peak height (dF/F₀); scales the peak-1 shape
 * @returns {Kernel}
 */
export function buildKernel(id, params, dt, amplitude = 1) {
  const builder = BUILDERS[id];
  if (!builder) throw new Error(`unknown kernel id: ${id}`);
  const { samples, zeroIndex } = builder(params, dt);
  if (amplitude !== 1) for (let i = 0; i < samples.length; i++) samples[i] *= amplitude;
  const entry = KERNEL_LIBRARY.find((k) => k.id === id);
  const times = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) times[i] = (i - zeroIndex) * dt;
  return { id, label: entry.label, samples, zeroIndex, dt, times, params };
}

// Every shape's support is cut where its tail has fallen below TAIL_EPS of the
// kernel's peak, so the step down to zero at the end of the array is at most
// that fraction for ANY parameter setting. Support rules stated in σ or τ alone
// do not have that property — the old ±3σ and 5τ cutoffs left steps of 1.1% and
// 0.7% of peak, and the calcium shape left up to ~9% when τrise approached
// τdecay. A step is broadband in frequency, so it seeds ringing in the Tab 2 FFT
// deconvolution; cutting on amplitude makes the residual the same small number
// everywhere. The per-shape factors below are this threshold solved for t, and
// each is rounded OUTWARD to a whole sample — rounding to nearest can land a
// half-sample short, which for the steep Gaussian tail alone doubles the step.
const TAIL_EPS = 1e-3;
const GAUSS_TAIL_SIGMA = Math.sqrt(-2 * Math.log(TAIL_EPS)); // ≈ 3.72σ
const EXP_TAIL_TAU = -Math.log(TAIL_EPS); // ≈ 6.91τ
// The calcium difference-of-exponentials has no closed-form cutoff, so it is
// found by scanning. This caps the scan: the slowest case is τrise → τdecay,
// where the shape tends to t·exp(-t/τ) and reaches TAIL_EPS at ≈ 10.2τ. The cap
// is margin, not the operating point — it does not bind anywhere in the UI's
// parameter ranges (deepest support actually used is ~11τ, on a coarse grid).
const CALCIUM_TAIL_CAP_TAU = 12;

const BUILDERS = {
  // Symmetric bell, peak 1, centered on the spike.
  gaussian({ sigma }, dt) {
    const half = Math.max(1, Math.ceil((GAUSS_TAIL_SIGMA * sigma) / dt));
    const n = 2 * half + 1;
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i - half) * dt;
      samples[i] = Math.exp(-0.5 * (t / sigma) ** 2);
    }
    return { samples, zeroIndex: half };
  },

  // Causal exponential decay, value 1 at the spike.
  exponential({ tau }, dt) {
    const n = Math.max(2, Math.ceil((EXP_TAIL_TAU * tau) / dt) + 1);
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.exp(-(i * dt) / tau);
    return { samples, zeroIndex: 0 };
  },

  // Causal rectangle of height 1, from the spike forward. The cleanest
  // hand-verify shape: one unit spike ⊗ boxcar reproduces the boxcar.
  boxcar({ length }, dt) {
    const n = Math.max(1, Math.round(length / dt));
    return { samples: new Float64Array(n).fill(1), zeroIndex: 0 };
  },

  // Causal calcium transient: difference of exponentials, normalized to peak 1.
  // k(t) = exp(-t/tauDecay) - exp(-t/tauRise), t >= 0.
  calcium({ tauRise, tauDecay }, dt) {
    // Guard: rise must be faster than decay for a real transient shape.
    const rise = Math.min(tauRise, tauDecay * 0.999);
    const nMax = Math.max(2, Math.ceil((CALCIUM_TAIL_CAP_TAU * tauDecay) / dt) + 1);
    const full = new Float64Array(nMax);
    let peak = 0;
    let peakIndex = 0;
    for (let i = 0; i < nMax; i++) {
      const t = i * dt;
      const v = Math.exp(-t / tauDecay) - Math.exp(-t / rise);
      full[i] = v;
      if (v > peak) {
        peak = v;
        peakIndex = i;
      }
    }
    // Scan forward from the peak, not from t=0: the causal rise starts at
    // k(0)=0, which is below the threshold but is not the tail.
    let n = nMax;
    for (let i = peakIndex + 1; i < nMax; i++) {
      if (full[i] < TAIL_EPS * peak) {
        n = i + 1; // keep the first below-threshold sample as the last one
        break;
      }
    }
    const samples = full.slice(0, n);
    if (peak > 0) for (let i = 0; i < n; i++) samples[i] /= peak;
    return { samples, zeroIndex: 0 };
  },
};
