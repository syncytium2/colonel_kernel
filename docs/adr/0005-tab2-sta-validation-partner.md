# 5. STA as Tab 2 cross-method validation partner

## Status

Accepted

## Context

- Tab 2 recovers a kernel via regularized deconvolution ([ADR-0004](0004-tab2-deconvolution-method.md)).
  On its own, a recovered kernel is hard to trust: the smoothness prior shapes it, and the user has
  no independent check on whether it reflects a real spike→calcium coupling.
- The proven lab pipeline **never runs deconvolution alone** — it always computes spike-triggered
  averaging (STA) on the same data and stores the two together as `k_sta` (see
  [docs/reference/matlab-deconv-pipeline.md](../reference/matlab-deconv-pipeline.md); STA params
  `STAwin = 2 s`, `STAbasewin = 0.5 s` baseline-zeroing window). In practice the deconvolved kernel
  is read *against* the STA, not in isolation.
- The two methods have **different failure modes**. STA assumes each spike's response is isolated
  and simply averages the trace in a window around each spike; it **breaks at high spike frequency**,
  where neighboring responses overlap and smear the average. Deconvolution makes no isolation
  assumption — it solves for the kernel that, convolved with the *whole* spike train, reproduces the
  *whole* trace — so it **still recovers a kernel in the high-frequency regime where STA fails**.
- Because the failure modes differ, the **relationship between the two estimates is itself
  diagnostic**.

## Decision

- **STA is built into Tab 2 from the start (v1), not deferred** — it is a core validation partner to
  the deconvolved kernel, mirroring the lab workflow that never separates them. Reimplement the STA
  logic (`spikeTriggeredAverage`, with the baseline-zeroing over `STAbasewin`) in JS alongside the
  deconvolution.
- The flagship per-ROI readout shows **both estimates together**: the deconvolved kernel and the STA
  waveform, plus their agreement, read alongside the **spike rate** so the user knows which regime
  they are in.
- **Cross-method agreement becomes a fourth leg of the goodness-of-fit assessment** — alongside
  plausibility, residual, and stability (see `FOUNDATIONS.md` §3).
- Interpret the three regimes explicitly in the UI / reference:
  1. **STA and deconv agree** → low-frequency, clean coupling → high confidence there is a real
     kernel.
  2. **STA degrades but deconv holds** → high-frequency regime → disagreement is *expected* and
     benign; trust deconv, discount STA. (Without STA the user can't see they're in this regime.)
  3. **STA fine but deconv wrong, or both wrong** → genuine uncoupling or model failure — the case
     the tool exists to surface.
- STA carries its own controls (`STAwin`, `STAbasewin`), which belong in the **advanced tier**
  (`FOUNDATIONS.md` §11) of Tab 2.

## Consequences

**Pros**

- Gives the user an **assumption-light independent check** on the deconvolved kernel.
- The spike-rate-dependent agreement tells them **which method to believe and why**.
- Matches the workflow the lab actually trusts.
- STA's breakdown is **itself informative** (a regime indicator), not just a redundant estimate.

**Cons**

- More to build for v1 — a second estimator, its plot, its parameters, its caveats — and more to
  explain to a new user. Mitigated by keeping STA controls in the **advanced tier** and leading the
  UI with the **agreement verdict** rather than raw parameters.

**Scope**

- Applies to Tab 2. STA is **not** a kernel *source* (cf. [ADR-0003](0003-kernel-source.md)) and does
  **not** change the deconvolution method ([ADR-0004](0004-tab2-deconvolution-method.md)); it is an
  independent parallel estimate.
