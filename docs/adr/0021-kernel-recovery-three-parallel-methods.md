# ADR-0021: Kernel recovery as three parallel methods — free-vector, constrained-parametric, shape-regularized

## Status

**Accepted** — the **three-method recovery design is decided.** What is pending is *implementation*,
not the decision: this ADR **canonizes the design only and does not mandate simultaneous
implementation** (see Scope / sequencing — build order free → parametric → shape-regularized,
incremental). Method 1 (free-vector) already ships; methods 2 and 3 land later against this ADR. Extends [ADR-0004](0004-tab2-deconvolution-method.md)
(the free-vector method *is* ADR-0004, unchanged) and relates to [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md)
(raw kernel, no detrend in the recovery path), [ADR-0011](0011-validation-gates-machinery-not-fit.md) /
[ADR-0014](0014-machinery-check-metric.md) (report-don't-gate, human-judged),
[ADR-0018](0018-figure-gate-policy.md) (figure-gate), [ADR-0005](0005-tab2-sta-validation-partner.md)
(STA cross-method), [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) (the kernel
contract), and FOUNDATIONS §3 / §4.

## Context

The current recovery (`recoverKernel` in `src/lib/core/deconvolve.js`) is **regularized least squares
with a Laplacian (2nd-difference) smoothness prior** (ADR-0004):

```
recoverKernel(trace, spikeDensity, { windowSamples, dt, lambda = 0 })
  → { samples, zeroIndex, dt, times }            // the ADR-0009 kernel contract
H[k] = conj(S[k])·Y[k] / ( |S[k]|² + λ·|Lap[k]|² + 1e-12 ),  |Lap[k]|² = (2 − 2·cos(2πk/N))²
```

It recovers **N independent kernel taps penalized on smoothness** (the Laplacian power, tuned by a
single λ) — **not** on *where* the energy sits. Smoothness says nothing about lag location or
baseline level, so the optimizer is still free to place energy in **acausal lobes** and a downward
**baseline "bowl."** On the file-80 ROI-1 positive control this bowl **dominates the
reconstruction**: retained-kernel **R² = −1.0439**, **acausalRatio ≈ 0.30**, decay τ **unfittable
under the tilt** (`tauDecayS = NaN`, shown as "n/a (tilt)"). The classical fast-rise/slow-decay
response **is present** (+0.6 s peak, eyeball-confirmed per ADR-0018) but rides on a bowl that
trashes the reconstruction residual.

Two ways to address this were weighed:

- **Post-hoc kernel cleanup** (anchor t=0, zero the baseline, fill the bowl) — **rejected as a
  primary method.** It is a *display edit* that **hides** the bowl rather than preventing it, making
  reconstruction quality partly **fictional**: a kernel that reconstructs well only because its
  baseline was zeroed is not evidence. That violates the figure-gate discipline
  ([ADR-0018](0018-figure-gate-policy.md)).
- **Constrained recovery** — bake the constraint into the optimization so a clean reconstruction
  *earns* its score. This is the path taken below.

## Decision

Recover the kernel by **three parallel methods, all retained, none replacing the others.** The
**spread between them is itself diagnostic**: cleanly-coupled columns → the methods **converge**;
decoupled / non-classical columns → they **diverge** (free-vector messy, parametric fails loudly,
shape-regularized in between). The spread is a §3 / §4 signal, not noise to average away.

### 1. Free-vector — existing, unchanged ([ADR-0004](0004-tab2-deconvolution-method.md))
Tikhonov least squares with the Laplacian smoothness prior above. The **honest, assumption-minimal**
view: it imposes only smoothness, no shape. **The bowl itself is information** — `acausalRatio` and
the baseline tilt are diagnostic *outputs*, not defects to remove. **Never discarded.**

### 2. Constrained-parametric — fit a double-exponential transient
Fit a **double-exponential** kernel `kernel(θ)` with `θ = (τ_rise, τ_decay, amplitude)`, **anchored
at t = 0** with a **zero baseline by construction.** Recovery becomes a **nonlinear least-squares
fit** of `(spikeDensity ⊗ kernel(θ))` to the trace over `θ`.

- Directly encodes the premise *"when coupled, a classical unitary calcium response exists."*
- Makes **decay τ a first-class output** — there is no free baseline to tilt, so it **dissolves the
  "n/a (tilt)"** failure of method 1.
- **Double-exponential, NOT an alpha function:** an alpha function has a **single** time constant;
  the double-exponential has **two separable time constants** (independent rise and decay), which is
  more faithful to the classical calcium-transient model. The extra degree of freedom is the point.
- Its **failure mode is LOUD** (high residual / implausible τ) on decoupled or non-classical columns
  — **a feature for a verification tool, not a bug** (FOUNDATIONS §3, report-don't-gate per
  [ADR-0011](0011-validation-gates-machinery-not-fit.md)).

### 3. Shape-regularized — extend the existing penalty structure with two new shape terms
Free-vector taps, but penalize the **specific pathologies**, not just smoothness. **Honest accounting
of what is new:** the **smoothness penalty already exists** — it *is* the Laplacian prior tuned by λ
in method 1. What method 3 **genuinely adds** are two terms the **current single-λ Laplacian
formulation cannot express** (it is a frequency-domain smoothness penalty, not lag-localized):

- **(a) Baseline-flatness** — penalize energy *far from the peak* (suppress the bowl / tilt).
- **(b) Acausal-energy** — penalize content at **lags < 0**.

So method 3 = **extend the existing penalty structure** (keep the Laplacian smoothness term; add the
two lag-localized shape terms), **not** "add three penalties from scratch." It is the **middle
path**: it suppresses the bowl **without dictating a shape**.

> **Epistemic risk (flagged, not waved away).** "Penalize the baseline flat" is uncomfortably close
> to **faking the bowl away via a Lagrange multiplier.** Each penalty weight is a *choice that must
> be justified*, and **this is the method whose outputs need the most scrutiny** — it can manufacture
> a clean-looking kernel the data didn't earn. Keep its weights visible (FOUNDATIONS §7) and its read
> human-judged ([ADR-0014](0014-machinery-check-metric.md) / [ADR-0018](0018-figure-gate-policy.md)).
>
> **External corroboration of the risk.** The field's state-of-the-art spike-inference model
> (**MLspike**) treats baseline drift as a **nuisance term it jointly estimates**, not something to
> zero — independent evidence that a baseline-flatness *penalty* can suppress a bowl the data didn't
> earn. A future **baseline-nuisance variant** that **jointly estimates the drift** (rather than
> penalizing departures from flat) may be the more honest option than this penalty; recorded as a
> candidate, not adopted here.

### Distinct from the rejected cleanup path ([ADR-0017](0017-circular-deconv-zero-padding-no-fix.md))
- **Free-vector stays RAW** — no detrend, no windowing, no baseline removal in the recovery path
  (ADR-0017 stands).
- **Parametric and shape-regularized are CONSTRAINED RECOVERIES** — the constraint lives **inside the
  optimization**, so the reconstruction score is earned. They are **not** post-hoc edits of the raw
  recovered kernel. This is the line that separates them from the rejected cleanup: cleanup edits the
  *output*; these constrain the *solve*. State it so the two are never confused.

## Scope / sequencing (deliberate)

- This ADR **canonizes the three-method design and the rationale for each**, so none is lost. It does
  **not** require simultaneous implementation.
- **Build order: free-vector (done) → constrained-parametric → shape-regularized**, each
  **eyeball-verified against file-80 ROI-1** (ADR-0018) before the next is started. The ADR is the
  durable home; implementation lands **incrementally**.
- The parametric form is **double-exponential** (two separable time constants), for the fidelity
  reason stated above — recorded here so it is not silently downgraded to an alpha function.
- All three shape-regularized penalties (smoothness — already present; baseline-flatness;
  acausal-energy) are **named and recorded.** Whether all three ship or a subset is an
  **implementation-time call**; recording all three ensures none is forgotten.
- **All three methods return the same `{samples, zeroIndex, dt, times}` kernel contract**
  ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md)) so `kernelDiagnostics`, the
  overlay plot, and the reconstruction residual consume them uniformly.

