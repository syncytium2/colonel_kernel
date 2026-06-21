Project started: 1:30pm, June 21 2026.

# NEXT_SESSION

> Immediate working state and next actions.
> **First action of any session: read `FOUNDATIONS.md`** (canonical source of truth).

## Status

**Tab 1 core + layout complete and verified.** Design phase settled earlier; this session built
and screenshot-verified the Tab 1 foundation. 3 commits on `master` (core → layout → CSP). Build
clean, ~41 KB gzipped, fully self-hosted.

## Done this session

- **Build order settled 1 → 2 → 3** ([ADR-0007](docs/adr/0007-build-order.md)); calcium kernel in
  Tab 1's library from the start; within Tab 1, math before animation.
- **Tab 1 non-visual core built + verified** — 23 self-checks pass (`npm run test:core`):
  `timebase.js`, `rasterize.js` (snap+unit live; antialias+binned-count stubbed behind the same
  interface), `kernels.js` (Gaussian, exponential, boxcar, **calcium indicator**), hand-written
  linear `convolve.js` (stamp-and-sum, zero-padded).
- **Tab 1 layout done + screenshot-verified** — left column = spike train over output on one
  shared recording-time axis (eye drops straight from spike to response); kernel = square ±lag
  panel upper-right (causal calcium transient renders correctly, flat-zero on negative lag).
- **CSP dev/prod split** ([ADR-0008](docs/adr/0008-csp-build-time-injection.md)) — strict policy
  injected into the production build via a Vite plugin; dev server relaxed so HMR works. `dist`
  ships identical `connect-src 'none'; default-src 'self'`. **Run the verification ritual against
  the BUILT artifact**, not the dev server.
- **Playwright/Chromium installed** — `npm run screenshot` for one-command visual checks.

## Decisions on record

`FOUNDATIONS.md` is canonical. The ADR set (`docs/adr/`) records the individual decisions:

- **[ADR-0001](docs/adr/0001-delta-rasterization.md)** — delta rasterization: snap default + unit / binned-count amplitude axes.
- **[ADR-0002](docs/adr/0002-global-timebase.md)** — global timebase (authored-adjustable, load-locked).
- **[ADR-0003](docs/adr/0003-kernel-source.md)** — kernel source: parameterized library (no freehand).
- **[ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)** — Tab 2 deconvolution: regularized LSQ, explicit regularization, symmetric retained-lag kernel.
- **[ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)** — STA as Tab 2 cross-method validation partner.
- **[ADR-0006](docs/adr/0006-linear-convolution.md)** — linear convolution (zero-padded) convention.
- **[ADR-0007](docs/adr/0007-build-order.md)** — build order / tab sequencing: **1 → 2 → 3**.
- **[ADR-0008](docs/adr/0008-csp-build-time-injection.md)** — CSP injected at build time (dev server relaxed for HMR).

Reference: **[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)** — the validated MATLAB source-of-truth for Tab 2 (verified verbatim).

## Where the code lives

- `src/lib/core/` — the reusable, framework-free spine (timebase, rasterize, kernels, convolve)
  + `core.test.mjs`. Shared by every tab.
- `src/App.svelte` — Tab 1 UI; `src/lib/Plot.svelte` — uPlot wrapper (shared-axis + ±lag support).
- `vite.config.js` — `inject-csp-on-build` plugin. `scripts/screenshot.mjs` — visual check.

## Next actions (in order)

1. **Slide-and-multiply animation for Tab 1** (the deferred visual piece). The kernel panel up top
   is the reference shape that slides across the spike train. This is the iteration sink — the math
   is already proven, so it's pure presentation.
2. **Tab 2 (flagship)** — regularized deconvolution ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md))
   + STA ([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)) + four-check goodness-of-fit +
   per-ROI. Heaviest piece; port against the MATLAB reference.

## Still open (not blockers)

- **Deconvolution numerical route** — decide after a Tab 2 prototype (per ADR-0004).
- **Kernel global vs. tab-local detail** + the **per-tab disclosure layout** (§11.4).
- **CSV layout convention** (§10 item 6) — needs a real exported file to confirm against.
