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
