// LAB-ONLY (ADR-0053). Signal extraction from raw fluorescence, as pure functions.
//
// The question this serves: does the processing between raw F and the trace a kernel is
// recovered from change the kernel? Each function here is ONE step of the lab's production
// chain, ported so the steps can be applied or withheld one at a time in the browser:
//
//   raw soma F, raw penumbra F
//     -> penumbra subtraction        soma - k * penumbra          (getROItraces2.m, k = 0.7)
//     -> F0                          boxcar mean, then a backward running minimum with
//                                    slope fill                   (deltaFoverFzeroEmbedded.m)
//     -> dF/F0                       (F - F0) / F0
//     -> percentile drift removal    trace - sliding percentile   (prctfilt.m, before MLspike)
//
// Ported from interface2's MATLAB, by way of haruspex `tools/f0_recompute.py`, which
// reproduces the archive's stored F0 on all 72 recordings (haruspex ADR-0007). The parity
// test for THIS port is `lab.test.mjs` against vectors made by that Python port. Nothing
// here has been run against MATLAB directly.
//
// Parameters are declared in SECONDS and converted with round(), from a declared dt
// (haruspex ADR-0007, PI ruling 2026-08-15): never in frames, never from mean(diff(time)).

const f32 = Math.fround;

/** Production F0 parameters, in seconds (interface2 `aCa4_ROI_dFoF0.m`, since 2025-10-24). */
export const F0_T1_S = 1.0; // boxcar window
export const F0_T4_S = 20.0; // slope-fill threshold
/** Production penumbra coefficient (interface2 `getROItraces2.m`). */
export const PENSUB_K = 0.7;
/** Percentile drift filter before MLspike (interface2 `MLspike_filterProps3.m`). */
export const PRCT_P = 10;
export const PRCT_WINDOW_S = 5;
export const PRCT_STEP_S = 0.1;

/**
 * Seconds -> samples, the normative rule: round(), from the declared dt.
 * At 10 Hz: half = 5, n4 = 200.
 * @returns {{ half:number, n4:number }}
 */
export function f0Samples(dt, t1S = F0_T1_S, t4S = F0_T4_S) {
  const fs = 1 / dt;
  return { half: Math.round((t1S * fs) / 2), n4: Math.round(t4S * fs) };
}

/**
 * BarFofTse: centred boxcar mean of width 2*half+1; the first `half` samples and the
 * samples after n-half are held flat at the mean of their own end block.
 * Single precision is mirrored at the points MATLAB stores to single.
 * @param {ArrayLike<number>} x raw trace
 * @param {number} half half-width in samples
 * @returns {Float32Array}
 */
export function barF(x, half) {
  const n = x.length;
  const ts = half;
  const te = n - ts; // 1-based index of the last centred sample
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = x[i];
  if (ts > 0 && n > 2 * ts) {
    let acc = f32(0);
    for (let i = 0; i < ts; i++) acc = f32(acc + b[i]);
    const head = f32(acc / f32(ts));
    for (let i = 0; i < ts; i++) b[i] = head;
    acc = f32(0);
    for (let i = te - 1; i < n; i++) acc = f32(acc + b[i]);
    const tail = f32(acc / f32(n - te + 1));
    for (let i = te - 1; i < n; i++) b[i] = tail;
    // Centred window, accumulated in double over the ORIGINAL trace in window order,
    // then rounded to single. 0-based j = ts .. te-1 (which overwrites the first tail sample,
    // as the MATLAB loop does).
    for (let j = ts; j < te; j++) {
      let s = 0;
      for (let o = -ts; o <= ts; o++) s += x[j + o];
      b[j] = s / (2 * ts + 1);
    }
  }
  return b;
}

/**
 * minBarF2e with t2 = inf: walking back from the end, each step finds the minimum of
 * everything earlier, holds it flat up to the current position, or (when the minimum is more
 * than n4 samples back and a later minimum is known) joins the two minima with a line.
 * @param {Float32Array} b boxcar-smoothed trace (not modified)
 * @param {number} n4 slope-fill threshold in samples
 * @returns {Float32Array} F0
 */
export function minBarF(b, n4) {
  const n = b.length;
  const m = Float32Array.from(b);
  if (n === 0) return m;

  // First-occurrence prefix argmin. Each step only writes at or after the minimum it found
  // and then moves to before it, so the prefix it reads next is still the original data.
  const pre = new Int32Array(n);
  for (let i = 1; i < n; i++) pre[i] = b[i] < b[pre[i - 1]] ? i : pre[i - 1];

  let prevLoc = pre[n - 1] + 1; // 1-based, as in the MATLAB
  let prevMin = m[prevLoc - 1];
  let i = n;
  while (i > 0) {
    const fLoc = pre[i - 1] + 1;
    const fMin = b[fLoc - 1];
    const dx = i - fLoc;
    if (dx > n4 && prevLoc > fLoc) {
      const sdx = prevLoc - fLoc;
      const slope = f32(f32(prevMin - fMin) / sdx);
      // MATLAB linspace(0, sdx+1, sdx+1): multiply then divide, endpoints forced. It
      // overshoots the far minimum by one step; kept, because production does it.
      for (let j = 0; j <= sdx; j++) {
        let ls = (j * (sdx + 1)) / sdx;
        if (j === 0) ls = 0;
        if (j === sdx) ls = sdx + 1;
        m[fLoc - 1 + j] = f32(fMin + f32(f32(ls) * slope));
      }
    } else {
      for (let j = fLoc - 1; j < i; j++) m[j] = fMin;
    }
    if (prevLoc - fLoc > 2 * n4) {
      prevMin = fMin;
      prevLoc = fLoc;
    }
    i = fLoc - 1;
  }
  return m;
}

