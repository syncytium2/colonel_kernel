// AP-independent calcium — the mixing model behind the "AP-independent" slider.
//
// WHY THIS EXISTS. Every tab's null model is the same one the tool exists to test: every
// calcium event is one kernel stamped down once per action potential, so the whole trace is
// `spikes ⊗ kernel`. The phenomenon that breaks it — calcium with no spikes underneath —
// was only visible on Tab 0's premise figure, where it is baked in and cannot be varied.
// This module makes it a CONTROL: one dial from 0 (everything the kernel explains) to 1
// (nothing it explains), so a user can watch recovery, inference and the fit statistics
// degrade as the assumption fails, instead of being told that they do.
//
// THE MODEL, in one line:
//
//     trace(mix) = (1 − mix) · AP-linked  +  Σ AP-independent events(mix)
//
// Two things move together as `mix` rises, and both are deliberate:
//
//   1. The AP-linked component FADES. At mix = 1 there is none left, so the spike train
//      explains nothing — which is what "all AP-independent" has to mean.
//   2. AP-independent events ACCUMULATE, most-defensible first (the ones sitting in the
//      widest spike-free stretches), each fading in rather than popping into existence, so
//      the slider is continuous from zero.
//
// MODELED ON `_80` (APs_v1_20241004, ROI 1) — the recording FOUNDATIONS §3 anatomizes.
// Its ~790 s episode is the reference specimen: a transient beginning 0.46 s after the last
// AP, rising for six seconds, cresting at 0.247 dF/F₀, with not one AP between 786.25 s and
// 800 s — against 0.037 dF/F₀ for the ordinary 10-AP burst that preceded it. Two facts from
// that record are what this module reproduces:
//
//   - AP-independent events are BIG relative to anything the spikes produce (there, ~6.7×
//     the biggest AP-linked response in the record; `AMP_RANGE` below is deliberately more
//     conservative than that, so the y-axis stays readable).
//   - They are the WRONG SHAPE for the AP kernel — either too symmetric or far too slow.
//     That shape mismatch is the diagnostic; see `AP_INDEPENDENT_SHAPES`.
//
// NOTE what this is NOT. FOUNDATIONS §3 is explicit that the _80 episode does not settle
// whether that calcium is genuinely AP-independent, an AP-evoked event with anomalous gain,
// or a neighbouring cell inside the ROI — that is the human's call. This module models the
// SIGNAL those readings share (calcium the spike train cannot account for), not a verdict
// about the cell. Nothing here is evidence about a real recording.

import { buildKernel } from './kernels.js';
import { mulberry32 } from './noise.js';

/**
 * Morphologies for AP-independent calcium events. Both were visible in the real ROI-1
 * recording, and neither looks like the AP-linked transient (peak at 0.60 s, τ 2.7 s):
 *
 *   narrow — tall but brief and near-symmetric. Rise-to-peak 0.73 s against a 0.9 s decay,
 *            so it goes up and comes back down at nearly the same rate and is over in ~5 s.
 *   slow   — medium rise, very long tail. 2.7 s to peak, then a 12 s decay constant, so it
 *            is still visibly elevated most of a minute later.
 *
 * The shape mismatch is not decoration: an event that does not fit the AP kernel is one a
 * kernel fit cannot explain, which is what the tool's diagnostics are for.
 *
 * This is the canonical definition — Tab 0's premise simulation imports it from here, so
 * the figure that argues the phenomenon and the slider that injects it cannot drift apart.
 */
export const AP_INDEPENDENT_SHAPES = {
  // Gaussian, not a difference of exponentials: a double-exponential always leaves a tail
  // longer than its rise, so it cannot be made symmetric no matter how the τ values are
  // set. σ 0.9 s gives a ~2.1 s width at half height — tall, brief, and up and down at the
  // same rate, which is what the real recording showed.
  narrow: { kernel: 'gaussian', params: { sigma: 0.9 } },
  // Same family as the AP kernel, pushed far from its parameters: 2.7 s to peak against a
  // 12 s decay constant, so it is still elevated most of a minute later.
  slow: { kernel: 'calcium', params: { tauRise: 1.0, tauDecay: 12 } },
};

