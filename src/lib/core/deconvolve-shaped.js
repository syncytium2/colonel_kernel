// Shape-regularized kernel recovery — METHOD 3 of ADR-0021 (the third of the three
// parallel recovery methods; free-vector `recoverKernel` in deconvolve.js is method 1,
// constrained-parametric `recoverKernelParametric` in deconvolve-parametric.js is
// method 2). All three are RETAINED — the spread between them is itself the §3/§4
// diagnostic; none replaces the others.
//
// What it is (ADR-0021 §Decision.3): free-vector kernel taps (negative-lag content
// retained, like method 1), but the optimizer penalizes the SPECIFIC pathologies the
// single-λ Laplacian of method 1 cannot express, AND jointly fits a minimal low-order
// baseline-drift nuisance basis. The combined objective (kernel taps k, drift coeffs c):
//
//   minimize ‖ density ⊛ k + B·c − trace ‖²
//            + λ_smooth ‖D₂ k‖²            (Laplacian smoothness — also in method 1)
//            + λ_flat   Σ_m (lag_m/win)² k_m²   (BASELINE-FLATNESS: suppress the bowl)
//            + λ_acausal Σ_{lag<0} k_m²          (ACAUSAL-ENERGY: penalize lags < 0)
//
// where ⊛ is the SAME circular convolution as method 1 (so the recovered ±window kernel
// is sample-for-sample comparable to free-vector about t = 0), and B is the drift basis.
//
// This is the ADR-0023 fork resolved toward COMBINING both candidate strategies — the
// flatness PENALTY (ADR-0023 option a) AND the drift nuisance BASIS (option b) — which
// the darkroom oracle (`darkroom/fig_method3_oracle.mjs`) validated: on a planted
// τ_decay under planted low-order drift, the combined objective recovers τ_decay WITHOUT
// the basis stealing decay, and the high-noise sweep (`fig_method3_noise.mjs`) showed
// the estimate stays UNBIASED (only wider) as σ climbs and the drift over-fit does not
// grow with noise. The basis is deliberately MINIMAL (degree 2): the noise sweep showed
// the conservative-dial is load-bearing — few enough terms that the basis cannot
// impersonate a calcium transient.
//
// Constraint lives INSIDE the optimization (ADR-0021): the reconstruction score is
// EARNED, not a post-hoc detrend/zero of a raw kernel (the rejected cleanup path,
// ADR-0017). The penalties and the drift basis are part of the SOLVE, not edits of the
// output.
//
// Returns the ADR-0009 kernel contract { samples, zeroIndex, dt, times } (length
// 2·windowSamples+1, zeroIndex = windowSamples), plus a `fit` object carrying the
// recovered drift (so a reader can SEE what the basis pulled out — FOUNDATIONS §7,
// regularization stays visible) and the reconstruction R² (reported, never gated —
// ADR-0011).

// Dials at the oracle-validated values. Visible / adjustable per FOUNDATIONS §7 — these
// are the load-bearing regularization weights, exported (not magic constants) so the UI
// and any diagnostic read the SAME numbers the solver uses.
export const SHAPED_DIALS = Object.freeze({
  lambdaSmooth: 5, // Laplacian 2nd-difference smoothness on the kernel taps
  lambdaFlat: 30, // baseline-flatness: weight on (lag/win)²·k² (suppress the bowl)
  lambdaAcausal: 50, // acausal-energy: weight on k² at lags < 0
  basisRidge: 1e-8, // tiny conditioning ridge on the drift coefficients only
});

// Drift nuisance basis order — the conservative identifiability dial (ADR-0023). A
// one-line constant by design: degree 2 → a 2-term low-order polynomial {u, u²},
// centered, too few terms to mimic a calcium decay (the noise sweep showed this dial is
// load-bearing). The oracle cross-checked the identifiability conclusion against a
// {linear, cosine} 2-term variant; the result is basis-shape-insensitive at this order.
export const DRIFT_BASIS_DEGREE = 2;

