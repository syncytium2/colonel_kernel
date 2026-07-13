// "Beat the Colonel" challenge scoring (game modes, Tab 2 first).
//
// A challenge pits a human's hand-made reconstruction against the tool's
// automated recovery, both judged by how well they reproduce a target trace.
// The metric is the coefficient of determination (R²) over the two signals'
// common window. Pure + framework-free so the game logic stays test-covered.

/**
 * R² of a reconstruction against a target trace over their first `n` samples
 * (the shared recording window). R² = 1 − SS_res/SS_tot. Floored at −1 so a wild
 * miss can't produce a huge negative that dominates a scoreboard; returns NaN
 * when the target is flat (SS_tot = 0) or the window is empty.
 * @param {ArrayLike<number>} recon
 * @param {ArrayLike<number>} target
 * @param {number} [n] common-window length (defaults to the shorter of the two)
 * @returns {number}
 */
export function rSquared(recon, target, n) {
  const len = n ?? Math.min(recon.length, target.length);
  if (len <= 0) return NaN;
  let mean = 0;
  for (let i = 0; i < len; i++) mean += target[i];
  mean /= len;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < len; i++) {
    const t = target[i];
    ssRes += (recon[i] - t) ** 2;
    ssTot += (t - mean) ** 2;
  }
  if (ssTot === 0) return NaN;
  const r2 = 1 - ssRes / ssTot;
  return r2 < -1 ? -1 : r2;
}

/**
 * Match guessed spike times against the truth within a tolerance (greedy nearest,
 * each true spike claims at most one guess). The scoring for "guess the spikes":
 * precision = fraction of your guesses that hit a real spike, recall = fraction of
 * real spikes you found, f1 = their harmonic mean.
 * @param {ArrayLike<number>} guessed
 * @param {ArrayLike<number>} truth
 * @param {number} [tolS] match tolerance in seconds
 * @returns {{ matched:number, falsePos:number, missed:number, precision:number, recall:number, f1:number }}
 */
export function spikeMatch(guessed, truth, tolS = 0.3) {
  const g = Array.from(guessed);
  const used = new Array(g.length).fill(false);
  let matched = 0;
  for (const t of truth) {
    let best = -1;
    let bestD = tolS;
    for (let i = 0; i < g.length; i++) {
      if (used[i]) continue;
      const d = Math.abs(g[i] - t);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      used[best] = true;
      matched++;
    }
  }
  const precision = g.length ? matched / g.length : 0;
  const recall = truth.length ? matched / truth.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { matched, falsePos: g.length - matched, missed: truth.length - matched, precision, recall, f1 };
}

/**
 * Peak-pick discrete spike times from a continuous signal (the machine's naive
 * spike inference: deconvolution → peaks). Keeps local maxima at or above
 * minHeight, enforcing a minimum separation (taller peaks win). Returns times (s).
 * @param {ArrayLike<number>} signal
 * @param {number} dt sample interval (s)
 * @param {{ minHeight?: number, minSepS?: number, t0?: number }} [opts]
 * @returns {number[]}
 */
export function peakPickSpikes(signal, dt, { minHeight = 0, minSepS = 0, t0 = 0 } = {}) {
  const n = signal.length;
  const minSep = Math.max(0, Math.round(minSepS / dt));
  const cand = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] >= minHeight && signal[i] >= signal[i - 1] && signal[i] > signal[i + 1]) cand.push(i);
  }
  cand.sort((a, b) => signal[b] - signal[a]); // tallest first
  const used = new Uint8Array(n);
  const chosen = [];
  for (const i of cand) {
    let ok = true;
    for (let j = Math.max(0, i - minSep); j <= Math.min(n - 1, i + minSep); j++) {
      if (used[j]) { ok = false; break; }
    }
    if (ok) { chosen.push(i); used[i] = 1; }
  }
  return chosen.sort((a, b) => a - b).map((i) => t0 + i * dt);
}

/**
 * Seeded Poisson spike train over [0, durationS): exponential inter-spike
 * intervals with mean 1/rateHz. Returns event times (seconds), ascending.
 * @param {() => number} rand a seeded uniform generator in [0,1)
 * @param {number} rateHz
 * @param {number} durationS
 * @returns {number[]}
 */
export function poissonSpikes(rand, rateHz, durationS) {
  const out = [];
  let t = 0;
  for (let guard = 0; guard < 100000; guard++) {
    t += -Math.log(1 - rand()) / rateHz;
    if (t >= durationS) break;
    out.push(t);
  }
  return out;
}
