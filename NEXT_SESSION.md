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
- **ADR-0005 / STA** — `spikeTriggeredAverage.m` ported to `src/lib/core/sta.js` (the §3 check-4
  cross-method leg); the non-visual Tab 2 core is now complete (all four checks backed).

### ⏸ RESUME HERE — Tab 2 UI (the non-visual spine is DONE and merged)

> **THE next-action authority — the live frontier.** The non-visual real-data spine is built,
> validated on real data, and **merged to `master` (`03f401f`)**. The frontier is now the **Tab 2
> UI**. Queued/parallel items are under "Still queued" below and are *not* the next action.

**DONE & merged — the non-visual spine is now COMPLETE (former items 1 & 2 + STA):**
- **Noise model — v1 settled** ([ADR-0015](docs/adr/0015-harness-noise-model.md)): AWGN, user slider
  0–10× cohort-typical σ (1× ≈ 0.0024 dF/F₀ from baseline regions; default 0/off, §11.2), from a
  39-recording recon. Richer model (region conditioning, σ-distribution, ~12% shot term,
  contamination test) → v2.
- **Machinery-check harness — DONE** (was item 2): synthetic oracle passes; regularized recovery
  ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)) + noise ([ADR-0015](docs/adr/0015-harness-noise-model.md))
  + diagnostics ([ADR-0014](docs/adr/0014-machinery-check-metric.md)). Recovery holds to 10× noise →
  real-ROI failure is **decoupling, not noise** (§3 thesis). `npm run machinery-check`.
- **Data path** ([ADR-0016](docs/adr/0016-csv-input-layout.md)): `scripts/mat2csv.py` (offline
  .mat→CSV) + `loadCsv` (CSV→signal contract). Verified end-to-end on real file 80; the decoupled
  ROI 1 correctly reads as *no clean kernel*.
- **STA — DONE** ([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)): `src/lib/core/sta.js`, a
  faithful port of `spikeTriggeredAverage.m` (overlap rejection `block = 0.5·window`, first/last-event
  skip, 0.1 s match tolerance, per-event baseline zeroing, omitnan averaging; §13 contract,
  `zeroIndex = windowSamples`). Cross-method test: a planted calcium kernel is recovered by STA with
  peak lag/amp agreeing with its diagnostics — the §3 check-4 leg now has its math.
- **All four §3 checks now have backing math**; spine modules in `src/lib/core/` (noise, deconvolve,
  kernel-diagnostics, sta, load-csv) exported from the barrel. **87/87 `test:core`**, build clean.

**LIVE — Tab 2 UI (the flagship front-end).** Wire the now-proven core into Svelte:
- file drop → `loadCsv` → per-ROI columns laid side by side, **column 1 highlighted** as the targeted
  cell (§4);
- per-ROI `recoverKernel` + the **four-check goodness-of-fit** readout (§3): kernel plausibility,
  reconstruction residual, stability, and STA cross-method agreement;
- **explicit regularization slider** ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)) + the
  **noise slider** ([ADR-0015](docs/adr/0015-harness-noise-model.md));
- kernel / STA plots with the **marked zero-lag line** (ADR-0004/0009).
- **STA is built** ([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md), `src/lib/core/sta.js`) —
  the cross-method-agreement leg now has its math; the UI wires `spikeTriggeredAverage` per ROI and
  reads it against `recoverKernel` (shared `zeroIndex = windowSamples` makes them comparable about
  zero). No remaining unbuilt core leg — the UI is pure wiring + presentation over a proven core.

### Still queued (lower priority / parallel — not the next action)

The single list of queued and parallel work. None of this is the live frontier (see
"⏸ RESUME HERE" above — the Tab 2 UI); these are picked up around or after it.

- **Deferred core/UI items:** **dt-only divergence warn-UI** ([ADR-0012](docs/adr/0012-timing-vector-authoritative-dt-derived.md)),
  **antialias accumulator** ([ADR-0001](docs/adr/0001-delta-rasterization.md)), **Tab 1
  slide-and-multiply animation** (the deferred visual piece — the kernel panel up top is the
  reference shape that slides across the spike train; the math is already proven, so it's pure
  presentation and a good low-stakes parallel track).

### V2 (noted, not now)

Timing/regions tool — carve calcium + APs into treatment regions to test whether the kernel
changes across epochs. The "region definition changed" concern (clerical corrections to
temporal treatment-window boundaries in the data) is a **DATA-pipeline matter, NOT an
app-validation prerequisite** — the app validates fine on `.mat` files as-is. CSV conversion +
corrected timings run on a separate track.

### Repo state (end of session)

- **`master` = `3c06baa`** (the `--no-ff` merge of `tab2-sta`), plus this NEXT_SESSION refresh on
  top. Carries the full non-visual spine — struct rename, binned-count rasterizer, machinery harness,
  CSV loader, **and STA** — + ADR-0015/0016 + `scripts/mat2csv.py`. **87/87 `test:core`**, build
  clean (~49.7 KB gzip; papaparse/fft.js tree-shake out of the app bundle). **Push after this
  commit.**
- **`tab2-sta` MERGED into `master`** (at `3c06baa`); its work is fully on master and the branch can
  be deleted or reused. `tab1-validation` was the prior merged branch (at `03f401f`). No outstanding
  branch-hygiene items.
- `data/*.mat`, `darkroom/`, and `exports/` gitignored; `docs/img/roi1_trace.png` intentionally
  tracked. `scripts/mat2csv.py` writes CSV to gitignored `exports/` (never commit data, §6).
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
