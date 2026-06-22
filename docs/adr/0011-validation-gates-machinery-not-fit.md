# 11. Validation gates machinery, not fit

## Status

Accepted

## Context

- The project's **core scientific premise** is that the spike train and the calcium
  signal are, in many ground-truth recordings, **discrepant — spikes and calcium
  can be *uncoupled*** (`FOUNDATIONS.md` §1, §2). This is the phenomenon the tool
  exists to surface, **not** an artifact to correct.
- The flagship deliverable is "is there a kernel, or isn't there?" answered by a
  four-check goodness-of-fit framework, of which the **reconstruction residual** is
  one leg (`FOUNDATIONS.md` §3). The Tab 1 forward path —
  `binned-count(spikes) ⊗ kernel ≈ ROI trace` — is where that residual is first
  exercised.
- This creates an easily-violated trap: it is tempting to "validate" the forward
  path by asserting a **high goodness-of-fit** against a real ROI trace. For an
  **uncoupled** ROI that assertion would fail *correctly* — and gating on it would
  discard exactly the signal the tool reports. Fit quality and machinery
  correctness are different questions and must not be conflated.

## Decision

Every validation harness in the tool **gates on machinery correctness and only
*reports* fit:**

- **Gated (pass/fail) — machinery correctness.** Convolution arithmetic;
  origin / `zeroIndex` alignment (`FOUNDATIONS.md` §13,
  [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md)); binned-count
  rasterization matching `hist(spikes, timing)`; output length and finiteness.
  These **must hold regardless of coupling**, and are verified on **known-coupled
  or synthetic data where the expected output is known** — never judged by how well
  a real, possibly-uncoupled ROI is reproduced.
- **Reported (never a gate) — fit quality.** The R² / residual of reconstruction
  against the real ROI trace is a **per-ROI measured, reported quantity**. It is
  **never a global acceptance criterion.**

## Consequences

- A **low reconstruction quality on an uncoupled ROI is a correct verdict** ("there
  isn't one"), not an implementation failure. A correct forward path faithfully
  reconstructs a *coupled* ROI **and** faithfully *fails* to reconstruct an
  *uncoupled* one.
- The **spread of fit across ROIs** — high on coupled cells, low on uncoupled ones
  — is itself the reported scientific signal, consistent with the per-column
  multi-ROI readout (`FOUNDATIONS.md` §4).
- The upcoming **Tab 1 reconstruction harness cites this ADR**: its pass/fail
  assertions cover machinery only; fit is computed and surfaced, not asserted.
- No numeric fit threshold is defined anywhere as a gate. (Reporting thresholds for
  *display* — e.g. how the UI flags a clean vs. poor fit — are a separate, later
  presentation decision, not an acceptance gate.)

## Cross-references

- `FOUNDATIONS.md` §3 — the four-check goodness-of-fit framework (this ADR governs
  the residual leg's use in validation) and the "Validation gates machinery, not
  fit" subsection.
- `FOUNDATIONS.md` §13 / [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md)
  — the explicit-origin signal contract that the machinery-correctness gate checks.
- `FOUNDATIONS.md` §2 — the three kernel concepts (chosen → idealized-recovered →
  recovered) the forward path exercises.
- `FOUNDATIONS.md` §1–§2 — the spike/calcium uncoupling premise.
