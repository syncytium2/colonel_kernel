# ADR-0018: Figure-gate policy — the human eye is the instrument

## Status

Accepted

Operational extension of [ADR-0014](0014-machinery-check-metric.md) (machinery-check
metric — human-judged, not gated on a whole-kernel correlation). ADR-0014 settled that
the *match metric* is human-judged; this ADR settles *how* that human judgment is
exercised when the evidence is a figure, and what may and may not overturn it.

## Context

This project's outputs are signals — kernels, traces, spike-triggered averages — whose
correctness lives in their *shape*. A summary statistic computed over such a signal
(a correlation, an R², a peak ratio) is a projection of that shape onto one number, and
the projection depends on choices the number does not carry with it: the support it is
computed over, what dominates the variance, where the baseline sits. The same two
kernels can score +0.84 over a ±1 s window and −0.74 over ±5 s. A number can therefore
contradict the visible truth while looking authoritative.

**Motivating case (2026-06-23, file 80, ROI 1 — the case that named this policy).**
Two independent signals both pushed the conclusion "the Tab 2 recovery is broken /
sign-inverted":

- a Pearson correlation of **−0.74** between the JS-recovered kernel and the lab
  `deconvreg` kernel, computed over the full ±5 s lag axis; and
- a prior Claude Code screenshot read of the Tab 2 strip that called the ROI 1 panel a
  broken recovery.

Both were wrong. Read as a figure, the recovered kernel is a **+0.6 s kernel feature
riding a large, oppositely-tilted slow baseline**: the kernel is present and agrees with
the lab at the peak (**+0.84** over the ±1 s window), and the −0.74 is a whole-window
statistic dominated by the baseline, not peak disagreement. The human (Tony, a
physiologist) read the figure correctly on sight; the number and the second-opinion
screenshot read were both computed/asserted over the wrong support and lost. The real
problem — a baseline tilt in the recovered kernel — is a different and smaller problem
than "broken recovery," and only the figure read distinguishes them.

This sits directly on top of ADR-0014, which already refuses to gate on a whole-kernel
correlation because the acausal region blends regularization artifact with genuine
lead/lag. The −0.74 episode is that exact failure mode realized on real data, plus a
second voice (an LLM screenshot read) carrying the wrong conclusion — so the policy must
name what authority a figure read holds against *both* a number and a second opinion.

## Decision

**For any claim whose evidence is a figure, the human reads the figure first; Claude/CC
reconcile to that read, and neither a summary statistic nor a second opinion (including
another Claude) overturns it.**

- A claim is **"figure-based" even when no image is currently on screen**, if its truth
  lives in a plot (kernel shape, trace morphology, lead/lag, fit). Such claims are
  governed by this policy regardless of whether a figure is rendered at the moment.
- When a metric and a figure disagree, **surface both**, but treat the human's visual
  read as authoritative. Before trusting a statistic, **identify the support / region it
  is computed over** — whole-window vs peak-window changed the *sign* here — and report
  that support alongside the number.
- A second opinion (a second model, a second run, a screenshot read) is **evidence, not
  a gate**. It cannot override the human figure read; at most it prompts a fresh figure.
- The reconciliation when a number and a figure conflict is to state *what the number
  measures*, not to adopt the number's conclusion: e.g. "−0.74 is a baseline-dominated
  whole-window statistic, not peak disagreement," rather than "recovery disagrees."

This is the human-gate principle of ADR-0014 made operational and given priority over
machine signals: ADR-0014 says the gate is human; this says the human gate reads the
*figure*, and figures outrank numbers and second opinions when they conflict.

## Consequences

- **Reconciliation discipline.** When a downstream number or a second opinion contradicts
  an established figure read, the record is reconciled *to the figure*, and the number is
  re-expressed as "what it actually measures." The 2026-06-23 ROI 1 canon reconciliation
  (FOUNDATIONS §3, [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md), NEXT_SESSION)
  is the worked example: the "sign-inverted bug" framing was removed because the figure
  said otherwise, not because a better number was found.
- **Anti-thrash.** This protects against a credible-looking statistic (or a confident
  second model) repeatedly reopening a settled visual finding. The cost is that a genuine
  problem the eye misses must be surfaced *as a figure* to land — which is the intended
  bar, and is consistent with the standing graphical-confirmation rule (every
  signal/physiology step renders eyeball-verifiable figures; NEXT_SESSION).
- **Provenance for statistics.** Numbers reported about signals must carry their support
  (window, region, normalization). A bare correlation without its support is not
  admissible as a counter-argument to a figure read.
- **Scope.** This governs figure-based / signal-shape claims. It does not relax the
  machinery gates (ADR-0011): arithmetic correctness, `zeroIndex` alignment, length /
  finiteness remain pass/fail and are not subject to "the figure looks fine."
- **Candidate for promotion.** If it holds across more cases, this may be lifted into
  `FOUNDATIONS.md` as a first-class principle alongside the graphical-confirmation rule;
  recorded here as an ADR first, per the doc structure.
