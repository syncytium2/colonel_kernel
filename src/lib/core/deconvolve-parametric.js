// Constrained-parametric kernel recovery — METHOD 2 of ADR-0021 (the second of the
// three parallel recovery methods; free-vector `recoverKernel` in deconvolve.js is
// method 1 and is unchanged and never discarded). This is a PARALLEL method, not a
// replacement: the spread between the three is itself the §3/§4 diagnostic.
//
// What it is (ADR-0021 §Decision.2, FOUNDATIONS §2): fit a CAUSAL double-exponential
// transient, ANCHORED at t = 0 with ZERO BASELINE by construction, by nonlinear least
// squares of (binned-count density ⊗ kernel(θ)) against the ROI trace, over
// θ = { tauRise, tauDecay, amp }.
//
//   kernel(t; θ) = amp · ( exp(−t/tauDecay) − exp(−t/tauRise) ),   t ≥ 0
//   kernel(t; θ) = 0,                                              t < 0
//
// Double-exponential, NOT an alpha function: two SEPARABLE time constants (independent
// rise and decay) — the extra degree of freedom is the point (ADR-0021). There is NO
// additive offset term: a flat baseline is impossible by construction, which is exactly
// what dissolves the free-vector method's "n/a (tilt)" decay-τ failure (the baseline
// cannot tilt, so τ is always a real number).
//
// Forward model is LINEAR convolution (zero-padded, ADR-0006) of the causal kernel with
// the spike density — no circular wraparound, no negative-lag content to wrap. Caller
// supplies binned-count density (hist(spikes, timing), the §13 validation-path
// rasterization), NOT unit-amplitude.
//
// Returns the ADR-0009 kernel contract { samples, zeroIndex, dt, times } with the SAME
// symmetric retained-lag layout as recoverKernel (length 2·windowSamples+1, zeroIndex =
// windowSamples) so the two methods are sample-for-sample comparable about t = 0 and
// feed kernelDiagnostics / the overlay plot uniformly. The negative-lag half is
// identically zero (the kernel is causal by construction) — that is information, not a
// defect: a causal method's acausalRatio is 0 by design.
//
// Constraint lives INSIDE the optimization (ADR-0021): the reconstruction score is
// EARNED, not a post-hoc detrend/zero of a raw kernel (the rejected cleanup path,
// ADR-0017). This is the line that separates method 2 from cleanup.

/**
 * Sample the causal double-exponential kernel at lags 0..windowSamples.
 * @param {{ tauRise:number, tauDecay:number, amp:number }} theta
 * @param {number} windowSamples  number of causal lag steps to fill (lags 0..ws)
 * @param {number} dt  sample interval (seconds)
 * @returns {Float64Array} length windowSamples+1, index j = lag j·dt (causal half only)
 */
export function doubleExpCausal({ tauRise, tauDecay, amp }, windowSamples, dt) {
  const k = new Float64Array(windowSamples + 1);
  for (let j = 0; j <= windowSamples; j++) {
    const t = j * dt;
    k[j] = amp * (Math.exp(-t / tauDecay) - Math.exp(-t / tauRise));
  }
  return k; // k[0] = 0 by construction (exp(0) − exp(0)); zero baseline, anchored t=0
}

// Negligible-tail cutoff for the FULL analytic kernel (Option B): the double-exponential
// decays as exp(−t/τdecay), so by t = TAIL_FACTOR·τdecay it is exp(−TAIL_FACTOR) ≈ 0.7%
// of its decay scale — small enough to drop. This matters because the canonical ±window
// display slice (ws = round(WIN/dt)) is often SHORTER than the kernel's own decay (file-80
// ROI-1: τdecay ≈ 2.89 s vs WIN = 5 s ≈ 1.7·τ), so a reconstruction built from the
// truncated ±window array CLIPS the tail. The fit's θ is unchanged; only the forward model
// that produces the reconstruction / R² uses this untruncated support.
const TAIL_FACTOR = 5;

