Project started: 1:30pm, June 21 2026.

# NEXT_SESSION

> Immediate working state and next actions.
> **First action of any session: read `FOUNDATIONS.md`** (canonical source of truth).

---

## ⚠ CRITICAL — READ FIRST (2026-06-23, surfaced during stage-2 Tab 2 UI eyeball)

**The Tab 2 JS recovery (`src/lib/core/deconvolve.js`) has a bug. Diagnose it BEFORE any
more Tab 2 UI work.** Found by comparing the UI's recovered kernel against the lab `.mat`
ground truth — exactly the cross-method check the graphical-confirmation rule exists to force.

**The symptom (file 80, region 1, ROI 1):**
- JS recovery **disagrees with the lab `deconvreg` kernel**: Pearson **corr = −0.74** across *all*
  λ {0.002…3.0} *and* an extended probe {10…10000}. Near sign-inverted: −0.74 ≈ −(this morning's
  reported **+0.82**). The JS kernel **dips negative exactly where the lab kernel peaks positive**.
- The **lab ROI-1 kernel is a real, clean transient**: peak **+0.0108 @ +0.6 s**, acausal pedestal
  −0.006. **ROI 1 HAS a kernel.** The JS path is missing / inverting it.
- **λ is the wrong knob and JS-λ ≠ lab-λ:** in the JS convention the penalty is `|S|² + λ·|Lap|²`;
  with ~140 spikes `|S|²` ~ thousands dwarfs `λ·|Lap|²` ≤ 48, so the entire slider range is
  *effectively unregularized*. The slider cannot reach the lab regime — do not chase λ.

**Record corrections (earlier conclusions now known WRONG):**
- **ROI 1 is NOT "decoupled / no clean kernel."** It is the cleanest, *coupled*, kernel-bearing cell
  (lab confirms), which *also* shows local decoupling events (790 s calcium-without-APs; gain change
  400–700 s). `FOUNDATIONS.md` §3 (line ~179) was always right; the darkroom "reads as no clean
  kernel" was a **λ=0.002-specific JS artifact, not the cell**.
- **The earlier "UI is faithful" call was self-consistency** (JS-UI == darkroom-JS), **NOT** agreement
  with the lab. Faithfulness must be checked vs the lab `.mat`, never vs prior JS runs.
- **Lab ground truth, all 9 ROIs:** clean +0.6 s causal peaks in **ROI 1 (strong)** and **ROI 8
  (clean, small)** → the §4 non-targeted-kernel phenomenon **DOES** appear on file 80 (ROI 8
  candidate). The JS "all bowls / no non-targeted kernel" finding is unreliable (JS path is suspect).
- **STA is unaffected and trustworthy:** ROI 1 STA recovers the clean transient (0.0346 @ 0.8 s,
  acausalRatio 0.001) even at low λ — [ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md) cross-
  method partner earning its place on real data.

**[ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md) is REOPENED** (do not delete it;
add a status note). Its bowl conclusion isolated padding on a **periodic synthetic oracle** and
**never compared JS pow2-padding vs lab native-length deconv on real data** — the real-data JS↔lab
discrepancy was never tested there. The padding-delta result (B−A ≈ 0.0013) **stands as a delta**;
its *characterization of the real-data bowl* is now in question.

**NEXT ACTION (fresh session) — diagnose the recovery bug. Distinguish two suspects:**
- **(A) sign / convention error — PRIME SUSPECT** (near-perfect mirror image). Cheap test: take the
  existing JS ROI-1 kernel and re-check corr vs lab under {as-is, sign-flipped, lag-reversed about
  `zeroIndex`, both}. Audit `deconvolve.js` against
  [docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md) §3.1: which arg
  is image vs PSF in the commutativity trick, is `conj()` on the correct term, does the returned
  `zeroIndex` / lag direction match the lab `linspace(-5,5)`. **Run A first.**
- **(B) pow2 zero-padding.** Native-length (no-pad) recovery variant, re-check corr vs lab. If it
  flips to ~+0.8, padding is confirmed (and ADR-0017 needs revision).
- Throwaway variants in gitignored `darkroom/`; **do not touch shipping core until the cause is known.**
- Repro: `node darkroom/diag_lambda_sweep.mjs && darkroom/venv/bin/python darkroom/roi1_lambda_sweep.py`
  (sweep table + corr-vs-lab + overlay `darkroom/roi1_lambda_sweep.png`).