/** Shape assigned to the k-th event. Alternating, so both morphologies show by the second
 *  event rather than whenever a random draw gets round to it (the _80 record showed both,
 *  and one shape stamped repeatedly reads as an artifact rather than as physiology). */
const SHAPE_ORDER = ['narrow', 'slow'];

export const AP_INDEPENDENT_DEFAULTS = {
  /** Events per minute at mix = 1. One every 30 s: dense enough that a trace made only of
   *  these reads as continuously contaminated, sparse enough that they stay countable. */
  ratePerMin: 2,
  /** Event peak, as a multiple of the reference AP-linked amplitude. Drawn per event in
   *  this range. The real _80 ratio is larger still (~6.7×); this is cut back so the humps
   *  dominate the trace without flattening the AP-linked transients into the axis. */
  ampRange: [1.2, 2.7],
  /** Seconds to wait after the preceding AP, so its own transient has decayed before an
   *  AP-independent event begins. */
  settleAfterSpikeS: 3,
  /** Spike-free seconds required AHEAD of an onset, so the RISE is unambiguously not
   *  spike-driven. The DECAY may run into later spiking — the slow morphology trails for
   *  most of a minute and did exactly that in the real recording. */
  clearBeforeSpikeS: 5,
  /** Spacing of candidate onsets inside one spike-free stretch. Wide enough that two
   *  chosen events never stack into a single unreadable lump. */
  slotS: 12,
  seed: 80241004,
};

/**
 * Candidate onset times, ranked by how defensible they are.
 *
 * The demonstration only works if these events sit somewhere with no action potential
 * under them — otherwise they read as an unusually large coupled event, which is the
 * opposite of the point. So times are DERIVED from the spike train (as Tab 0's premise
 * figure derives its three), not authored: every candidate sits in a spike-free stretch,
 * and they are ordered by clearance — distance to the nearest spike — so the first event
 * the slider brings in is the least ambiguous one available.
 *
 * @param {ArrayLike<number>} spikeTimes spike times (s), any order
 * @param {{t0:number, tEnd:number}} span recording window (s)
 * @param {typeof AP_INDEPENDENT_DEFAULTS} p
 * @returns {{atS:number, clearanceS:number}[]} best-first
 */
export function candidateOnsets(spikeTimes, span, p) {
  const spikes = Array.from(spikeTimes)
    .filter((t) => Number.isFinite(t) && t >= span.t0 && t <= span.tEnd)
    .sort((a, b) => a - b);

  // Spike-free stretches, including the head and tail of the window (a recording with no
  // spikes at all is one long stretch, which is a legitimate — if extreme — case).
  const gaps = [];
  let prev = span.t0;
  for (const t of spikes) {
    if (t > prev) gaps.push([prev, t]);
    prev = t;
  }
  if (span.tEnd > prev) gaps.push([prev, span.tEnd]);

  const out = [];
  for (const [a, b] of gaps) {
    const first = a + p.settleAfterSpikeS;
    const last = b - p.clearBeforeSpikeS;
    if (!(last > first)) continue; // too tight to hold an unambiguous onset
    // Centre the run of slots in the usable interval, so a stretch that fits one event
    // puts it in the middle rather than hard against the preceding spike.
    const nSlots = Math.max(1, Math.floor((last - first) / p.slotS) + 1);
    const pad = (last - first - (nSlots - 1) * p.slotS) / 2;
    for (let k = 0; k < nSlots; k++) {
      const atS = first + pad + k * p.slotS;
      if (atS < span.t0 || atS > span.tEnd) continue;
      // Clearance = distance to the nearest spike either side. Ranks the slots without
      // caring which gap they came from, so the widest quiet stretch is used first.
      let clearanceS = Infinity;
      for (const t of spikes) {
        const d = Math.abs(t - atS);
        if (d < clearanceS) clearanceS = d;
      }
      out.push({ atS: round(atS, 2), clearanceS });
    }
  }
  out.sort((x, y) => y.clearanceS - x.clearanceS || x.atS - y.atS);
  return out;
}

