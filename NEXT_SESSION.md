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

Reference: **[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)** — the validated MATLAB source-of-truth for Tab 2 (verified verbatim).

## Still open (not blockers)

- **Deconvolution numerical route** — decide after a prototype (per ADR-0004).
- **Kernel global vs. tab-local detail** + the **per-tab disclosure layout** (§11.4).
- **CSV layout convention** (§10 item 6) — needs a real exported file to confirm against.

## Next action

**Begin the Tab 1 build (forward convolution).** It is the simplest math and exercises the
reusable spine:

- spike-train input editor;
- parameterized kernel library ([ADR-0003](docs/adr/0003-kernel-source.md));
- `rasterize()` with its two axes ([ADR-0001](docs/adr/0001-delta-rasterization.md));
- global timebase ([ADR-0002](docs/adr/0002-global-timebase.md));
- uPlot rendering;
- the slide-and-multiply Canvas animation.

## Open scope question for next session

**Build order** — teaching-first (Tab 1 → 3 → 2) vs. front-loading the Tab 2 calcium pipeline that
is the real research need. **Decide at the start of next session.**