/**
 * Build the low-order drift nuisance basis over the real (un-padded) region [0, n).
 * Each column is a centered (mean-zero over [0,n)) polynomial term u^p, u = i/(n−1),
 * for p = 1..degree; columns are zero in the padded tail [n, N). Mean-zero so the basis
 * carries only the time-VARYING drift — the baseline LEVEL is not "drift" and is absorbed
 * by the kernel's DC, not by the basis (the ADR-0023 nuisance-removal stance, not a
 * generative baseline model).
 * @param {number} n  real region length (samples)
 * @param {number} degree  polynomial degree (number of basis columns)
 * @param {number} N  padded length (column length)
 * @returns {{ cols: Float64Array[], labels: string[] }}
 */
export function makeDriftBasis(n, degree, N) {
  const cols = [];
  const labels = [];
  for (let p = 1; p <= degree; p++) {
    const col = new Float64Array(N);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0;
      col[i] = Math.pow(u, p);
      mean += col[i];
    }
    mean /= Math.max(1, n);
    for (let i = 0; i < n; i++) col[i] -= mean; // center over the real region
    cols.push(col);
    labels.push(`u^${p}`);
  }
  return { cols, labels };
}

/** Symmetric-positive-definite solve via Cholesky (A = LLᵀ); A is n×n, b length n. */
function solveSPD(A, b) {
  const n = b.length;
  const Lc = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= Lc[i][k] * Lc[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('recoverKernelShaped: system not positive definite');
        Lc[i][j] = Math.sqrt(sum);
      } else {
        Lc[i][j] = sum / Lc[j][j];
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= Lc[i][k] * y[k];
    y[i] = sum / Lc[i][i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= Lc[k][i] * x[k];
    x[i] = sum / Lc[i][i];
  }
  return x;
}

/**
 * Recover the kernel by shape-regularized least squares with a joint drift nuisance
 * basis (ADR-0021 method 3). Same circular forward model as `recoverKernel` (method 1),
 * so the ±windowSamples kernel is directly comparable about t = 0.
 *
 * @param {ArrayLike<number>} trace  ROI trace (NaN→0 by the caller), length N (power of 2)
 * @param {ArrayLike<number>} spikeDensity  binned-count density (§13), length N
 * @param {Object} opts
 * @param {number} opts.windowSamples  symmetric kernel half-window (ws); length 2·ws+1
 * @param {number} opts.dt  sample interval (seconds)
 * @param {number} [opts.fitLength]  real (un-padded) region length over which the drift
 *   basis is defined and R² is scored; default trace.length (the whole array)
 * @param {number} [opts.lambdaSmooth]   override SHAPED_DIALS.lambdaSmooth
 * @param {number} [opts.lambdaFlat]     override SHAPED_DIALS.lambdaFlat
 * @param {number} [opts.lambdaAcausal]  override SHAPED_DIALS.lambdaAcausal
 * @param {number} [opts.driftDegree]    override DRIFT_BASIS_DEGREE
 * @returns {{ samples:Float64Array, zeroIndex:number, dt:number, times:Float64Array,
 *   fit:{ driftCoeffs:number[], drift:Float64Array, r2:number, basisLabels:string[],
 *   lambdas:{lambdaSmooth:number,lambdaFlat:number,lambdaAcausal:number}, driftDegree:number } }}
 */
export function recoverKernelShaped(trace, spikeDensity, opts) {
  const {
    windowSamples: ws,
    dt,
    fitLength,
    lambdaSmooth = SHAPED_DIALS.lambdaSmooth,
    lambdaFlat = SHAPED_DIALS.lambdaFlat,
    lambdaAcausal = SHAPED_DIALS.lambdaAcausal,
    driftDegree = DRIFT_BASIS_DEGREE,
  } = opts;
  if (!(ws > 0)) throw new Error('recoverKernelShaped: windowSamples must be > 0');
  if (!(dt > 0)) throw new Error('recoverKernelShaped: dt must be > 0');
  const N = trace.length;
  if (spikeDensity.length !== N) {
    throw new Error('recoverKernelShaped: trace / spikeDensity length mismatch');
  }
  const n = fitLength != null ? fitLength : N;
  const L = 2 * ws + 1;

  // Kernel design columns: circular conv is linear in the taps, and column m is the
  // spike density circularly shifted by pos[m] (lag m−ws; negative lags wrap, retaining
  // acausal content exactly like method 1).
  const pos = new Int32Array(L);
  for (let m = 0; m < L; m++) pos[m] = (((m - ws) % N) + N) % N;
  const kCols = [];
  for (let m = 0; m < L; m++) {
    const c = new Float64Array(N);
    const p = pos[m];
    for (let i = 0; i < N; i++) c[i] = spikeDensity[(((i - p) % N) + N) % N];
    kCols.push(c);
  }

  const { cols: bCols, labels: basisLabels } = makeDriftBasis(n, driftDegree, N);
  const P = bCols.length;
  const allCols = kCols.concat(bCols);
  const ncol = L + P;

  const dot = (a, b) => {
    let r = 0;
    for (let i = 0; i < N; i++) r += a[i] * b[i];
    return r;
  };

  // Gram G = MᵀM and rhs = Mᵀ·trace.
  const G = Array.from({ length: ncol }, () => new Float64Array(ncol));
  const rhs = new Float64Array(ncol);
  for (let a = 0; a < ncol; a++) {
    for (let b = a; b < ncol; b++) {
      const v = dot(allCols[a], allCols[b]);
      G[a][b] = v;
      G[b][a] = v;
    }
    rhs[a] = dot(allCols[a], trace);
  }

  // Kernel-tap regularization (lag-localized — the terms method 1 cannot express):
  //   smoothness D₂ᵀD₂ + diag(flat) + diag(acausal). Basis gets only a tiny ridge.
  for (let r = 0; r < L - 2; r++) {
    const idx = [r, r + 1, r + 2];
    const w = [1, -2, 1];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) G[idx[a]][idx[b]] += lambdaSmooth * w[a] * w[b];
    }
  }
  for (let m = 0; m < L; m++) {
    const lagFrac = (m - ws) / ws; // ∈ [−1, 1]; (lag/win), dt-independent
    G[m][m] += lambdaFlat * lagFrac * lagFrac; // baseline-flatness
    if (m < ws) G[m][m] += lambdaAcausal; // acausal-energy (lags < 0)
  }
  for (let q = 0; q < P; q++) G[L + q][L + q] += SHAPED_DIALS.basisRidge;

  const x = solveSPD(G, rhs);

  // Assemble the ADR-0009 symmetric contract from the recovered taps.
  const samples = new Float64Array(L);
  const times = new Float64Array(L);
  for (let m = 0; m < L; m++) {
    samples[m] = x[m];
    times[m] = (m - ws) * dt;
  }

  // Recovered drift over the real region, + reconstruction R² (reported, never gated).
  const driftCoeffs = Array.from(x.slice(L));
  const drift = new Float64Array(n);
  for (let q = 0; q < P; q++) for (let i = 0; i < n; i++) drift[i] += driftCoeffs[q] * bCols[q][i];

  // predicted = density ⊛ k + drift, scored over the real region [0, n).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += trace[i];
  mean /= Math.max(1, n);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    let pred = drift[i];
    for (let m = 0; m < L; m++) pred += x[m] * kCols[m][i];
    const res = trace[i] - pred;
    ssRes += res * res;
    const d = trace[i] - mean;
    ssTot += d * d;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;

  return {
    samples,
    zeroIndex: ws,
    dt,
    times,
    fit: {
      driftCoeffs,
      drift,
      r2,
      basisLabels,
      lambdas: { lambdaSmooth, lambdaFlat, lambdaAcausal },
      driftDegree,
    },
  };
}