/**
 * The event list for a given mix: which AP-independent events exist, where, how big, and
 * how far faded in.
 *
 * Count grows with `mix` (that is the "increase the existence of" the slider promises), but
 * the newest event carries a fractional `weight` so the slider is smooth rather than a
 * staircase of pops. Amplitude and shape are keyed to an event's RANK, not its time, so
 * dragging the slider only ever adds — it never reshuffles the events already on screen.
 *
 * @param {{t0:number, tEnd:number}} span recording window (s)
 * @param {ArrayLike<number>} spikeTimes
 * @param {number} mix 0…1
 * @param {number} refAmp reference AP-linked amplitude (dF/F₀) the events are scaled against
 * @param {Partial<typeof AP_INDEPENDENT_DEFAULTS>} [opts]
 * @returns {{atS:number, amp:number, shape:string, weight:number, clearanceS:number}[]}
 *          chronological
 */
export function apIndependentEvents(span, spikeTimes, mix, refAmp, opts = {}) {
  const p = { ...AP_INDEPENDENT_DEFAULTS, ...opts };
  const m = clamp01(mix);
  if (!(m > 0) || !(refAmp > 0)) return [];

  const durationS = Math.max(0, span.tEnd - span.t0);
  // At least one event is reachable in any window that can hold one — a 40 s teaching
  // window would otherwise round to zero events and the slider would do nothing but fade.
  const nMax = Math.max(1, Math.round((p.ratePerMin * durationS) / 60));
  const candidates = candidateOnsets(spikeTimes, span, p);

  const rand = mulberry32(p.seed);
  const events = [];
  const wanted = m * nMax;
  for (let k = 0; k < Math.min(nMax, candidates.length); k++) {
    const [lo, hi] = p.ampRange;
    const amp = refAmp * (lo + rand() * (hi - lo)); // drawn per RANK, so it is stable
    const weight = clamp01(wanted - k); // 1 for settled events, a fraction for the newest
    if (!(weight > 0)) break;
    events.push({
      atS: candidates[k].atS,
      amp,
      shape: SHAPE_ORDER[k % SHAPE_ORDER.length],
      weight,
      clearanceS: candidates[k].clearanceS,
    });
  }
  return events.sort((a, b) => a.atS - b.atS);
}

/**
 * Stamp an event list onto a signal grid.
 *
 * Stamping a kernel at an impulse IS convolution with that impulse, without building a
 * length-n input per event. The peak-1 shape is built once per morphology and scaled at
 * stamp time, so a 10-event trace costs two kernel builds, not ten.
 *
 * @param {{t0:number, dt:number, n:number}} grid
 * @param {{atS:number, amp:number, shape:string, weight?:number}[]} events
 * @returns {Float64Array} the AP-independent component alone, length grid.n
 */
export function apIndependentTrace(grid, events) {
  const out = new Float64Array(grid.n);
  if (!events || !events.length) return out;
  const built = new Map();
  for (const e of events) {
    const shape = AP_INDEPENDENT_SHAPES[e.shape];
    if (!shape) throw new Error(`ap-independent: unknown event shape '${e.shape}'`);
    if (!built.has(e.shape)) built.set(e.shape, buildKernel(shape.kernel, shape.params, grid.dt, 1));
    const k = built.get(e.shape);
    const scale = e.amp * (e.weight == null ? 1 : e.weight);
    // zeroIndex differs by family — 0 for the causal calcium shape, centred for the
    // gaussian — so the stamp offset reads it rather than assuming.
    const i0 = Math.round((e.atS - grid.t0) / grid.dt);
    for (let j = 0; j < k.samples.length; j++) {
      const i = i0 + j - k.zeroIndex;
      if (i >= 0 && i < grid.n) out[i] += scale * k.samples[j];
    }
  }
  return out;
}

