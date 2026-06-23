// Noise model (ADR-0015): additive white Gaussian noise (AWGN), with its level
// expressed in COHORT-TYPICAL units. One module serves both consumers of the
// model — the user-facing noise-injection slider (FOUNDATIONS §7 / §11.2) and the
// machinery-check synthetic oracle (machinery-check.mjs).
//
// The slider runs 0 → 10× cohort-typical σ. 1× is the recon-derived clean-active
// baseline-region median, σ ≈ 0.0024 dF/F₀ (ADR-0015 Context). Default level is
// 0 / off (§11.2). The richer model (per-region conditioning, σ-as-distribution,
// the shot term) is deferred to v2.

/** Cohort-typical residual σ on quiescent baseline regions, dF/F₀ (ADR-0015). */
export const SIGMA_COHORT_TYPICAL = 0.0024;

/** Slider domain: 0 → 10× cohort-typical (ADR-0015). */
export const NOISE_LEVEL_MAX = 10;

/**
 * Absolute σ (dF/F₀) for a slider level in cohort-typical units.
 * level 0 → 0 (clean); level 1 → SIGMA_COHORT_TYPICAL; level 10 → 10×.
 * @param {number} level slider value, clamped to [0, NOISE_LEVEL_MAX]
 * @returns {number} σ in dF/F₀
 */
export function sigmaForLevel(level) {
  const L = Math.min(NOISE_LEVEL_MAX, Math.max(0, level));
  return L * SIGMA_COHORT_TYPICAL;
}

/**
 * Deterministic PRNG (mulberry32) — a seeded source so harness runs and tests are
 * reproducible. NOT for cryptographic use. The app slider may pass Math.random.
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One standard-normal sample via Box–Muller from a uniform source.
 * @param {() => number} rand uniform [0,1) source
 * @returns {number}
 */
export function gaussian(rand) {
  // Avoid log(0): u1 ∈ (0,1].
  const u1 = 1 - rand();
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Add i.i.d. Gaussian noise of a given absolute σ to a signal (out-of-place).
 * @param {ArrayLike<number>} samples clean signal
 * @param {number} sigma absolute σ in signal units (dF/F₀); 0 → returns a copy
 * @param {() => number} [rand] uniform source (default Math.random)
 * @returns {Float64Array} noisy copy, same length
 */
export function addAWGN(samples, sigma, rand = Math.random) {
  const n = samples.length;
  const out = new Float64Array(n);
  if (!(sigma > 0)) {
    for (let i = 0; i < n; i++) out[i] = samples[i];
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = samples[i] + sigma * gaussian(rand);
  return out;
}
