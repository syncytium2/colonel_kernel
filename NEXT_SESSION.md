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

## Resume state

**DECIDED & CANONIZED this session** (pointers, not restatement):
- **ADR-0013** binned-count `preFirstBin` — implemented + tested on `tab1-validation`
  (38/38 green), premise confirmed empirically in `FOUNDATIONS.md` §13.
- **ADR-0014** machinery-check metric — causal-lobe / peak-lag / τ / amplitude diagnostics,
  never raw whole-kernel correlation as headline; gate is human, math is guide.
- **FOUNDATIONS §3** — empirical decoupling finding (ROI 1 breaks one-to-one in both
  directions → no real-ROI kernel oracle → synthetic oracle).
- **FOUNDATIONS §4** — negative-lag refinement (genuine lead/lag vs regularization
  artifact; human judgment).
- Independent re-derivation matched lab `deconvreg` on ROI 1 (peak +0.6 s, within 17%) →
  confidence to port the MATLAB pipeline.

### ⏸ RESUME HERE — machinery-check harness, two open items

> **This is THE next-action authority — the live frontier.** The queued/parallel work
> listed under "Still queued" below is lower priority and is *not* the next action. If a
> later edit reintroduces a competing "next actions" list, this section wins.

1. **NOISE MODEL — hypothesis, NOT locked.** ROI 1 high-pass residual (2 s rolling-median
   removed, quiet regions, n=5799): additive white Gaussian, **σ ≈ 0.0035–0.004 dF/F₀**
   (three agreeing estimates; autocorr ≈ 0; skew 0.03, excess kurt 0.19), SNR ≈ 60 vs
   ~0.24 transient; weak second-order shot term (~12% at high signal). **GATE BEFORE
   LOCKING:** this is ONE ROI and the white-Gaussian call depends on the high-pass cutoff.
   Confirm σ and the white-Gaussian shape across **several ROIs and more than one recording**
   before the harness noise model is locked. (Figure `darkroom/roi1_noise.png` regenerated on
   the correct residual; verdict held.)

2. **HARNESS DESIGN — buildable once noise model confirmed.** Synthetic reference =
   `spike ⊗ planted-kernel + AWGN` at known σ → recover → compare recovered to planted within
   noise-set tolerance (the oracle). Comparison metric per **ADR-0014** (causal lobe /
   peak-lag + τ + amplitude, human-judged — not whole-kernel corr). Planted-kernel shape should
   match the observed physiology (sharp onset lag 0, peak +0.6 s, τ ≈ 2.7 s).

### Still queued (lower priority / parallel — not the next action)

The single list of queued and parallel work. None of this is the live frontier (see
"⏸ RESUME HERE" above); these are picked up around or after the machinery-check harness.

- **tab1-validation items:** **dt-only divergence warn-UI** (ADR-0012),
  **antialias accumulator** (ADR-0001), **Tab 1 slide-and-multiply animation** (the deferred
  visual piece — the kernel panel up top is the reference shape that slides across the spike
  train; the math is already proven, so it's pure presentation and a good low-stakes parallel
  track).
- **Tab 2 (flagship) — the major build after the harness.** Regularized deconvolution
  ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)) + STA
  ([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)) + four-check goodness-of-fit +
  per-ROI. Heaviest piece; port against the MATLAB reference. The machinery-check harness
  above is the validation scaffolding this is built against.

### V2 (noted, not now)

Timing/regions tool — carve calcium + APs into treatment regions to test whether the kernel
changes across epochs. The "region definition changed" concern (clerical corrections to
temporal treatment-window boundaries in the data) is a **DATA-pipeline matter, NOT an
app-validation prerequisite** — the app validates fine on `.mat` files as-is. CSV conversion +
corrected timings run on a separate track.

### Repo state (end of session)

- **`master` = `64d2a34`, PUSHED and in sync with `origin/master`** (this NEXT_SESSION refresh
  sits on top, so the live tip is one commit ahead of the named hash). All commits are up
  (README+figure, FOUNDATIONS, ADR-0014, darkroom guard, data guard, the next-action-authority
  reconciliation). The README ROI-1 figure renders on GitHub (`docs/img/` resolves from the
  pushed tree).
- **Branch hygiene CLEARED — `tab1-validation` = `574ea31`** (preFirstBin impl, 38/38 green
  post-rebase), **rebased onto `64d2a34` and pushed** (`--force-with-lease`); local and
  `origin/tab1-validation` match. The preFirstBin code is no longer stranded local-only. No
  outstanding branch-hygiene items. (Branch is current and pushed only — **not** merged to
  master; that remains a separate decision.)
- `data/*.mat` and `darkroom/` gitignored; `docs/img/roi1_trace.png` intentionally tracked.
- **Snapshot caveat:** this block is a point-in-time record. Before acting on it, run
  `git fetch && git status` — the remote is the truth.

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

> **Next action lives in "⏸ RESUME HERE" above** (the machinery-check harness), with
> queued/parallel work — including the Tab 1 animation and Tab 2 — consolidated under
> "Still queued". The old ordered "Next actions" list that sat here was stale (it predated the
> harness work and competed with RESUME-HERE); its real items were folded into "Still queued."

## Still open (not blockers)

- **Deconvolution numerical route** — decide after a Tab 2 prototype (per ADR-0004).
- **Kernel global vs. tab-local detail** + the **per-tab disclosure layout** (§11.4).
- **CSV layout convention** (§10 item 6) — needs a real exported file to confirm against.
