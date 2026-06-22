Project started: 1:30pm, June 21 2026.

# NEXT_SESSION

> Immediate working state and next actions.
> **First action of any session: read `FOUNDATIONS.md`** (canonical source of truth).

## Status

**Tab 1 core + layout complete and verified; signal contract now settled.** Design phase settled
earlier; the Tab 1 foundation was built and screenshot-verified (core → layout → CSP). Build clean,
~41 KB gzipped, fully self-hosted. **The in-memory signal contract is now locked
([ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md), `FOUNDATIONS.md` §13), so
Tab 1 convolution wiring can proceed against it.**

**Fixture provenance CONFIRMED (read-only inspection, 2026-06-22).** The reference `.mat` outputs
at `…/Dropbox/…/data/APs` (MATLAB v7.3/HDF5, 39 files) were checked against the ADR-0009 /
FOUNDATIONS §13 arithmetic: **kernel contract 65/65 regions pass** (`kernel_time` length
`2*round(5/dt)+1`, `linspace(-5,5,·)`, zero-lag at index `window_samples`, ROI-dim matches `stack`)
and **STA contract 56/56 regions pass** (`STA_time` length `2*round(2/dt)+1`, symmetric ±2 s, zero at
`window_samples` — confirms `spikeTriggeredAverage.m` `pre=post=window`). **Verdict: PASS** — these
fixtures were produced by the current `.m` sources, so **Tab 1 / Tab 2 ports can be validated against
them.**

> **Caveat on the trim-parity heuristic (do not use it as a provenance test).** The stored `.timing`
> in `k_sta` is `btiming` assigned *before* `TDdeconvStack` is called; MATLAB passes it by value, so
> the internal `if mod(k,2)` trim mutates only the function-local copy and never the stored array.
> Stored-timing parity is therefore the *pre-trim* length and is arbitrary (measured split: ODD=32,
> EVEN=33 across kernel regions) — an odd stored length does **not** indicate a pre-trim file. The
> trim itself is not observable from the stored outputs (it only shifts which samples `deconvreg`
> sees and the phase alignment); nothing in the data contradicts it, and all kernel/STA arithmetic
> matches the current code. **Implication for the JS port:** the CSV/exported `timing` the tool
> ingests is pre-trim, so the loader must apply the `mod(k,2)` trim to its own working copy before
> deconvolution — exactly as ADR-0009 already specifies.

## ⏸ In progress — RESUME HERE (tab1-validation)

> Session-pause capture. The branch `tab1-validation` carries the validation CODE; canon stays on
> `master`. Branch state at pause: signal-contract struct rename (`samples`/`zeroIndex`/`dt`/`times`)
> and the **binned-count rasterizer** (exact MATLAB `hist(spikes, timing)`) are committed and green
> (`test:core` 30/30). The decision below is the live thread.

### DECISION IN PROGRESS — binned-count below-first-spike regime (default settled, implementation NOT started)

**What it is.** `rasterizeBinnedCount` reproduces MATLAB `hist(spikes, timing)`. A spike *before the
first frame time* currently lands in **bin 0** (the open −∞ tail) — hist-faithful. This **differs**
from the snap path, which drops below-first spikes. That asymmetry is what this decision resolves.

**Key realization (preserve this).** In the MATLAB reference, below-first spikes are **impossible by
construction, not by a filter.** The driver (`aCa98_batch_APs`) builds each region's window as
`first_sample = find(fluo_time < first_spike, 1, "last") - buffer` (~10 samples / ~1 s pre-spike
pad), so the regional `timing` always starts ~1 s **before** the first spike. The reference "drops"
below-first spikes only in the sense that its buffered windowing guarantees none exist. The tool's
`t0 = times[0]` is therefore the start of the **user-supplied window** (analogous to `btiming(1)`),
**not** the recording origin.

**v1 / v2 scope (preserve this).**
- **v1:** the user feeds data already chopped to their window (or the whole trace). The tool builds
  **no** buffered window — it bins against the loaded `times` as-is, `t0 = times[0]`. **Below-first
  spikes ARE possible in v1** (a user window may clip a spike train; no buffer convention to lean on).
- **v2 (future, do not build):** optionally let users set region(s) within a longer trace; the
  validation path then constructs the driver-style buffered window (`first_spike − buffer`), which
  makes below-first spikes vanish naturally — the proper fix.