## Consequences

- **New solver dependency** for the parametric nonlinear fit (initialization, convergence handling,
  bounds on τ). **Flagged, not resolved here.**
- **UI design problem this ADR creates (do NOT solve here):** up to **three recovered kernels** now
  share the recovered-kernel plot, *on top of* the still-unresolved kernel/STA overlay axis question
  (shared-y vs twin-y) — i.e. **up to four traces on one zero-lag origin.** Surface it as a distinct
  design problem to be solved separately.
- **The four §3 checks become method-indexed.** Kernel plausibility and reconstruction residual (and
  decay τ) now have **per-method values**, not one — `kernelDiagnostics` is run per recovered kernel,
  and the readout reports them side by side. The **spread across methods** is the new headline signal.
- **Relationship to [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md):** free-vector remains the
  raw, no-detrend kernel; the two constrained methods are *recoveries under constraint*, **not**
  detrended/cleaned versions of it. ADR-0017 is neither reopened nor contradicted.

## References

- Extends [ADR-0004](0004-tab2-deconvolution-method.md) (free-vector = the existing regularized LSQ).
- [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md) (raw kernel / no post-hoc cleanup — the
  rejected path, kept distinct from constrained recovery).
- [ADR-0011](0011-validation-gates-machinery-not-fit.md), [ADR-0014](0014-machinery-check-metric.md),
  [ADR-0018](0018-figure-gate-policy.md) (report-don't-gate; human / figure gate).
- [ADR-0005](0005-tab2-sta-validation-partner.md) (STA — an independent cross-method partner, alongside
  the three recovery methods), [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) (kernel contract).
- Surface: `src/lib/core/deconvolve.js` (`recoverKernel` / `deconvolveCircular`),
  `src/lib/core/kernel-diagnostics.js` (`kernelDiagnostics`: `peakLagS`, `peakAmp`, `tauDecayS`,
  `acausalRatio`), `src/lib/Tab2.svelte` (reconstruction residual = `circularConvolve(density,
  embeddedKernel)` vs trace, R²). FOUNDATIONS §3 (four checks), §4 (coupling / spread).