/**
 * Robust event amplitude of a trace: the height of its events above its own baseline.
 *
 * Used as the reference the AP-independent events are scaled against, so the slider means
 * the same thing on Tab 1's authored 0.1 dF/F₀ transients and on a loaded recording whose
 * units and baseline nobody here chose. A plain max would be hostage to one noise spike or
 * one artifact; the 99.5th percentile against the median is not. NaN samples (gaps in a
 * loaded ROI column) are skipped rather than zeroed — zeroing them would drag the baseline.
 *
 * @param {ArrayLike<number>} samples
 * @returns {number} amplitude in the signal's own units; 0 for an empty or flat trace
 */
export function referenceAmplitude(samples) {
  const finite = [];
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length < 2) return 0;
  finite.sort((a, b) => a - b);
  const at = (q) => finite[Math.min(finite.length - 1, Math.max(0, Math.round(q * (finite.length - 1))))];
  return Math.max(0, at(0.995) - at(0.5));
}

/**
 * Mix AP-independent calcium into a trace.
 *
 * This is the slider, in one call. `mix` = 0 returns the trace untouched (the null model:
 * everything the kernel explains); `mix` = 1 returns a trace built entirely of events the
 * spike train cannot account for.
 *
 * @param {ArrayLike<number>} trace the AP-linked signal — Tab 1's `spikes ⊗ kernel`, or a
 *        loaded ROI column, which is the same role: the part a kernel is supposed to explain
 * @param {{t0:number, dt:number, n:number}} grid
 * @param {ArrayLike<number>} spikeTimes
 * @param {number} mix 0…1
 * @param {Partial<typeof AP_INDEPENDENT_DEFAULTS> & {refAmp?:number}} [opts]
 * @returns {{samples: Float64Array|ArrayLike<number>, apIndependent: Float64Array|null,
 *            events: object[], refAmp: number, share: number, mix: number}}
 *          `share` is the AP-independent fraction of the mixed trace's variance — the part
 *          of the signal no kernel fit can reach, however good the kernel.
 */
export function mixApIndependent(trace, grid, spikeTimes, mix, opts = {}) {
  const m = clamp01(mix);
  if (!(m > 0)) {
    return { samples: trace, apIndependent: null, events: [], refAmp: 0, share: 0, mix: 0 };
  }
  const n = Math.min(grid.n, trace.length);
  const span = { t0: grid.t0, tEnd: grid.t0 + (grid.n - 1) * grid.dt };
  const refAmp = opts.refAmp != null ? opts.refAmp : referenceAmplitude(trace);
  const events = apIndependentEvents(span, spikeTimes, m, refAmp, opts);
  const indep = apIndependentTrace(grid, events);

  // The AP-linked part fades as the AP-independent part arrives. Without the fade, mix = 1
  // would be "kernel-explained calcium PLUS humps", which is not what the top of the slider
  // claims; with it, the spike train explains exactly nothing there.
  const keep = 1 - m;
  // NaN gaps in a loaded ROI column stay NaN (NaN propagates through both terms), so the
  // downstream omitnan paths — the STA especially — still see a gap where a gap was.
  const samples = new Float64Array(trace.length);
  for (let i = 0; i < trace.length; i++) samples[i] = keep * trace[i] + (i < n ? indep[i] : 0);

  return { samples, apIndependent: indep, events, refAmp, share: varianceShare(trace, indep, keep, n), mix: m };
}

/** Fraction of the mixed trace's variance contributed by the AP-independent component.
 *  Variance, not peak: it answers "how much of this signal is unreachable by any kernel
 *  fit", which is the number the §3 checks and Tab 3's inference are about to be judged on. */
function varianceShare(trace, indep, keep, n) {
  let sa = 0, si = 0, ca = 0, ci = 0;
  for (let i = 0; i < n; i++) {
    const v = trace[i];
    if (Number.isFinite(v)) { sa += keep * v; ca++; }
    si += indep[i]; ci++;
  }
  const ma = ca ? sa / ca : 0;
  const mi = ci ? si / ci : 0;
  let va = 0, vi = 0;
  for (let i = 0; i < n; i++) {
    const v = trace[i];
    if (Number.isFinite(v)) va += (keep * v - ma) ** 2;
    vi += (indep[i] - mi) ** 2;
  }
  const tot = va + vi;
  return tot > 0 ? vi / tot : 0;
}

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function round(v, dp) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
