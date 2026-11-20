// Timing landmarks for a kernel or STA curve (lab only, ADR-0053).
//
// t50 rise (Tony, 2026-11-20: "instead of peak time, we need the t50rise time"): the lag at
// which the curve, on its way up to the peak the page already reports, last crosses half of
// that peak's height. Heights are measured from zero, as the reported peak amplitude is.
// Walking back from the peak (not forward from the left edge) means a wiggle far before the
// rise cannot be mistaken for it. The crossing is linearly interpolated between the two
// samples that straddle it. The lag is relative to the spike, so it can be negative.
//
// Returns NaN, reported as "—", when there is no answer: the peak is not above zero, a
// non-finite sample is met before the crossing, or the curve never falls below half before
// the window's left edge.

/**
 * @param {ArrayLike<number>} samples
 * @param {ArrayLike<number>} times   lag of each sample (s), same length, increasing
 * @param {number} peakIndex          index of the peak to rise to
 * @param {number} [frac=0.5]         fraction of the peak height (0.5 for t50)
 * @returns {number} lag (s) of the crossing, or NaN
 */
export function riseCrossingLag(samples, times, peakIndex, frac = 0.5) {
  const peak = samples[peakIndex];
  if (!(peak > 0) || !(frac > 0 && frac < 1)) return NaN;
  const level = frac * peak;
  for (let i = peakIndex; i > 0; i--) {
    const hi = samples[i];
    const lo = samples[i - 1];
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return NaN;
    if (lo < level) {
      // samples[i] >= level > samples[i-1]: interpolate between them.
      const t = (level - lo) / (hi - lo);
      return times[i - 1] + t * (times[i] - times[i - 1]);
    }
  }
  return NaN;
}

/** Index of the sample nearest a given lag. */
export function indexAtLag(times, lagS) {
  if (!Number.isFinite(lagS)) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - lagS);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