**The decision (default agreed; implementation paused).** binned-count gets a **caller-selected
flag** for the below-first cell:
- **teaching / default = KEEP** below-first spikes (hist-faithful, visible in bin 0) — dropping data
  should be a deliberate choice, never silent, and teaching benefits from showing spikes that fell
  outside the window.
- **validation opt-in = DROP** below-first spikes — matches the reference pipeline's effective input
  (which had none, due to its buffer).
- **Why both:** binned-count serves two masters. Validation wants pipeline-faithfulness (drop);
  teaching wants hist-faithfulness + visibility (keep). Same cell, opposite correct answers → a flag,
  not a fixed rule.
- **Framing to keep:** the drop-below-first flag is a **v1 stand-in for the v2 buffered-window
  approach.** v1 can't build the pre-spike buffer (no region-setting yet), so the flag drops
  below-first explicitly; in v2 the buffered window does the job and the flag becomes redundant on the
  validation path.

**NOT YET DECIDED / next steps (the resume point):**
1. Implementation **not started.** When resumed: author a proper ADR once confirmed (title candidate:
   *"binned-count below-first regime: teaching-keep default, validation-drop opt-in; v1 stand-in for
   v2 buffered window"*), then implement the flag + below-first tests on `tab1-validation`.
2. The flag's **exact name/signature is unspecified** — caller-selected, **defaulting to keep**.
3. Only then proceed to the reconstruction harness and the dt-only warn-UI.

### Broader tab1-validation queue (still pending on the branch)

- **antialias accumulator** — still stubbed (ADR-0001 planned).
- **Fixture-backed reconstruction harness** — **gated on an UNDECIDED choice**: the machinery-check
  reference. Synthetic `spike ⊗ kernel` (known expected output) vs a hand-picked coupled ROI from a
  `/APs` fixture. Per ADR-0011, machinery is gated / fit is only reported — so the gate needs a
  known-output reference, which is the open pick.
- **dt-only divergence warn-UI** — on the load path (ADR-0012): accept nominal-`dt`-only input but
  warn that uniform-`dt` reconstruction can diverge from the spike clock over long recordings.

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
- **Signal contract settled** ([ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md),
  `FOUNDATIONS.md` §13) — `Signal = { samples, dt, zeroIndex }`, explicit origin (never re-infer
  the center), symmetric retained-lag kernels (`zeroIndex = window_samples`), STA sharing the t=0
  reference. Three pipeline-fidelity facts pinned from the MATLAB source (now including
  `spikeTriggeredAverage.m`): binned-count on the validation path; even-length trim mirrors the
  *executed* `if mod(k,2)` code (drop when k odd → even, not the comment's "when even"); STA uses a
  **different effective spike set** than deconv (overlap rejection `block = 0.5*window`, skip
  first/last event, 0.1 s match tolerance) — do not share one spike set between methods.

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
- **[ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md)** — centered symmetric lag with explicit zero-index (the in-memory signal contract).
- **[ADR-0010](docs/adr/0010-idealized-recovered-kernel-open-family-toggle.md)** — idealized-recovered kernel is an open family toggle (any chosen family can stand in for a recovered kernel).
- **[ADR-0011](docs/adr/0011-validation-gates-machinery-not-fit.md)** — validation gates machinery (pass/fail), only reports fit (per-ROI R²/residual); low fit on an uncoupled ROI is a correct verdict, not a failure.
- **[ADR-0012](docs/adr/0012-timing-vector-authoritative-dt-derived.md)** — timing vector is authoritative when present; `dt` is a derived fallback (`mean(diff(times))`). Nominal-`dt`-only is accepted with a divergence warning. Refines the §13 contract.

Reference: **[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)** — the validated MATLAB source-of-truth for Tab 2 (verified verbatim).

## Branch workflow (Tab 1 validation phase)

- **Canon → `master`.** FOUNDATIONS edits, ADRs, the ADR README index, and NEXT_SESSION live on
  `master` only — the source of truth must never be trapped behind, or diverge from, a feature branch.
- **Validation CODE → `tab1-validation`.** The binned-count rasterizer (currently a throwing stub),
  the `{values, originOffset}` → `{samples, dt, zeroIndex}` struct rename, and the fixture-backed
  reconstruction harness land on `tab1-validation`, which is rebased onto `master` as canon advances
  and merges back as one coherent change when the reconstruction check passes.

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