**Stage-2 UI is fine; the bug is in the recovery math, not the wiring.** Branch `tab2-ui`,
**NOT committed** (left uncommitted pending this diagnosis). Layout works and is eyeball-verified:
sticky targeted col 1, horizontal scroll, shared-y kernels/STA, live λ + noise sliders. **Stage 3 is
BLOCKED behind the recovery fix** (four-check readout, score_K/score_S, contact-sheet sort, log-λ,
recompute-on-release). Deferred (not blockers): default-λ reconsideration (ADR-0004 follow-up) is moot
until the convention is fixed; STA shared-y dwarfing on multi-ROI (stage-3 presentation); show-noisy-
trace option (stage-3).

---

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
  confidence to port the MATLAB pipeline. **⚠ SUPERSEDED (see CRITICAL banner): the SHIPPING
  `deconvolve.js` does NOT match the lab — corr −0.74 (near sign-inverted) at every λ. That morning
  re-derivation used a different convention than what shipped; the discrepancy is the next-session bug.**
- **ADR-0005 / STA** — `spikeTriggeredAverage.m` ported to `src/lib/core/sta.js` (the §3 check-4
  cross-method leg); the non-visual Tab 2 core is now complete (all four checks backed).

### ⏸ RESUME HERE — diagnose the recovery bug (see ⚠ CRITICAL banner at the top)

> **The next action is the recovery-bug diagnosis in the ⚠ CRITICAL banner, NOT the Tab 2 UI.**
> The UI stage-1/2 are built and eyeball-verified on `tab2-ui` (uncommitted); the recovery *math*
> underneath is wrong (JS↔lab corr −0.74). Tab 2 UI stage 3 is blocked behind the fix. The
> non-visual spine below was "complete" only by self-consistency — the lab cross-check was not run
> until this session, and it failed. Read the banner first.

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

**STANDING RULE (this session): graphical confirmation of success, always.** The user (a
physiologist) confirms outputs are real physiology — clean calcium transient, fast rise + exp decay —
*by eye*; passing a numeric tolerance is not sufficient on its own. For any signal/physiology step,
render eyeball-verifiable figures alongside the numeric tests. Output to gitignored `darkroom/`
(real-data figures derive from unpublished recordings; a data-safe synthetic figure may go to
`docs/img/` only with explicit consent + a `docs/img/README.txt` entry). Pipeline:
`darkroom/figdata.mjs` (computes curves with the **actual JS core**) → `darkroom/figs.py` (matplotlib).

**Figures generated (in `darkroom/`, gitignored):** `fig_oracle.png` (planted vs recovered kernel
vs STA — recovered ≈ truth, peak +0.60 s, τ 2.73 s, acausal 4e-10 → physiology confirmed),
`fig_noise.png` (recovery holds 0–10× σ → decoupling, not noise), `fig_real_context.png` (file 80
ROI 1 trace + spikes — the §3 decoupling drawn: big calcium at ~790 s with no spikes; APs without
proportional calcium at 400–700 s), `fig_real_kernels.png` (all 9 ROIs read as *no clean kernel* —
correct verdict).

**⚠ REOPENED (see CRITICAL banner) — circular-deconv zero-padding artifact ([ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md)).**
> The block below is the state ADR-0017 was written in. It is now **partially superseded**: the
> padding-delta (B−A ≈ 0.0013) stands, but "the real-ROI-1 bowl is decoupling, not padding" is in
> doubt — that conclusion never compared JS pow2-padding against the lab native-length deconv, and the
> lab finds a clean ROI-1 kernel the JS path inverts (corr −0.74). Treat the rest of this block as
> historical until the recovery bug is diagnosed.
Four eyeball-confirmed experiments (figures in gitignored `darkroom/`:
`fig_padding_artifact_80.png`, `fig_pad_isolation_oracle.png`, `fig_ef_real_roi1.png`) settle it:
the zero-pad step's **isolated** contribution is negligible (oracle B−A = 0.0013, under the 0.02
gate, even with a 1.035 dF/F₀ end-step). The real-ROI-1 acausal bowl (≈0.30) is **genuine decoupling
(the correct §3 verdict) + Laplacian low-frequency blindness (§4)** — *not* padding, and not removed
by detrending. **No padding fix; no detrend/window in the recovery path.** Endpoint-anchored detrend
and windowing are harmful (C−A = 0.0155; D crushes peak 0.24→0.10); quiet-anchored baseline removal
(E/F) is harmless but display-only and requires BOTH mask gates (spike-freeness AND low variance —
spike-freeness alone selects the 790 s contaminant). The Laplacian low-freq blindness is a separate
open strand (future ADR), not this one. **Tab 2 UI presents raw recovered kernels — unblocked.**