/**
 * Sample the FULL analytic causal kernel out to ~TAIL_FACTOR·τdecay (Option B), so the
 * reconstruction is not clipped by the ±window display slice. This is legitimate and
 * PARAMETRIC-ONLY: it is possible BECAUSE the kernel is analytic (the free-vector method
 * has no content beyond its window and is unchanged). The returned length is at least
 * `minSamples`+1 so the full kernel is never shorter than the display window.
 * @param {{ tauRise:number, tauDecay:number, amp:number }} theta
 * @param {number} dt  sample interval (seconds)
 * @param {number} [minSamples]  floor on the causal support (e.g. the display ws)
 * @returns {Float64Array} causal kernel, index j = lag j·dt
 */
export function doubleExpCausalFull(theta, dt, minSamples = 0) {
  const tailSamples = Math.ceil((TAIL_FACTOR * theta.tauDecay) / dt);
  const support = Math.max(minSamples, tailSamples);
  return doubleExpCausal(theta, support, dt);
}

/**
 * Parametric reconstruction (Option B): density ⊗ kernel(θ) using the FULL analytic
 * kernel (untruncated tail), evaluated over `outLen` samples. This is the forward model
 * for the reconstruction residual / R² — distinct from the ±window display slice, which
 * stays the canonical ADR-0009 contract object. The free-vector method has no analogue
 * (no tail beyond its window); this asymmetry is parametric-only.
 * @param {ArrayLike<number>} spikeDensity  binned-count density
 * @param {{ tauRise:number, tauDecay:number, amp:number }} theta
 * @param {number} dt  sample interval (seconds)
 * @param {number} outLen  number of output samples
 * @param {number} [minSamples]  floor on the causal support (e.g. the display ws)
 * @returns {Float64Array} length outLen
 */
export function reconstructParametric(spikeDensity, theta, dt, outLen, minSamples = 0) {
  const fullK = doubleExpCausalFull(theta, dt, minSamples);
  return forwardConvolveCausal(spikeDensity, fullK, outLen);
}

/**
 * Linear convolution of a spike density with a CAUSAL kernel (lags ≥ 0), evaluated
 * over the first `outLen` output samples (ADR-0006, zero-padded). This is the forward
 * model both the fit minimizes and the reconstruction residual reports, so the two are
 * identical by construction.
 *   predicted[i] = Σ_{j≥0} density[i−j] · causalKernel[j]
 * @param {ArrayLike<number>} density length M (binned-count spike density)
 * @param {ArrayLike<number>} causalKernel length ws+1 (lags 0..ws)
 * @param {number} outLen number of output samples to produce
 * @returns {Float64Array} length outLen
 */
export function forwardConvolveCausal(density, causalKernel, outLen) {
  const out = new Float64Array(outLen);
  const kn = causalKernel.length;
  for (let i = 0; i < outLen; i++) {
    let acc = 0;
    const jMax = i < kn - 1 ? i : kn - 1;
    for (let j = 0; j <= jMax; j++) acc += density[i - j] * causalKernel[j];
    out[i] = acc;
  }
  return out;
}

// Parameter bounds (seconds for τ; amp is unconstrained-positive in practice). Generous
// so the optimum stays interior for the calcium regime; they exist only to keep the
// nonlinear solve from wandering into degenerate (non-physical) territory.
const TAU_RISE_MIN = 0.01, TAU_RISE_MAX = 1.0;
const GAP_MIN = 1e-3, TAU_DECAY_MAX = 12.0;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

// Optimizer variables are reparametrized so the constraints hold automatically:
//   x = [ u, w, amp ]   with  tauRise = exp(u),  tauDecay = tauRise + exp(w)
// → tauRise > 0 and tauDecay > tauRise STRICTLY, for any real (u, w). amp is linear.
function thetaFromX(x) {
  const tauRise = clamp(Math.exp(x[0]), TAU_RISE_MIN, TAU_RISE_MAX);
  const gap = clamp(Math.exp(x[1]), GAP_MIN, TAU_DECAY_MAX);
  const tauDecay = clamp(tauRise + gap, tauRise + GAP_MIN, TAU_DECAY_MAX);
  return { tauRise, tauDecay, amp: x[2] };
}
function xFromTheta({ tauRise, tauDecay, amp }) {
  return [Math.log(tauRise), Math.log(Math.max(GAP_MIN, tauDecay - tauRise)), amp];
}

