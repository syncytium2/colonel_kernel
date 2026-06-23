// Spike-triggered average (STA) — the model-free cross-method validation partner
// for the deconvolved kernel (ADR-0005, FOUNDATIONS §3 check 4). Reimplemented
// verbatim from the lab `spikeTriggeredAverage.m` (MATLAB CODE/), the same source
// the reference `.mat` STA outputs were computed from (56/56 STA-contract regions
// pass, NEXT_SESSION).
//
// STA cuts a window of trace around each accepted spike, subtracts a per-event
// pre-spike baseline, and averages. It is the companion to deconvolution because
// the two have DIFFERENT failure modes — STA degrades at high spike frequency
// (overlapping windows), deconvolution holds — so their agreement, read alongside
// the spike rate, is a primary "is there a real kernel?" signal (ADR-0005).
//
// Three non-obvious fidelity facts the port reproduces exactly (FOUNDATIONS §13):
//   1. Overlap rejection — an event is kept only if BOTH neighbors are farther
//      than `block = 0.5*window` away. (Deconvolution bins ALL spikes; STA drops
//      overlapping ones — they use a different effective spike set.)
//   2. Endpoint skip — the loop runs `2 : nEvents-1`; the first and last events
//      are never used.
//   3. Match tolerance — a spike is matched to the FIRST frame within 0.1 s.
//
// Origin convention (§13, ADR-0009): the STA waveform is symmetric, length
// `2*windowSamples+1`, with the spike at `zeroIndex = windowSamples` — the SAME
// t=0 convention as the recovered kernel (different span: STAwin=2 s vs win=5 s),
// which is what makes their cross-method comparison sample-for-sample about zero.

/** mean(diff(times)) — the MATLAB delta_t (telescopes to the endpoint slope). */
function meanDt(times) {
  const n = times.length;
  return (times[n - 1] - times[0]) / (n - 1);
}

/**
 * @typedef {Object} STAResult
 * @property {Float64Array} samples   the averaged waveform, length 2*windowSamples+1
 *                                    (empty Float64Array if no event was accepted)
 * @property {number} dt              sample interval (s), mean(diff(signalTimes))
 * @property {number} zeroIndex       sample at lag 0 (= windowSamples)
 * @property {Float64Array} times     lag axis, -window..+window (ADR-0012 authoritative)
 * @property {number} windowSamples   half-window in samples (round(window/dt))
 * @property {number} nEvents         total input spike times
 * @property {number} nAccepted       events that contributed to the average
 * @property {number} nBlocked        events rejected by the overlap / pre / NaN guard
 * @property {number} nEdgeSkipped    events whose window fell off the trace ends (skipped)
 * @property {Float64Array[]} events  per accepted event, the baseline-subtracted window
 * @property {boolean} empty          true when no event was accepted
 */

/**
 * Spike-triggered average of one trace, faithful to `spikeTriggeredAverage.m`.
 *
 * @param {ArrayLike<number>} spikeTimes  event times (s), ASCENDING (loader sorts)
 * @param {ArrayLike<number>} signal      the dF/F₀ trace, dense on signalTimes
 * @param {ArrayLike<number>} signalTimes the frame timebase (s), one per signal sample
 * @param {{ window: number, baseline: number, startTimeMin?: number, endTimeMin?: number, tolerance?: number }} opts
 *        window   — half-duration of the STA (s); STAwin = 2 in the lab driver.
 *        baseline — pre-spike window (s) zeroed per event; STAbasewin = 0.5.
 *        startTimeMin/endTimeMin — accepted spike-time range in MINUTES (driver: 0, ∞).
 *        tolerance — spike→frame match tolerance (s); 0.1 in the source.
 * @returns {STAResult}
 */
