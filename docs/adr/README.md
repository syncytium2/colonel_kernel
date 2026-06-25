# Architecture Decision Records

This directory records **decisions and changes** for `colonel_kernel`. It complements the other docs (see `CLAUDE.md` and `FOUNDATIONS.md` for the full structure):

- **`FOUNDATIONS.md`** — settled foundations and the reasoning behind them (the canonical source of truth).
- **ADRs (here)** — individual decisions and changes, recorded as they are made.
- **`NEXT_SESSION.md`** — the immediate working state and next actions.

When an ADR changes a settled point in `FOUNDATIONS.md`, update `FOUNDATIONS.md` to match so the two never disagree, and have them cross-reference each other.

## Convention

- One decision per file.
- Filenames are numbered and kebab-cased: `NNNN-title-in-kebab-case.md` (e.g. `0001-delta-rasterization.md`), zero-padded to four digits, incrementing.
- Each ADR follows the **Michael Nygard template**: **Title**, **Status**, **Context**, **Decision**, **Consequences**.
- **Status** is one of: `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-NNNN`.
- ADRs are immutable once Accepted: to change a decision, write a new ADR that supersedes the old one (and update the old one's status), rather than editing history.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-delta-rasterization.md) | Delta rasterization: snap + unit-amplitude defaults | Accepted |
| [0002](0002-global-timebase.md) | Global timebase (authored-adjustable, load-locked) | Accepted |
| [0003](0003-kernel-source.md) | Kernel source — parameterized library, no freehand drawing | Accepted |
| [0004](0004-tab2-deconvolution-method.md) | Tab 2 deconvolution method — regularized least squares ported from deconvreg | Accepted |
| [0005](0005-tab2-sta-validation-partner.md) | STA as Tab 2 cross-method validation partner | Accepted |
| [0006](0006-linear-convolution.md) | Linear convolution (zero-padded) as the default convention | Accepted |
| [0007](0007-build-order.md) | Build order / tab sequencing — 1 → 2 → 3 | Accepted |
| [0008](0008-csp-build-time-injection.md) | CSP injected at build time (dev server runs relaxed) | Accepted |
| [0009](0009-centered-symmetric-lag-explicit-zero-index.md) | Centered symmetric lag with explicit zero-index | Accepted |
| [0010](0010-idealized-recovered-kernel-open-family-toggle.md) | Idealized-recovered kernel is an open family toggle | Accepted |
| [0011](0011-validation-gates-machinery-not-fit.md) | Validation gates machinery, not fit | Accepted |
| [0012](0012-timing-vector-authoritative-dt-derived.md) | Timing vector is authoritative; dt is a derived fallback | Accepted |
| [0013](0013-binned-count-pre-first-bin-regime.md) | Binned-count pre-first-bin regime — teaching-keep default, validation-drop opt-in (`preFirstBin: 'keep'\|'drop'`); v1 stand-in for v2 buffered window | Accepted |
| [0014](0014-machinery-check-metric.md) | Machinery-check metric — causal-lobe / peak-lag+τ+amplitude diagnostics, raw whole-kernel correlation avoided as headline; gate is human, math is guide | Accepted (metric set provisional) |
| [0015](0015-harness-noise-model.md) | Noise model — v1 AWGN with a user slider 0–10× cohort-typical σ (1× ≈ 0.0024, from baseline regions); realizes §7/§11.2 noise injection; region-conditioning / σ-distribution / shot-term deferred to v2 | Accepted (v1 scope) |
| [0016](0016-csv-input-layout.md) | CSV input layout — per-region `time` / `spikes` (ragged) / `roi1..roiN`; produced offline by `scripts/mat2csv.py`; closes §10 item 6 | Accepted |
| [0017](0017-circular-deconv-zero-padding-no-fix.md) | Circular-deconv zero-padding needs no fix; detrend disposition is by anchor (endpoint/window harmful, quiet-anchored safe display-only); real-data bowl is decoupling + Laplacian low-freq blindness beneath a recovered kernel, not padding | Accepted |
| [0018](0018-figure-gate-policy.md) | Figure-gate policy — the human eye is the instrument; figure reads outrank summary statistics and second opinions when they conflict; operational extension of ADR-0014 | Accepted |
| [0019](0019-tab2-input-contract-workbook-per-recording.md) | Tab 2 input contract — one xlsx workbook per recording (`trace`/`spikes`/optional `metadata` sheets); whole untrimmed recording on a zero-based shared origin (t=0 at experiment onset), regions defined in-app (disjoint, overlap = hard error) and bracketed at analysis time, spike-bracketed default region; spike-sufficiency reported not gated; CSV (two files) as field fallback; replaces ADR-0016 layout (0016 stays Accepted); SheetJS becomes v1 critical-path. Accepted = core contract (frozen v1.0); open tails remain | Accepted |
| [0020](0020-region-end-markers-raw-no-clamp.md) | Region-end markers emitted raw — finite overhang past `tEnd` is **not** clamped (source-faithful `exp_timing×60`); open-ended `inf` ends fall back to `max(timing)` (representability exception, not a clamp); consumers must not assume `end_s ≤ tEnd`; ratifies exporter behavior, refines ADR-0019 | Accepted |
| [0021](0021-kernel-recovery-three-parallel-methods.md) | Kernel recovery as three parallel methods, all retained, spread-is-diagnostic — (1) free-vector = existing Tikhonov+Laplacian-prior (ADR-0004), raw, bowl is information; (2) constrained-parametric double-exponential (not alpha), zero-baseline by construction, makes decay τ first-class, fails loud; (3) shape-regularized = extend the existing Laplacian penalty with baseline-flatness + acausal-energy terms (smoothness already exists). Post-hoc cleanup rejected (figure-gate). Build order free→parametric→shape-reg, incremental; canonizes design only (implementation pending, not the decision) | Accepted |
| [0022](0022-no-ap-silent-recording-policy.md) | No-AP (silent-recording) policy — zero-spike regions/recordings are handled by policy, not recovery: flag-on-read (per-region `zeroSpkRegions`, already in `golden/_batch_summary_v1.csv`), batch-SKIP zero-AP regions (no recovery, no batch error), single-file no-AP → "no APs in this recording — deconvolution not possible". Zero spikes is upstream of fit (no input to convolve), NOT a low-fit report (boundary vs ADR-0011); silent regions excluded from the decoupling-incidence denominator, never scored as decoupled. Scope: 33 silent + 22 partial across the 72-file batch. GATES the 9-column re-fan | Accepted |
