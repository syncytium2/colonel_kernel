# ADR-0023: Method-3 baseline-strategy fork — flatness penalty vs. drift nuisance basis (open)

## Status

**Proposed** — **deliberately NOT Accepted.** The fork below is left **open on purpose**: this ADR
records the boundary, the two candidate strategies, and the cautions that must inform the choice, so a
**future session decides deliberately** rather than defaulting into one path. Nothing here is built;
nothing is gated.

Extends [ADR-0021](0021-kernel-recovery-three-parallel-methods.md) (method 3 = shape-regularized, the
highest-scrutiny method). Relates to [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md) (no
detrend in the recovery path; display-only baseline handling is the parked, bar-set alternative),
[ADR-0011](0011-validation-gates-machinery-not-fit.md) / [ADR-0014](0014-machinery-check-metric.md) /
[ADR-0018](0018-figure-gate-policy.md) (report-don't-gate, human/figure gate), and FOUNDATIONS §2
(the parametric-foil block and the skeptic-vs-believer boundary) / §3 / §4.

## Context

The recovered-kernel **baseline tilt** ("bowl") is the standing unsolved characterization item on the
file-80 ROI-1 positive control (FOUNDATIONS §3): the free-vector method (method 1) recovers the
+0.6 s transient but rides a slow baseline the Laplacian smoothness prior cannot constrain (low-
frequency blindness, §4). Where baseline handling **belongs** is settled by ADR-0021:

- **Method 2 (constrained-parametric foil)** zeroes its baseline **by construction** — no additive
  offset term — and is **minimal by design** (FOUNDATIONS §2 parametric-foil block). That minimalism
  is the point: the foil is a deliberately simple linear reference shape, structurally analogous to
  STA's cross-method role. **Baseline modeling does not belong in the foil.**
- **Method 3 (shape-regularized)** is **where baseline handling belongs**, and is flagged in ADR-0021
  as the **highest-scrutiny method** — the one that can manufacture a clean-looking kernel the data
  did not earn.

The field's state of the art informs the fork: **MLspike MODELS baseline drift** as a nuisance term
it jointly estimates, rather than zeroing it (FOUNDATIONS §2 caveat 2). That is independent evidence
that a flatness *penalty* may be the wrong primitive — but adopting a generative drift term has its
own cost (below). The choice is genuinely open, so it is recorded as a fork, not decided.

## Decision

**Record the fork; do not resolve it.** Method-3 baseline handling has **two candidate strategies, and
this ADR commits to neither:**

### (a) Baseline-flatness PENALTY — the current ADR-0021 plan
A **regularization term** added to the shape-regularized objective that **penalizes low-frequency /
baseline energy** (energy far from the peak), alongside the existing Laplacian smoothness term and the
acausal-energy term ([ADR-0021](0021-kernel-recovery-three-parallel-methods.md) §Decision.3). The
kernel taps stay free; the penalty discourages the bowl **without dictating a shape.** This is the
path ADR-0021 currently names.

### (b) Baseline-drift NUISANCE BASIS — MLspike-flavored
An **explicit slow-drift component** (e.g. a low-order / low-frequency basis) **fit jointly with the
kernel**, so the drift is **explained** rather than penalized. The recovered kernel is read off the
non-drift component. This is closer to how the field's generative models treat baseline (FOUNDATIONS
§2), and was recorded in ADR-0021's epistemic-risk note as a **candidate "baseline-nuisance variant,"
not adopted there.** This ADR is its home.

**Both remain candidates. The choice is deferred to a deliberate future session**, informed by the
cautions below.

## Cautions that MUST inform the choice

1. **Believer-stance creep (the boundary).** Colonel Kernel is a **skeptic**: it *has* ground-truth
   spikes and tests whether coupling holds; it **refuses to assume the kernel** (FOUNDATIONS §2). A
   **nuisance/generative baseline term leans toward the spike-inference "believer" stance** the §2
   boundary is drawn against. A drift term is **not spike inference** — it does not assume the
   spike→calcium coupling model — but it **moves toward modeling the data-generating process.** Keep
   that boundary **explicit**: option (b) must be justified as *nuisance removal*, not as adopting a
   generative calcium model, or it erodes exactly the assumption the tool exists to interrogate.