export function spikeTriggeredAverage(
  spikeTimes,
  signal,
  signalTimes,
  { window, baseline, startTimeMin = 0, endTimeMin = Infinity, tolerance = 0.1 },
) {
  if (!(window > 0)) throw new Error('STA: window must be > 0');
  if (!(baseline >= 0)) throw new Error('STA: baseline must be ≥ 0');
  if (signal.length !== signalTimes.length) throw new Error('STA: signal/time length mismatch');
  const nSignal = signal.length;
  if (nSignal < 2) throw new Error('STA: signal needs at least 2 samples');

  // --- sample geometry (matches the MATLAB block, lines 21–27) ---------------
  const dt = meanDt(signalTimes);
  const baselineSamples = Math.round(baseline / dt);
  const windowSamples = Math.round(window / dt); // pre_samples = post_samples
  const zeroIndex = windowSamples;
  const len = 2 * windowSamples + 1;

  // Lag axis, -pre..+post (ADR-0012: authoritative; built from the integer offsets
  // exactly as `-pre_samples*dt : dt : post_samples*dt`).
  const times = new Float64Array(len);
  for (let j = -windowSamples; j <= windowSamples; j++) times[windowSamples + j] = j * dt;

  const tStart = startTimeMin * 60; // minutes → seconds (driver passes 0)
  const tEnd = endTimeMin * 60; // minutes → seconds (driver passes ∞)
  const block = 0.5 * window; // overlap-rejection radius (s)
  const nEvents = spikeTimes.length;

  // --- per-event accumulation (omitnan: sum + count of finite, per lag) -------
  const sum = new Float64Array(len);
  const cnt = new Float64Array(len);
  const events = [];
  let nAccepted = 0;
  let nBlocked = 0;
  let nEdgeSkipped = 0;

  // MATLAB: for iEvent = 2:nEvents-1 (skips first and last event). 0-based here.
  for (let i = 1; i < nEvents - 1; i++) {
    const time = spikeTimes[i];
    const accept =
      Number.isFinite(time) &&
      time > window && // MATLAB `time>pre`
      Math.abs(time - spikeTimes[i - 1]) > block &&
      Math.abs(time - spikeTimes[i + 1]) > block;
    if (!accept) {
      nBlocked++;
      continue;
    }
    // Time-range gate (driver: 0..∞, so always inside). Not counted as blocked,
    // matching the source where range rejection falls through silently.
    if (!(time >= tStart && time <= tEnd)) continue;

    // First frame within tolerance of the spike (MATLAB find(...,1)).
    let tindex = -1;
    for (let s = 0; s < nSignal; s++) {
      if (Math.abs(signalTimes[s] - time) < tolerance) {
        tindex = s;
        break;
      }
    }
    if (tindex < 0) {
      nEdgeSkipped++; // no frame near the spike — cannot window it
      continue;
    }
    // Bounds: the source would index out of range here and error; we skip
    // edge-starved events instead (does not change any in-bounds event).
    if (tindex - baselineSamples < 0 || tindex - windowSamples < 0 || tindex + windowSamples >= nSignal) {
      nEdgeSkipped++;
      continue;
    }

    // Per-event baseline = plain mean over [tindex-baselineSamples, tindex]
    // (inclusive, NaN-propagating — a NaN here voids the whole event, exactly as
    // the source's non-omitnan mean does, and the final omitnan average drops it).
    let bSum = 0;
    for (let s = tindex - baselineSamples; s <= tindex; s++) bSum += signal[s];
    const base = bSum / (baselineSamples + 1);

    const ev = new Float64Array(len);
    for (let j = 0; j < len; j++) {
      const v = signal[tindex - windowSamples + j] - base;
      ev[j] = v;
      if (Number.isFinite(v)) {
        sum[j] += v;
        cnt[j] += 1;
      }
    }
    events.push(ev);
    nAccepted++;
  }

  if (nAccepted === 0) {
    // MATLAB returns STA=[], STA_time=[]. We keep the well-defined lag geometry
    // (dt, zeroIndex, times) for the UI but signal emptiness explicitly.
    return {
      samples: new Float64Array(0),
      dt,
      zeroIndex,
      times,
      windowSamples,
      nEvents,
      nAccepted,
      nBlocked,
      nEdgeSkipped,
      events,
      empty: true,
    };
  }

  // mean(Events, 1, 'omitnan'): per-lag finite mean; all-NaN lag → NaN.
  const samples = new Float64Array(len);
  for (let j = 0; j < len; j++) samples[j] = cnt[j] > 0 ? sum[j] / cnt[j] : NaN;

  return {
    samples,
    dt,
    zeroIndex,
    times,
    windowSamples,
    nEvents,
    nAccepted,
    nBlocked,
    nEdgeSkipped,
    events,
    empty: false,
  };
}