/** Production F0 of one raw trace: minBarF(barF(x)). */
export function f0RunningMin(x, dt, { t1S = F0_T1_S, t4S = F0_T4_S } = {}) {
  const { half, n4 } = f0Samples(dt, t1S, t4S);
  return minBarF(barF(x, half), n4);
}

/** (F - F0) / F0, in single precision as production stores it. */
export function dFoverF0(x, f0) {
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f32(f32(f32(x[i]) - f0[i]) / f0[i]);
  return out;
}

/** soma - k * penumbra. */
export function pensub(soma, pen, k = PENSUB_K) {
  const n = soma.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = soma[i] - k * pen[i];
  return out;
}

/** MATLAB prctile of a sorted array: linear interpolation at p/100*n + 0.5, clamped. */
function prctileSorted(sorted, p) {
  const n = sorted.length;
  const pos = (p / 100) * n + 0.5; // 1-based
  if (pos <= 1) return sorted[0];
  if (pos >= n) return sorted[n - 1];
  const lo = Math.floor(pos);
  return sorted[lo - 1] + (pos - lo) * (sorted[lo] - sorted[lo - 1]);
}

/**
 * CaImAn `prctfilt` in mode 0: the sliding-percentile BASELINE of x.
 * @param {ArrayLike<number>} x
 * @param {number} p percentile, 0..100
 * @param {number} window samples
 * @param {number} shift samples between successive windows
 * @returns {Float64Array} baseline, same length as x
 */
export function prctFilt(x, p, window, shift) {
  const n = x.length;
  window = Math.min(window, n);
  shift = Math.min(shift, window);
  const c = Math.ceil((window - 1) / 2);
  const pad = new Float64Array(n + 2 * c);
  for (let i = 0; i < c; i++) pad[i] = x[i];
  for (let i = 0; i < n; i++) pad[c + i] = x[i];
  for (let i = 0; i < c; i++) pad[c + n + i] = x[n - c + i];

  const len = pad.length;
  const ln = Math.floor((len - window) / shift) + 1;
  const pcs = new Float64Array(ln);
  const buf = new Float64Array(window);
  for (let i = 0; i < ln; i++) {
    const s = i * shift;
    for (let j = 0; j < window; j++) buf[j] = pad[s + j];
    buf.sort();
    pcs[i] = prctileSorted(buf, p);
  }

  const out = new Float64Array(n);
  const filled = shift * (ln - 1);
  for (let i = 0; i < ln - 1; i++) {
    const d = pcs[i + 1] - pcs[i];
    for (let s = 0; s < shift; s++) {
      const k = i * shift + s;
      if (k < n) out[k] = pcs[i] + (d * s) / shift;
    }
  }
  // padarray(...,'post','symmetric'): mirror the end, edge sample included.
  for (let k = filled; k < n; k++) out[k] = out[Math.max(0, 2 * filled - 1 - k)];
  return out;
}

/**
 * Bridge the excluded stretches of a raw trace before any baseline is computed: every frame
 * whose time falls in a span (ends inclusive) is replaced by a straight line between the last
 * good frame before the run and the first good frame after it. A run at either end of the
 * recording is held flat at its one good neighbour. This is what the archive's `blankfix` did
 * to blank motion-correction frames before production computed F0, extended to every
 * exclusion window (Tony, 2026-11-16: baselines, deconvolution and kernels must not see them).
 *
 * The bridged frames are still excluded from kernel recovery by the caller; the bridge only
 * keeps them from pulling F0 and the percentile baseline.
 *
 * @param {ArrayLike<number>} x raw trace, whole recording
 * @param {ArrayLike<number>} time frame times (s), same length
 * @param {{startS:number, endS:number}[]} spans
 * @returns {{ x: Float64Array, nBridged: number }} a copy; x itself is not modified
 */