/** Solve a 3×3 linear system A·δ = b by Gaussian elimination with partial pivoting. */
function solve3(A, b) {
  // Work on an augmented copy.
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];
  for (let col = 0; col < 3; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-300) return null; // singular
    if (piv !== col) { const tmp = M[piv]; M[piv] = M[col]; M[col] = tmp; }
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * Recover the kernel by constrained-parametric double-exponential fit (ADR-0021
 * method 2). Nonlinear least squares (Levenberg–Marquardt with a numerical Jacobian)
 * over θ = (tauRise, tauDecay, amp), minimizing ‖trace − density ⊗ kernel(θ)‖² over the
 * fit region.
 *
 * @param {ArrayLike<number>} trace  ROI trace samples (NaN→0 by the caller), length M
 * @param {ArrayLike<number>} spikeDensity  binned-count density, length M
 * @param {Object} opts
 * @param {number} opts.windowSamples  symmetric kernel half-window (ws); causal support
 * @param {number} opts.dt  sample interval (seconds)
 * @param {{tauRise:number,tauDecay:number,amp:number}} [opts.init]  initial θ
 * @param {number} [opts.fitLength]  fit over trace[0..fitLength); default trace.length
 * @param {number} [opts.maxIter]  LM iteration cap (default 200)
 * @returns {{ samples:Float64Array, zeroIndex:number, dt:number, times:Float64Array,
 *   fit:{ theta:{tauRise:number,tauDecay:number,amp:number}, peakLagS:number,
 *   converged:boolean, iterations:number, sse:number, r2:number } }}
 */
