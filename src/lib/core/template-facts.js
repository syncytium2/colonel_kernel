// Facts ABOUT the input template, split out from the generator that produces it.
//
// Why a separate module: Tab 0's copy quotes these numbers ("1200 frames at 10 Hz, two
// ROIs, two regions"), so the UI needs them on first paint — but it does NOT need the
// generator. This file has no imports at all, so quoting the numbers costs nothing and
// the generator stays behind a dynamic import (FOUNDATIONS §6 code-split discipline).
// Note the saving is the generator chunk, not the convolution core: App.svelte already
// imports that statically for Tab 1, so it is in the entry bundle either way.
//
// make-template.js imports these and is the single place they are USED, so the copy on
// screen and the bytes in the file cannot disagree.

/** Sampling rate of the example recording (Hz). */
export const RATE_HZ = 10;

/** Length of the example recording (s). */
export const DURATION_S = 120;

/** baseline | high K+ boundary (s). */
export const SPLIT_S = 60;

// Region NAMES are load-bearing, not decorative: regionType() in load-xlsx.js reads them
// to pick the ADR-0035 protocol window. 'baseline' and 'high K+' are both safe at this
// short duration — baseline is anchored at its end, hiK is taken raw. A name that
// classified as a *treatment* would have 120 s of wash-in delay (SOLUTION_DELAY_S)
// trimmed off the front, which at 60 s long would leave no window at all. Surviving a
// 2-minute example is the whole reason these two names were chosen.
export const REGIONS = [
  { name: 'baseline', startS: 0, endS: SPLIT_S },
  { name: 'high K+', startS: SPLIT_S, endS: DURATION_S },
];

/** The kernel the example trace is built from — the value Tab 2 should recover. */
export const TRUE_KERNEL = { tauRise: 0.15, tauDecay: 0.5 };

/** Peak height of that kernel (dF/F₀). */
export const TRUE_PEAK = 0.1;

/** roi2 is the same cell driven more weakly — a second ROI, not a copy. */
export const ROI2_GAIN = 0.45;

/** Fixed so every download is byte-identical. */
export const SEED = 20260730;

/** How many ROI columns the trace sheet carries. `roi1` targeted, `roi2` the weaker neighbour. */
export const ROI_COUNT = 2;

/**
 * Human-readable summary for UI copy. Single source of truth for the numbers on screen —
 * anything Tab 0 states about the example must be read from here, never retyped, or the
 * copy and the file drift apart the first time a constant moves.
 */
export const TEMPLATE_FACTS = {
  rateHz: RATE_HZ,
  durationS: DURATION_S,
  frames: RATE_HZ * DURATION_S,
  rois: ROI_COUNT,
  regions: REGIONS.map((r) => r.name),
  tauRise: TRUE_KERNEL.tauRise,
  tauDecay: TRUE_KERNEL.tauDecay,
  peak: TRUE_PEAK,
};