export function bridgeSpans(x, time, spans) {
  const n = x.length;
  const out = Float64Array.from(x);
  if (!spans.length || n === 0) return { x: out, nBridged: 0 };
  const bad = new Uint8Array(n);
  let nBridged = 0;
  for (let i = 0; i < n; i++) {
    const t = time[i];
    for (const s of spans) {
      if (t >= s.startS && t <= s.endS) {
        bad[i] = 1;
        nBridged++;
        break;
      }
    }
  }
  if (nBridged === n) throw new Error('bridgeSpans: every frame is excluded');
  let i = 0;
  while (i < n) {
    if (!bad[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && bad[j]) j++; // run is [i, j)
    const a = i - 1; // last good before, or -1
    const b = j; // first good after, or n
    for (let k = i; k < j; k++) {
      if (a < 0) out[k] = x[b];
      else if (b >= n) out[k] = x[a];
      else out[k] = x[a] + ((x[b] - x[a]) * (k - a)) / (b - a);
    }
    i = j;
  }
  return { x: out, nBridged };
}

/** Mean of the finite values of x over [i0, i1). */
function meanOver(x, i0, i1) {
  let s = 0;
  let c = 0;
  for (let i = i0; i < i1; i++) {
    if (Number.isFinite(x[i])) {
      s += x[i];
      c++;
    }
  }
  return c ? s / c : NaN;
}

function slice64(x, i0, i1) {
  const out = new Float64Array(i1 - i0);
  for (let i = i0; i < i1; i++) out[i - i0] = x[i];
  return out;
}

/**
 * The extraction variants of one ROI over one analysis window.
 *
 * F0 is always computed over the WHOLE recording, as production does, and then cut to the
 * window. The two "frozen" variants are the control for the hypothesis: they divide by the
 * same F0 the production variant uses, but held at its window mean, so the only thing that
 * differs between a frozen variant and its production partner is the time course of F0.
 * A frozen variant is raw F under an offset and a gain; nothing else is done to it.
 *
 * @param {Object} a
 * @param {ArrayLike<number>} a.soma raw soma mean F, whole recording
 * @param {(ArrayLike<number>|null)} a.pen raw penumbra mean F, whole recording, or null
 * @param {number} a.dt declared sample interval (s)
 * @param {number} a.i0 window start index (inclusive)
 * @param {number} a.i1 window end index (exclusive)
 * @param {number} [a.pensubK]
 * @param {number} [a.t1S] @param {number} [a.t4S]
 * @param {number} [a.prctP] @param {number} [a.prctWindowS] @param {number} [a.prctStepS]
 * @param {(ArrayLike<number>|null)} [a.fileDff] the producer's own dF/F0 for this ROI, if exported
 * @returns {{ id:string, label:string, steps:string[], samples:Float64Array, f0:(Float64Array|null), f0Mean:number }[]}
 */
export function buildVariants(a) {
  const {
    soma, pen = null, dt, i0, i1,
    pensubK = PENSUB_K, t1S = F0_T1_S, t4S = F0_T4_S,
    prctP = PRCT_P, prctWindowS = PRCT_WINDOW_S, prctStepS = PRCT_STEP_S,
    fileDff = null,
  } = a;
  const out = [];

  const family = (x, tag, name, lead) => {
    const f0 = f0RunningMin(x, dt, { t1S, t4S });
    const f0Mean = meanOver(f0, i0, i1);
    const frozen = new Float64Array(i1 - i0);
    for (let i = i0; i < i1; i++) frozen[i - i0] = (x[i] - f0Mean) / f0Mean;
    out.push({
      id: `frozen${tag}`,
      label: `${name}, F0 held constant`,
      steps: [...lead, 'subtract and divide by one number: the window mean of F0'],
      samples: frozen,
      f0: null,
      f0Mean,
    });
    const dff = dFoverF0(x, f0);
    out.push({
      id: `dff${tag}`,
      label: `${name}, dF/F0 with running-minimum F0`,
      steps: [...lead, `F0 = running minimum (t1 ${t1S} s, t4 ${t4S} s)`, '(F - F0) / F0'],
      samples: slice64(dff, i0, i1),
      f0: slice64(f0, i0, i1),
      f0Mean,
    });
    return dff;
  };

  const dffSoma = family(soma, '', 'soma', ['raw soma F']);
  if (pen) {
    family(pensub(soma, pen, pensubK), '-pensub', `soma - ${pensubK} x penumbra`, [
      'raw soma F',
      `subtract ${pensubK} x raw penumbra F`,
    ]);
  }

  const win = Math.max(1, Math.round(prctWindowS / dt));
  const step = Math.max(1, Math.round(prctStepS / dt));
  const base = prctFilt(dffSoma, prctP, win, step);
  const flat = new Float64Array(i1 - i0);
  for (let i = i0; i < i1; i++) flat[i - i0] = dffSoma[i] - base[i];
  out.push({
    id: 'dff-prct',
    label: `soma, dF/F0, then minus the ${prctP}th percentile over ${prctWindowS} s`,
    steps: [
      'raw soma F',
      `F0 = running minimum (t1 ${t1S} s, t4 ${t4S} s)`,
      '(F - F0) / F0',
      `subtract sliding ${prctP}th percentile, ${prctWindowS} s window`,
    ],
    samples: flat,
    f0: null,
    f0Mean: NaN,
  });

  if (fileDff) {
    out.push({
      id: 'file-dff',
      label: 'dF/F0 as exported by the producer',
      steps: ['taken from the file, not recomputed here'],
      samples: slice64(fileDff, i0, i1),
      f0: null,
      f0Mean: NaN,
    });
  }
  return out;
}