export function recoverKernelParametric(trace, spikeDensity, opts) {
  const { windowSamples: ws, dt, init, fitLength, maxIter = 200 } = opts;
  if (!(ws > 0)) throw new Error('recoverKernelParametric: windowSamples must be > 0');
  if (!(dt > 0)) throw new Error('recoverKernelParametric: dt must be > 0');
  if (spikeDensity.length !== trace.length) {
    throw new Error('recoverKernelParametric: trace / spikeDensity length mismatch');
  }
  const M = fitLength != null ? fitLength : trace.length;

  // Initial θ: a plausible calcium transient (τ_rise ~0.1 s, τ_decay ~1.0 s, ADR-0021),
  // with amp seeded by a linear least-squares solve against the init shape so the very
  // first SSE is already near the best amp for those τ (variable-projection warm start).
  let theta0 = init || { tauRise: 0.1, tauDecay: 1.0, amp: 1 };
  {
    const shape = doubleExpCausal({ ...theta0, amp: 1 }, ws, dt);
    const basis = forwardConvolveCausal(spikeDensity, shape, M);
    let num = 0, den = 0;
    for (let i = 0; i < M; i++) { num += basis[i] * trace[i]; den += basis[i] * basis[i]; }
    theta0 = { ...theta0, amp: den > 0 ? num / den : 1 };
  }

  const model = (x) => {
    const k = doubleExpCausal(thetaFromX(x), ws, dt);
    return forwardConvolveCausal(spikeDensity, k, M);
  };
  const sseOf = (pred) => {
    let s = 0;
    for (let i = 0; i < M; i++) { const r = trace[i] - pred[i]; s += r * r; }
    return s;
  };

  let x = xFromTheta(theta0);
  let pred = model(x);
  let sse = sseOf(pred);
  let mu = 1e-3;
  let iterations = 0;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    // Numerical Jacobian of the MODEL wrt x (forward differences), and r = trace − pred.
    const Jm = [new Float64Array(M), new Float64Array(M), new Float64Array(M)];
    for (let p = 0; p < 3; p++) {
      const h = Math.max(1e-6, Math.abs(x[p]) * 1e-6);
      const xp = x.slice(); xp[p] += h;
      const predP = model(xp);
      const col = Jm[p];
      for (let i = 0; i < M; i++) col[i] = (predP[i] - pred[i]) / h;
    }
    // Normal-equation pieces: H = JmᵀJm, g = Jmᵀ r.
    const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const g = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const Ja = Jm[a];
      for (let b = a; b < 3; b++) {
        const Jb = Jm[b];
        let s = 0;
        for (let i = 0; i < M; i++) s += Ja[i] * Jb[i];
        H[a][b] = s; H[b][a] = s;
      }
      let gs = 0;
      for (let i = 0; i < M; i++) gs += Ja[i] * (trace[i] - pred[i]);
      g[a] = gs;
    }

    // LM inner loop: inflate the damping until the step reduces SSE (or give up).
    let stepTaken = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = [
        [H[0][0] * (1 + mu), H[0][1], H[0][2]],
        [H[1][0], H[1][1] * (1 + mu), H[1][2]],
        [H[2][0], H[2][1], H[2][2] * (1 + mu)],
      ];
      const delta = solve3(A, g);
      if (!delta) { mu *= 10; continue; }
      const xNew = [x[0] + delta[0], x[1] + delta[1], x[2] + delta[2]];
      const predNew = model(xNew);
      const sseNew = sseOf(predNew);
      if (sseNew < sse) {
        const rel = (sse - sseNew) / (sse || 1);
        x = xNew; pred = predNew; sse = sseNew;
        mu = Math.max(mu * 0.5, 1e-9);
        stepTaken = true;
        if (rel < 1e-8) converged = true;
        break;
      }
      mu *= 10;
    }
    if (!stepTaken) { converged = true; break; } // damping maxed → at a local min
    if (converged) break;
  }

  const theta = thetaFromX(x);

  // Assemble the ADR-0009 symmetric contract: causal half from the fit, negative-lag
  // half identically zero (causal by construction).
  const len = 2 * ws + 1;
  const samples = new Float64Array(len);
  const times = new Float64Array(len);
  const causal = doubleExpCausal(theta, ws, dt);
  for (let j = -ws; j <= ws; j++) {
    samples[ws + j] = j >= 0 ? causal[j] : 0;
    times[ws + j] = j * dt;
  }

  // Peak lag of the analytic transient (where d/dt = 0), reported in seconds. For a
  // double-exponential the peak is at t* = ln(τd/τr)·(τr·τd)/(τd−τr).
  const { tauRise, tauDecay } = theta;
  const peakLagS = (Math.log(tauDecay / tauRise) * (tauRise * tauDecay)) / (tauDecay - tauRise);

  // Reconstruction R² over the fit region (reported, never gated — ADR-0011). OPTION B:
  // the reconstruction uses the FULL analytic kernel (untruncated tail, ~5·τdecay), NOT
  // the ±ws display slice, so the residual is honest decoupling rather than
  // decoupling-plus-tail-clipping. The fit's θ and `sse` above are unchanged — they remain
  // the optimizer's (±ws-support) objective; only this reported reconstruction extends the
  // tail. The asymmetry is deliberate and parametric-only (the kernel is analytic).
  const reconFull = reconstructParametric(spikeDensity, theta, dt, M, ws);
  let ssRes = 0, ssTot = 0, mean = 0;
  for (let i = 0; i < M; i++) mean += trace[i];
  mean /= M;
  for (let i = 0; i < M; i++) {
    const r = trace[i] - reconFull[i]; ssRes += r * r;
    const d = trace[i] - mean; ssTot += d * d;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;

  return {
    samples, zeroIndex: ws, dt, times,
    fit: { theta, peakLagS, converged, iterations, sse, r2 },
  };
}