2. **Identifiability — the central risk.** Slow baseline drift and a **long `τ_decay`** are **both
   low-frequency** and **partially confounded.** A more flexible baseline (especially option (b)) can
   absorb signal that belongs to the decay, yielding a **HIGHER reconstruction R² with a LESS
   trustworthy kernel.** This breaks the read the whole tool rests on: **"good fit" can stop meaning
   "coupled."** Any baseline strategy must be evaluated against this — a fit improvement is **not**
   evidence of a better kernel if a flexible baseline bought it. (This is why method 3 is the
   highest-scrutiny method, ADR-0021; the human/figure gate, ADR-0014 / ADR-0018, applies with full
   force.)

3. **Foil stays minimal.** Whatever method 3 does, **method 2 keeps its baseline zeroed by
   construction** (FOUNDATIONS §2, ADR-0021). **Do not migrate baseline modeling into the foil** — the
   foil's value is that it is the *simplest* linear reference; a baseline-modeling foil is no longer a
   foil. The spread between a minimal-baseline foil and a baseline-aware method 3 is itself
   diagnostic; collapsing them destroys that signal.

4. **High-pass preprocessing is RULED OUT for recovery.** Baseline is **not** to be removed by
   high-pass filtering the trace before recovery: it **confounds with `τ_decay`** (a high-pass
   attenuates exactly the low frequencies the decay lives in), **breaks the linear `output = input ⊗
   kernel` contract** the recovery and the foil both assume, and **distorts the decoupling events**
   (§3) the tool exists to measure (e.g. the file-80 ~790 s calcium-without-spikes transient). Baseline
   is handled **IN-MODEL** (this ADR's options (a)/(b)) **or display-only** (the parked,
   bar-set alternative — [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md): quiet-anchored,
   both-mask-gated, never in the recovery path). No third path via preprocessing.

## Consequences

- **Nothing is gated.** This ADR records a deliberately-open decision; the 9-column re-fan, the
  method-2/3 build order, and everything else proceed independently of how the fork resolves.
- **The future deciding session inherits a framed choice**, not a blank slate: two named options, the
  identifiability risk as the central evaluation criterion, the believer-stance boundary to hold, the
  foil-stays-minimal invariant, and the high-pass-ruled-out constraint.
- **Evaluation criterion is pre-committed even though the option is not:** a baseline strategy is
  judged by whether the recovered **kernel** is more trustworthy (peak lag, τ, shape, STA agreement —
  ADR-0014), **not** by reconstruction R² alone — because R² is precisely the metric a flexible
  baseline can inflate (caution 2).
- **If (b) is ever adopted**, it must ship with the believer-stance justification (caution 1) written
  into its accepting ADR, and its kernel reads must be figure-gated (ADR-0018) against an (a)-style or
  free-vector baseline to expose any identifiability trade.

## References

- Extends [ADR-0021](0021-kernel-recovery-three-parallel-methods.md) (method 3 shape-regularized;
  the epistemic-risk note naming the baseline-nuisance variant as a candidate).
- [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md) — no detrend in the recovery path; the
  display-only, bar-set baseline alternative.
- [ADR-0011](0011-validation-gates-machinery-not-fit.md), [ADR-0014](0014-machinery-check-metric.md),
  [ADR-0018](0018-figure-gate-policy.md) — report-don't-gate; the human/figure gate that method 3
  leans on hardest.
- FOUNDATIONS §2 (parametric-foil block; skeptic-vs-believer boundary; MLspike baseline-as-nuisance
  caveat), §3 (the baseline-tilt open item on ROI 1), §4 (Laplacian low-frequency blindness).
