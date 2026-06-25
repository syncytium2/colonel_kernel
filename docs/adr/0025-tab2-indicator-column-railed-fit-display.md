# ADR-0025: Tab 2 indicator column and railed-fit display — facts for the eye, never a verdict

## Status

**Accepted.**

Extends [ADR-0011](0011-validation-gates-machinery-not-fit.md) (machinery-gated / fit-reported — low
fit is a correct verdict, never an automated failure) and [ADR-0014](0014-machinery-check-metric.md)
(the machinery check is human-judged, not gated on a metric). Surfaces the loud-failure behavior of
[ADR-0021](0021-kernel-recovery-three-parallel-methods.md) method 2 (the parametric rail) and operates
under [ADR-0018](0018-figure-gate-policy.md) (figure-gate — facts for the eye, the human reads). The
overlay it annotates is [ADR-0024](0024-kernel-sta-overlay-display-mode.md) / [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md).

## Context

The file-80 9-column re-fan recon (read-confirmed by Tony per [ADR-0018](0018-figure-gate-policy.md))
surfaced two readout hazards that are mild in a static recon table but become **acute once slices are
viewed live in the app**, where the misleading number sits as a **label on every panel**:

- **Railed parametric fit.** The constrained-parametric fit (ADR-0021 method 2) **railed in 7 of 9
  columns** — a fitted τ pinned to its bound (`τ_rise → 0.010 s` min, or `τ_decay → 12.0 s` max). A
  railed fit **still emits a peak-lag number** (e.g. `+0.07 s`) that is an **artifact of the rail**,
  not a transient peak. This is exactly the **loud-failure** behavior ADR-0021 designed in — but the
  emitted number does not announce itself as junk.
- **Free-vector boundary "peak."** On several columns the free-vector kernel is a **monotonic slow
  bowl with no interior transient**; its peak-lag readout (e.g. `+4.9 s`) is just **where the max
  sample fell at the window edge** — a meaningless "peak."

In a live slice viewer both numbers read as ordinary peak-lag labels. The tool must **qualify** them
without **pronouncing** on them — because asserting "this fit failed / there is no kernel" is the
coupling verdict the tool deliberately leaves to the human (ADR-0011 / ADR-0014).

## Decision

Add an **indicator column of computed FACTS, not verdicts.** The machine reports mechanical,
geometric facts; the **human gates all decon success/failure judgments.**

### 1. Indicator column — neutral glyphs stating geometric facts

Per slice, the readout carries an indicator column of **neutral** indicators. **NO pass/fail
coloring. NO "fit failed" / "passed" language.** Each indicator states a **computed geometric fact**;
the reader interprets whether that fact means "broken" or "fine." Two indicators are defined now; **the
set is extensible:**

- **Parametric τ-RAILED** — a fitted τ is **pinned to its bound within ε** (`τ_rise` at its min or
  `τ_decay` at its max). Stated as **"τ at bound"**, not as a failure.
- **Kernel PEAK-AT-BOUNDARY** — the max sample sits **at (or within ε of) the window edge**, so the
  peak-lag readout is **not a transient peak**. Stated as **"peak at boundary"**, not as a failure.

A railed parametric fit is *mechanically* broken and a knowledgeable reader will read "τ at bound" as
such — **but the machine does not pronounce it.** The fact is stated; the meaning is the reader's.

### 2. Railed parametric output — default-HIDDEN, with "show anyways"

When a parametric fit is τ-railed, its **junk peak-lag / kernel is suppressed by default** so it does
not grab the eye on a live panel. **But suppression is a default CONVENIENCE, not a machine verdict —
it MUST be reversible by the reader.** A **"show anyways" toggle** always reveals the railed kernel,
because **whether a railed fit is telling them something is the reader's judgment, not the
optimizer's.** Default-hide ≠ hard-hide; the data is never withheld, only de-emphasized by default.

### 3. Free-vector deconvolution — NEVER gets an automated failure flag

The free-vector method **never receives an automated "fit failed" flag.** No reliable automated
decon-success criterion exists, and the tool **deliberately refuses to assert one** (the ADR-0011
machinery-gated / fit-reported split; the ADR-0014 human-judged machinery check). Free-vector **reports
its facts** — including **PEAK-AT-BOUNDARY** when it applies, which **qualifies** the misleading
peak-lag number **without asserting "no kernel."** The human evaluates coupling.

Building a free-vector **"fit failed" detector would assert exactly the coupling verdict the tool
exists to leave to the human** — it is **explicitly out of bounds.** (Note the asymmetry, and why it is
principled: the parametric **rail** is an *objective mechanical fact* about the optimizer — a parameter
literally sat on its bound — so it can be stated and its output default-hidden. "Free-vector recovery
failed" is **not** a mechanical fact; it is a *judgment about coupling*. The machine may state the
former and must never assert the latter.)

## Architectural stance (recorded so a future session does not erode it)

**The machine reports mechanical facts and never pronounces decon success/failure.** Even **output
suppression** (the railed-parametric default-hide) **stays human-reversible.** A future "helpful"
**auto-flag** ("this column failed") or **hard-hide** (railed output removed with no way to see it)
would **violate this stance and [ADR-0011](0011-validation-gates-machinery-not-fit.md) /
[ADR-0014](0014-machinery-check-metric.md).** The line is durable: facts for the eye; verdicts to the
human; suppression always reversible.

## Consequences

- **Live slice panels are honest by default**: the misleading peak-lag labels (railed parametric,
  boundary free-vector) are either suppressed-but-revealable (parametric) or annotated-in-place
  (free-vector PEAK-AT-BOUNDARY), so the eye is not led by an artifact number — without the tool ever
  saying "failed."
- **The indicator set is extensible**: τ-RAILED and PEAK-AT-BOUNDARY are the first two; future
  mechanical facts (e.g. non-convergence, all-zero density upstream per
  [ADR-0022](0022-no-ap-silent-recording-policy.md)) can join the same facts-not-verdicts column under
  the same stance.
- **ε thresholds are display parameters, not gates**: "within ε of the bound / edge" defines when the
  *fact* is stated; it never decides success. The specific ε is an implementation detail, kept visible.
- **No core/recovery change**: the rail is already an output of the parametric solve (a parameter at
  its bound); the boundary peak is already readable from the kernel. This ADR governs **display**, not
  math.
- **Consistent with [ADR-0024](0024-kernel-sta-overlay-display-mode.md)**: the kernel peak amplitude
  (and now these geometric facts) are reported numerically alongside the overlay; the figure shows
  shape, the readout shows facts, the human reads both.

## References

- [ADR-0011](0011-validation-gates-machinery-not-fit.md) — machinery-gated / fit-reported; low fit is
  a correct verdict, never an automated failure (the split this ADR keeps faithful).
- [ADR-0014](0014-machinery-check-metric.md) — the machinery check is human-judged, not gated on a
  metric.
- [ADR-0021](0021-kernel-recovery-three-parallel-methods.md) — the parametric method whose **rail** is
  the loud-failure behavior being surfaced (method 2 fails loud by design).
- [ADR-0018](0018-figure-gate-policy.md) — figure-gate; facts for the eye, the human reads.
- [ADR-0024](0024-kernel-sta-overlay-display-mode.md), [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md)
  — the overlay / lag axis these facts annotate.
- FOUNDATIONS §3 (four checks / machinery-gated framing), §11.2 (tab-local display controls).
- Evidence: the file-80 9-column re-fan recon (gitignored `darkroom/`; 7/9 parametric fits railed,
  several free-vector kernels boundary-peaked), read-confirmed by Tony per ADR-0018.
