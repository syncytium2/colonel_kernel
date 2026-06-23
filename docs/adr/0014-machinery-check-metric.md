# ADR-0014: Machinery-check metric — causal-lobe diagnostics, human-judged

## Status

Accepted
(Provisional in one respect: the choice of WHICH diagnostics to surface rests so
far on a single comparison — see Context. The principle is settled; the specific
metric set may be revised when the harness is built and exercised across more data.)

## Context

The machinery-check harness (see NEXT_SESSION, the synthetic-reference thread)
compares a recovered kernel against a known reference — either a planted synthetic
kernel or, for cross-checking, the lab deconvreg kernel. The question is what
quantity expresses "did the recovery come back right," and whether that quantity
should act as an automated pass/fail gate.

Empirical observation (one comparison, ROI 1 of APs_v1_20241004_80.mat): an
independent reimplementation of the ADR-0004 regularized-LSQ method was compared
against the lab deconvreg kernel. Raw correlation across the full ±5 s window was
0.82 — but that number is inflated. Both kernels share the large, high-variance
causal feature (sharp rise at lag 0, peak at +0.6 s), which dominates the
correlation arithmetic. The two kernels in fact DISAGREE across the entire acausal
(negative-lag) region: lab pedestal ≈ −0.006, reimpl ≈ 0. Causal-only correlation,
with the shared dominant feature removed, is 0.57 — the more honest figure for
whether the two kernels match.

A whole-kernel correlation gate set at any plausible threshold would pass 0.82
while the kernels agree only in the region the metric is dominated by. The acausal
region is also exactly where the distinction between a regularization artifact and
genuine cross-cell lead/lag structure lives (FOUNDATIONS §4) — a blunt whole-kernel
number blends those together and cannot tell them apart.

## Decision

Two parts.

(1) The machinery check does NOT use raw whole-kernel correlation as a headline
match metric. It reports causal-lobe agreement and/or the physiological parameters
directly — peak lag, decay constant (τ), peak amplitude — because machinery
correctness shows up there and those quantities are not inflated by the shared
causal feature. Whole-kernel correlation may be computed and shown as a secondary
figure, but never as the headline "match" number, precisely because it misleads.

(2) The gate is a HUMAN decision; the math is a guide. The harness surfaces the
diagnostics (causal-lobe agreement, peak-lag/τ/amplitude, the goodness-of-fit four
legs per FOUNDATIONS §3, and the kernel plot with the zero-lag line per ADR-0004)
and the person judges whether a recovery is trustworthy, bringing context the math
lacks — which cell the reference spikes belong to, whether acausal energy is
coupling or artifact, what the spike rate implies for STA/deconv agreement. This
extends ADR-0011 (fit quality is never an automated global gate; the spread across
ROIs is the signal) from the fit leg to the kernel-comparison leg.

## Consequences

- The harness presents diagnostics for interpretation, not a single pass/fail
  boolean. "Machinery is correct" is established by the synthetic oracle (planted
  kernel recovers within noise-set tolerance — NEXT_SESSION); kernel-comparison
  against real or lab kernels is a human-read diagnostic, not an automated gate.
- Avoiding whole-kernel correlation as the headline protects against a specific
  false positive: a recovery that catches the obvious peak but is wrong in the
  regularization-sensitive acausal region would score high and mislead.
- Surfacing peak-lag/τ/amplitude as the comparison vocabulary aligns with the lag
  legibility already required by ADR-0004 (marked zero-lag line) and the four-leg
  goodness-of-fit readout (§3).
- Relates to: ADR-0004 (deconvolution method, symmetric retained-lag kernel,
  regularization kept visible), ADR-0011 (validation gates machinery, not fit),
  FOUNDATIONS §3 (four-leg goodness-of-fit) and §4 (negative-lag structure is
  meaningful — coupling vs artifact is a human call, not a correlation's).
