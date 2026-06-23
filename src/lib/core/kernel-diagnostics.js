// Kernel diagnostics (ADR-0014): the comparison vocabulary for judging a recovered
// kernel — causal-lobe peak lag, peak amplitude, decay τ, and acausal (negative-lag)
// energy. ADR-0014 is explicit that raw whole-kernel correlation is NOT the headline
// match metric (it is inflated by the shared dominant causal feature); these
// physiological parameters are. On the synthetic oracle the comparison CAN be an
// automated within-tolerance check (the planted answer is known); against real/lab
// kernels the same numbers are a human-read diagnostic, never an automated gate.
//
// Operates on the ADR-0009 symmetric kernel contract: { samples, zeroIndex, dt }.

/**
 * @typedef {Object} KernelDiagnostics
 * @property {number} peakLagS    lag of the causal-lobe peak (seconds)
 * @property {number} peakAmp     amplitude at that peak
 * @property {number} tauDecayS   exponential decay constant fit to the post-peak tail (s); NaN if unfittable
 * @property {number} acausalRatio  Σ(negative-lag²) / Σ(causal²); ~0 for a clean causal kernel
 * @property {number} acausalMean   mean of the negative-lag samples (the pedestal level; FOUNDATIONS §4)
 */

/**
 * Compute diagnostics for a symmetric kernel.
 * @param {{ samples: ArrayLike<number>, zeroIndex: number, dt: number }} kernel
 * @returns {KernelDiagnostics}
 */
export function kernelDiagnostics({ samples, zeroIndex, dt }) {
  const n = samples.length;

  // Causal-lobe peak (lag ≥ 0).
  let peakIndex = zeroIndex;
  let peakAmp = samples[zeroIndex];
  for (let i = zeroIndex; i < n; i++) {
    if (samples[i] > peakAmp) {
      peakAmp = samples[i];
      peakIndex = i;
    }
  }
  const peakLagS = (peakIndex - zeroIndex) * dt;

  // Decay τ: log-linear fit to the post-peak tail, down to 5% of peak while positive.
  const tauDecayS = fitDecayTau(samples, peakIndex, peakAmp, dt);

  // Acausal (negative-lag) energy and pedestal.
  let negEnergy = 0;
  let negSum = 0;
  let negCount = 0;
  for (let i = 0; i < zeroIndex; i++) {
    negEnergy += samples[i] * samples[i];
    negSum += samples[i];
    negCount++;
  }
  let causalEnergy = 0;
  for (let i = zeroIndex; i < n; i++) causalEnergy += samples[i] * samples[i];

  return {
    peakLagS,
    peakAmp,
    tauDecayS,
    acausalRatio: causalEnergy > 0 ? negEnergy / causalEnergy : NaN,
    acausalMean: negCount > 0 ? negSum / negCount : NaN,
  };
}

/**
 * Mean of the kernel over the pre-zero-lag window [−baselineS, 0) — the same
 * baseline convention STA uses (STAbasewin). DISPLAY/DIAGNOSTIC ONLY: it lets the
 * readout report a peak amplitude relative to the local pre-spike baseline instead
 * of absolute off a tilted baseline. It does NOT alter the kernel (ADR-0017: no
 * detrend in the recovery path or the plotted trace).
 * @param {{ samples: ArrayLike<number>, zeroIndex: number, dt: number }} kernel
 * @param {number} baselineS pre-zero window length (s), e.g. 0.5
 * @returns {number} mean over [−baselineS, 0); NaN if the window is empty
 */
export function preZeroBaselineMean({ samples, zeroIndex, dt }, baselineS) {
  const w = Math.round(baselineS / dt);
  let sum = 0, count = 0;
  for (let i = Math.max(0, zeroIndex - w); i < zeroIndex; i++) {
    sum += samples[i];
    count++;
  }
  return count > 0 ? sum / count : NaN;
}

/** Log-linear decay fit on the post-peak tail; returns τ (s) or NaN. */
function fitDecayTau(samples, peakIndex, peakAmp, dt) {
  const floor = peakAmp * 0.05;
  const ts = [];
  const ys = [];
  for (let i = peakIndex + 1; i < samples.length; i++) {
    const v = samples[i];
    if (v <= floor) break; // first drop below floor ends the clean decay run
    ts.push((i - peakIndex) * dt);
    ys.push(Math.log(v));
  }
  if (ts.length < 2) return NaN;
  // Least-squares slope of ln(v) vs t.
  const m = ts.length;
  let st = 0, sy = 0, stt = 0, sty = 0;
  for (let i = 0; i < m; i++) {
    st += ts[i];
    sy += ys[i];
    stt += ts[i] * ts[i];
    sty += ts[i] * ys[i];
  }
  const denom = m * stt - st * st;
  if (denom === 0) return NaN;
  const slope = (m * sty - st * sy) / denom;
  return slope < 0 ? -1 / slope : NaN;
}

/**
 * Compare a recovered kernel against a planted/reference one in ADR-0014 terms.
 * @param {KernelDiagnostics} recovered
 * @param {KernelDiagnostics} planted
 * @returns {{ dPeakLagS:number, dTauDecayS:number, ampRatio:number, recovered:KernelDiagnostics, planted:KernelDiagnostics }}
 */
export function compareKernels(recovered, planted) {
  return {
    dPeakLagS: recovered.peakLagS - planted.peakLagS,
    dTauDecayS: recovered.tauDecayS - planted.tauDecayS,
    ampRatio: recovered.peakAmp / planted.peakAmp,
    recovered,
    planted,
  };
}
