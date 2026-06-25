# ADR-0022: No-AP (silent-recording) policy — zero-spike regions are skipped by policy, not recovered

## Status

**Accepted.**

Relates to [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) (the input contract and
per-region bracketing — where the zero-AP condition is detected), [ADR-0011](0011-validation-gates-machinery-not-fit.md)
(report-don't-gate — the boundary this ADR draws *against*: a zero-spike region is upstream of fit,
not a low-fit report), [ADR-0004](0004-tab2-deconvolution-method.md) (the deconvolution that has no
input to run), and FOUNDATIONS §3 (the four-check deliverable) / §5 (input contract).

**This policy GATES the queued 9-column per-ROI re-fan** (the incidence sweep): the re-fan must not
attempt recovery on zero-AP columns/regions, so the skip policy here is a prerequisite for it.

## Context

A deconvolution recovers a **kernel** from a **trace** and a **spike train** (the commutativity
trick — the spikes are the PSF; ADR-0004, reference doc §3.1). If a region or recording has **zero
action potentials**, there is **no input signal to convolve against**: the spike density is all
zeros, and `output = input ⊗ kernel` has no `input`. Recovery is not "poorly posed" here — it is
**undefined**. There is nothing for any of the three recovery methods
([ADR-0021](0021-kernel-recovery-three-parallel-methods.md)) to fit.

This is **distinct from the project's core "low fit is a real verdict" premise**
([ADR-0011](0011-validation-gates-machinery-not-fit.md), FOUNDATIONS §3). That premise concerns a
recording that **has spikes** but whose calcium is **decoupled** from them — there the four checks
*run* and a poor fit is the scientifically meaningful answer. A **zero-spike** region is **upstream of
fit entirely**: no spikes means no recovery to even score. Conflating the two would either (a) emit a
meaningless "kernel" from an all-zero input, or (b) misreport "no coupling" when the truth is "no
spikes were recorded in this window." Both are wrong; the honest handling is a **policy skip**, not a
fit report.

The condition is **common in the real batch, not a corner case.** Across the 72-file batch (the
shared `team_colonel_kernel` bus), **33 files are fully silent** (zero APs anywhere) and **22 more are
partially silent** (some regions have zero APs while others have spikes). The per-region zero-AP set
is already computed upstream — `zeroSpkRegions` — and tallied in the batch summary
(`golden/_batch_summary_v1.csv`). The information needed to apply this policy is therefore **already
on hand at load time**; what was missing was the *policy* for what to do with it.

## Decision

Recordings and regions with **zero spikes** are handled **by policy, not by attempting recovery.**

### 1. Flag-on-read (detection at load)

Zero-AP regions and recordings are **detected at load**, per region (`zeroSpkRegions`), reusing the
upstream tally already carried in `golden/_batch_summary_v1.csv`. The zero-AP condition is a
**property of the region/recording surfaced on load**, before any recovery is attempted — never
discovered partway through a deconvolution.

This composes with the existing per-region spike-sufficiency reporting
([ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) §7): that ADR already hard-errors the
**degenerate 0/1-spike** bracketing case ("region has too few spikes to analyze (N)"). This ADR makes
the **zero-AP** end of that range an explicit, named policy rather than only a bracketing
side-effect, and defines the **batch** behavior §7 did not.

### 2. Batch mode — SKIP zero-AP regions

In batch processing, zero-AP regions are **batch-skipped**: the batch **does not attempt recovery**
on them and **does not error** the run. The skip is **recorded** (which regions/recordings were
silent), so a batch over the 72-file set completes cleanly while accounting for every silent region
rather than crashing on the first one or silently dropping it.

### 3. User-selected single file with no APs — explicit message

When a user opens a **single recording that has no APs**, the app surfaces:

> **"No APs in this recording — deconvolution not possible."**

This is a **plain, honest dead-end**, not an error state and not an empty/zeroed kernel plot. It tells
the user *why* there is no kernel (no spikes were recorded), distinct from the *"there is no clean
kernel"* decoupling verdict that a spike-bearing recording can produce.

### 4. Scope

- **33 fully-silent files** (zero APs anywhere) across the 72-file batch.
- **22 partially-silent files** (per-region zero-AP regions; other regions in the same file are
  analyzable).
- Per-region granularity is load-bearing: a partially-silent file is **not** skipped wholesale — its
  **spike-bearing regions are analyzed** and only its **zero-AP regions are skipped**.

## Consequences

- **The 9-column re-fan is unblocked once this lands and gated until it does.** The incidence sweep
  recovers a kernel per ROI column per region; it must **skip zero-AP regions** rather than emit
  spurious kernels, so this policy is a hard prerequisite for the re-fan.
- **A zero-spike skip is never counted as a "no-coupling" result.** Decoupling incidence (the §3/§4
  scientific signal) is measured **only over regions that had spikes to begin with** — silent regions
  are excluded from the denominator, not scored as decoupled. Folding them in would inflate the
  "no clean kernel" rate with recordings that simply had no input.
- **The skip must be visible, not silent** (consistent with FOUNDATIONS §3 / ADR-0011's
  surface-everything posture): batch output records which regions were skipped for zero APs, and the
  single-file path states the reason on screen.
- **No new upstream computation** — `zeroSpkRegions` / `golden/_batch_summary_v1.csv` already carry
  the per-region spike counts; this ADR defines the *response* to them, not a new detector.
- **Boundary with [ADR-0011](0011-validation-gates-machinery-not-fit.md) is now explicit:** "low fit
  is reported, never gated" applies to **spike-bearing** regions; "zero spikes is skipped by policy"
  applies **upstream of fit.** The two never overlap, and neither is to be applied in the other's
  domain.

## References

- [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) — input contract; per-region
  bracketing and the degenerate 0/1-spike hard error (§7) this policy extends; `zeroSpkRegions`.
- [ADR-0011](0011-validation-gates-machinery-not-fit.md) — report-don't-gate; the boundary this ADR
  draws against (zero spikes is upstream of fit, not a low-fit report).
- [ADR-0004](0004-tab2-deconvolution-method.md) — the deconvolution that has no input when spikes are
  absent; [ADR-0021](0021-kernel-recovery-three-parallel-methods.md) — the three methods, none of
  which can fit an all-zero input.
- FOUNDATIONS §3 (four-check deliverable / decoupling incidence), §5 (input contract).
- `golden/_batch_summary_v1.csv` (per-region zero-AP tally) and the shared `team_colonel_kernel` bus;
  33 silent + 22 partial across the 72-file batch.