**One decision still parked for the break (next session):**
1. Promote `fig_oracle.png` (synthetic, data-safe) to `docs/img/` as a permanent physiology
   benchmark? (needs consent + `docs/img/README.txt` entry, per repo-hygiene rule.) — Note the
   ADR-0017 figure set stays in gitignored `darkroom/`, deliberately *not* promoted.

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

- **`master` = `3c06baa`** (the `--no-ff` merge of `tab2-sta`) + NEXT_SESSION refreshes on top.
  Carries the full non-visual spine — struct rename, binned-count rasterizer, machinery harness,
  CSV loader, **and STA** — + ADR-0015/0016 + `scripts/mat2csv.py`. **87/87 `test:core`**, build
  clean (~49.7 KB gzip; papaparse/fft.js tree-shake out of the app bundle). Pushed, in sync with
  `origin/master`.
- **Branches cleaned: `master` only**, local and remote. Both feature branches (`tab2-sta`,
  `tab1-validation`) were fully merged and have been deleted locally; the stale `origin/tab1-validation`
  was deleted from the remote. No outstanding branch-hygiene items.
- **Scratch (gitignored, safe to leave for the break):** `darkroom/` figure pipeline + PNGs,
  `darkroom/venv` (matplotlib), `exports/APs_v1_20241004_80__region1.csv`, `data/*.mat`. Nothing
  data-derived is tracked.
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
- **[ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md)** — circular-deconv zero-padding needs no fix (isolated contribution ≤0.0013, under gate); detrend disposition is by anchor — endpoint-anchored / windowing harmful, quiet-anchored safe (display-only, both mask gates required). Real-data bowl is decoupling + Laplacian low-freq blindness, not padding. Refines ADR-0004.

Reference: **[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)** — the validated MATLAB source-of-truth for Tab 2 (verified verbatim).

## Branch workflow

- **Canon → `master`.** FOUNDATIONS edits, ADRs, the ADR README index, and NEXT_SESSION live on
  `master` only — the source of truth must never be trapped behind, or diverge from, a feature branch.
- **Code → a short-lived feature branch**, rebased onto `master` as canon advances and merged back
  via `--no-ff` as one coherent change when its tests pass. The validation/STA phase used
  `tab1-validation` then `tab2-sta`; both are now merged and deleted. The next code branch (Tab 2 UI)
  starts fresh from `master`.

## Where the code lives

- `src/lib/core/` — the reusable, framework-free spine + `core.test.mjs` (87 checks). Modules:
  `timebase`, `rasterize`, `kernels`, `convolve` (Tab 1); `noise`, `deconvolve`,
  `kernel-diagnostics`, `sta`, `load-csv` (Tab 2). All exported from `index.js`. Shared by every tab.
- `src/App.svelte` — Tab 1 UI; `src/lib/Plot.svelte` — uPlot wrapper (shared-axis + ±lag support).
- `vite.config.js` — `inject-csp-on-build` plugin. `scripts/screenshot.mjs` — visual check.
- `scripts/mat2csv.py` — offline `.mat`→CSV converter (run via `darkroom/venv/bin/python`).
- `darkroom/` (gitignored) — figure pipeline (`figdata.mjs` → `figs.py`) + the matplotlib venv.

> **Next action lives in "⏸ RESUME HERE" above** (the Tab 2 UI). Queued/parallel work — the Tab 1
> animation and the deferred core/UI items — is consolidated under "Still queued".

## Still open (not blockers)

- **Laplacian-prior low-frequency blindness** — the dominant term in the real-data acausal bowl
  ([ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md) isolated padding as negligible and
  scoped this out). A regularization-convention question (per ADR-0004); a future ADR if/when it's
  pursued. **Not a UI blocker** — the bowl is a correct §3 decoupling read, human-judged (ADR-0014).
- **Kernel global vs. tab-local detail** + the **per-tab disclosure layout** (§11.4).
