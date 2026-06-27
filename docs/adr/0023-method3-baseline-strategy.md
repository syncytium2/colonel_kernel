# ADR-0023: Method-3 baseline strategy — combined flatness penalty + minimal drift nuisance basis

## Status
Accepted (supersedes the Proposed/open fork). Figure-gated (ADR-0018) on the
synthetic oracle, a high-noise stress sweep, and the file-80 ROI-1 graduation read.

## Context
ADR-0021 method 3 (shape-regularized recovery) requires a baseline strategy. Two
approaches were posed as a fork:
(a) a baseline-flatness *penalty* on the kernel, vs
(b) an MLspike-flavored baseline-drift *nuisance basis* that models drift explicitly.

The central hazard is the drift⇄τ_decay identifiability confound: long calcium decay
tails, summed across many spikes, present as low-frequency structure a drift model can
absorb — silently shortening recovered τ_decay. FOUNDATIONS §2 records the field's
standing caution that drift is something to *model, not zero*.

## Decision
Adopt **both**, as terms in one combined objective rather than rival variants:
- a kernel-smoothness (Laplacian) penalty plus **baseline-flatness + acausal-energy**
  penalties on the kernel, and
- a **minimal, low-order (degree-2) drift nuisance basis**, jointly fit.

The two attack the confound from opposite sides: the basis gives drift a legitimate
home; the kernel penalties keep the kernel from absorbing what the basis should. The
basis is held deliberately minimal — the conservative dial is load-bearing (see
Consequences).

## Consequences
**Validated (figure-gated, three instruments):**
- *Synthetic oracle (known τ_decay + known drift):* all regularized treatments recover
  τ_decay within ~0.3 s of planted truth; combined penalty+basis is closest of the
  three. The basis does not steal decay at degree 2.
- *High-noise sweep (σ to 30×, 20 realizations, two λ_smooth regimes):* τ_decay stays
  unbiased — mean pinned to truth, only spread grows. Drift over-fit factor flat at
  ~3.9× across all σ and both λ regimes: the over-fit is structural decay-tail leakage,
  not noise-amplified, and heavier smoothing does not worsen it. The
  noise→smoothing→theft chain does not materialize.
- *file-80 ROI-1 graduation:* shaped recovers the +0.60 s peak (on free-vector, near
  parametric +0.63 s; STA +0.80 s expected, ADR-0005); basis+flatness flatten the
  kernel baseline (−0.0099 → +0.0011, addressing the unsolved bowl); τ_decay is a
  finite 3.89 s where free-vector returned NaN ("n/a tilt").

**Costs and cautions:**
- Recovered drift is ~3.9× true drift (oracle) — structural, σ-invariant, λ-invariant.
  The basis is a kernel-protection device; its recovered drift is NOT a trustworthy
  drift measurement and must never be read as one. A future baseline-nuisance variant
  needing a real drift estimate is out of scope here.
- Shaped τ_decay runs ~1 s longer than parametric (3.89 s vs 2.89 s on file-80 ROI-1) —
  a smoothing-induced lengthening seen in the oracle, NOT a method disagreement.
- The minimal basis is load-bearing: at degree 2 it already over-claims 4×; a richer
  basis would over-claim worse and is where the confound would begin to bite the kernel.

**Flagged follow-up (not a blocker):** all evidence plants τ_decay near 2.89 s. The
structural-leakage argument predicts the confound is worst at longer true τ_decay
(longer tail = more drift-like energy). A longer-τ oracle (~5–6 s) was not run; it is
the one stress the named hazard most directly targets and should be run before method 3
is relied on for long-decay indicators.
