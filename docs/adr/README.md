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
