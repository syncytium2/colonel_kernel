Project started: 1:30pm, June 21 2026.

# NEXT_SESSION

> Immediate working state and next actions.
> **First action of any session: read `FOUNDATIONS.md`** (canonical source of truth).

## Status

**Design phase complete.** All original open questions are settled and recorded. The repo is
scaffolded: Vite + Svelte, `fft.js` + `uplot` + `papaparse`, strict CSP in place
(`connect-src 'none'; default-src 'self'`).

## Decisions on record

`FOUNDATIONS.md` is canonical. The ADR set (`docs/adr/`) records the individual decisions:

- **[ADR-0001](docs/adr/0001-delta-rasterization.md)** — delta rasterization: snap default + unit / binned-count amplitude axes.
- **[ADR-0002](docs/adr/0002-global-timebase.md)** — global timebase (authored-adjustable, load-locked).
- **[ADR-0003](docs/adr/0003-kernel-source.md)** — kernel source: parameterized library (no freehand).
- **[ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)** — Tab 2 deconvolution: regularized LSQ, explicit regularization, symmetric retained-lag kernel.
- **[ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)** — STA as Tab 2 cross-method validation partner.
- **[ADR-0006](docs/adr/0006-linear-convolution.md)** — linear convolution (zero-padded) convention.
- **[ADR-0007](docs/adr/0007-build-order.md)** — build order / tab sequencing: **1 → 2 → 3** (Tab 1 as spine-validation; calcium kernel in the library from the start; math before animation).

Reference: **[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)** — the validated MATLAB source-of-truth for Tab 2 (verified verbatim).

## Still open (not blockers)

- **Deconvolution numerical route** — decide after a prototype (per ADR-0004).
- **Kernel global vs. tab-local detail** + the **per-tab disclosure layout** (§11.4).
- **CSV layout convention** (§10 item 6) — needs a real exported file to confirm against.

## Build order — SETTLED ([ADR-0007](docs/adr/0007-build-order.md))

**1 → 2 → 3.** Tab 1 first as spine-validation (de-risks the reusable foundation against
hand-checkable math); Tab 2 second (the real research need); Tab 3 last (low-value "watch it
fail" illustration). The calcium-indicator kernel is in Tab 1's library from the start. Within
Tab 1: **math before animation.**

## In progress: Tab 1 non-visual core

Built and verified (`src/lib/core/`, pure JS, no Svelte — `node src/lib/core/core.test.mjs`):

- `timebase.js` — global timebase / grid ([ADR-0002](docs/adr/0002-global-timebase.md)), authored mode.
- `rasterize.js` — `rasterize(spikeTimes, grid, { method, amplitudeMode })`, both axes from
  [ADR-0001](docs/adr/0001-delta-rasterization.md). `snap` + `unit` implemented; `antialias` and
  `binned-count` stubbed behind the same interface (drop-in later).
- `kernels.js` — parameterized library ([ADR-0003](docs/adr/0003-kernel-source.md)): Gaussian,
  exponential decay, boxcar, **calcium indicator** (`tau_rise`/`tau_decay`). No freehand.
- `convolve.js` — hand-written linear convolution ([ADR-0006](docs/adr/0006-linear-convolution.md)),
  stamp-and-sum, zero-padded (no circular wraparound).

Tab 1 UI (`src/App.svelte` + `src/lib/Plot.svelte`) renders input stems / kernel line / output
line with live recompute.

## Next action

- Build the **slide-and-multiply Canvas animation** for Tab 1 (the deferred visual piece).
- Then begin **Tab 2** (regularized deconvolution + STA + four-check scoring + per-ROI).
