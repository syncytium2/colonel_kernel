# ADR-0024: Kernel/STA overlay amplitude axis — shared-y default + normalized-overlay toggle (twin-y rejected)

## Status

**Accepted.**

Builds on [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) (the shared zero-lag
**x-axis** this overlay sits on) and serves [ADR-0005](0005-tab2-sta-validation-partner.md) (STA as
the cross-method validation partner — the agreement this display exists to let the eye read). Operates
under [ADR-0018](0018-figure-gate-policy.md) (figure-gate — the human eye is the instrument) and
relates to FOUNDATIONS §3 (the four checks, two of which read this panel) and §11 (controls /
progressive disclosure — this is a tab-local display control).

**Resolves the parked "shared-y vs twin-y" open item** (NEXT_SESSION). The decision was reached from
the re-fan evidence below plus the false-agreement argument — **the MATLAB-figure check is no longer a
prerequisite** and is dropped as a blocker.

## Context

The Tab 2 readout overlays the **recovered kernel** and the **STA** on one panel, sharing the lag/
**x-axis** at the t = 0 origin ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md), settled
— both place t = 0 at `zeroIndex`, which is what makes their cross-method agreement comparable
sample-for-sample). The **amplitude / y-axis** handling was left open, parked pending a MATLAB-figure
check.

The 9-column re-fan reconnaissance on file-80 (read-confirmed by Tony per
[ADR-0018](0018-figure-gate-policy.md)) forced the question. On file-80 **column 1** the STA peaks at
**~0.034 dF/F₀** while the recovered kernel sits at **~±0.01** — a **~3× magnitude gap.** On a single
shared amplitude axis, that gap **compresses the kernel's shape** on exactly the panel that is read
most. And the **kernel shape** — peak lag, decay, acausal pedestal — is precisely what the §3
**plausibility** and **cross-method-agreement** checks actually read. So the display can, under shared
scaling, visually flatten the very feature the checks depend on.

The obvious fix — **twin-y (independent dual axes)** — was **considered and rejected.** A tool whose
**core job is reading agreement between two methods** must not adopt a display that can **manufacture
false agreement**: independent y-scales and (worse) **non-coincident zero lines** can make an
unrelated kernel and STA appear to track each other. That is the opposite of what
[ADR-0005](0005-tab2-sta-validation-partner.md) cross-method agreement is for. Twin-y trades a real,
honest magnitude gap for a fabricated visual coincidence — unacceptable for this panel.

## Decision

The overlay **amplitude axis is a user TOGGLE with two modes**, both rendering kernel and STA on **one
common axis with a single coincident zero line**:

### 1. SHARED-Y — default, always seen first
Kernel and STA share **one common amplitude axis**, so **true relative magnitude is preserved.** The
amplitude difference between the kernel and the STA is **real information, not a nuisance to hide** —
it is part of the cross-method read. This is the **honest baseline**: the user sees the true relative
scale before any rescaling is offered.

### 2. NORMALIZED OVERLAY — opt-in, display-only
Both traces are **scaled to a common reference** (peak = 1 or equivalent) on **one axis**, so
cross-method **SHAPE agreement** is maximally legible **when a magnitude gap swamps it under
shared-y.** This is a **display-only** transform — it changes nothing in the recovery, the diagnostics,
or the stored signals; it only rescales what is drawn.

### Twin-y is explicitly NOT offered
Dual independent axes are **recorded as rejected**, for the false-agreement rationale above
(non-coincident zero lines + independent scaling can fabricate cross-method coincidence). Both offered
modes keep a **single shared zero line**; the only thing the toggle changes is whether the two traces
are drawn at **true relative scale** (shared-y) or **common-reference scale** (normalized).

## Safety requirements (part of the decision, not optional polish)

These two requirements are **what makes the normalized mode safe**; without them the toggle reintroduces
exactly the false-agreement failure twin-y was rejected for.

1. **Normalized mode MUST be unmistakably labeled as normalized** in the UI — a banner or axis label
   that **cannot be missed.** A normalized overlay misread as shared-y **manufactures false amplitude
   agreement** (two traces forced to the same peak look like they agree in magnitude when they do
   not). The toggle is only safe if the **active mode is always unambiguous** at a glance.
2. **Kernel peak amplitude stays REPORTED NUMERICALLY in BOTH modes** — the §3 **plausibility** leg,
   i.e. the **+0.0096 baseline-relative** figure already in canon (FOUNDATIONS §3). Normalized mode
   discards amplitude **VISUALLY but never INFORMATIONALLY:** the **figure shows shape, the readout
   shows magnitude.** This split is exactly what makes it acceptable to visually drop amplitude in
   normalized mode — the magnitude is never actually lost, only moved from the plot to the number.

## Consequences

- **The parked "shared-y vs twin-y" item is closed.** The MATLAB-figure check is **no longer a
  prerequisite** — the decision rests on the re-fan magnitude-gap evidence and the false-agreement
  argument, not on matching the lab figure's convention. (Strike/annotate the NEXT_SESSION line.)
- **Default behavior is the honest one.** A user who never touches the toggle always sees true relative
  magnitude; normalized is strictly opt-in and strictly display-only.
- **One more tab-local display control** on the Tab 2 readout (FOUNDATIONS §11.2 / §11.4): the
  overlay-mode toggle joins regularization / noise / ROI selection as Tab-2-local. It is **contextual**
  — it has no meaning on Tab 1 and must not appear there (§11.1).
- **No core/recovery impact.** Both modes consume the same ADR-0009 kernel + STA signals; nothing about
  the recovery, the diagnostics, or the stored data changes. This is a pure presentation decision.
- **Implementation guard for whoever builds it:** the normalized scaling and the mode label live
  together — shipping the rescale without the unmissable label is a partial implementation that
  violates safety requirement 1, not a smaller version of this ADR.

## References

- [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) — the shared zero-lag **x-axis** this
  overlay builds on (both modes keep the single coincident zero line).
- [ADR-0005](0005-tab2-sta-validation-partner.md) — STA as cross-method validation partner; the
  agreement read this display serves and must not fake.
- [ADR-0018](0018-figure-gate-policy.md) — figure-gate; the toggle lets the instrument adapt to what
  the eye needs per look while keeping the **default** truthful.
- FOUNDATIONS §3 (four checks — plausibility + cross-method agreement read this panel; the
  baseline-relative peak-amp number that stays reported in both modes), §11 (controls / disclosure —
  tab-local display control).
- Evidence: the file-80 9-column re-fan recon (gitignored `darkroom/`; col-1 STA ~0.034 vs kernel
  ~±0.01), read-confirmed by Tony per ADR-0018.
