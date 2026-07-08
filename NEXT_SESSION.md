Project started: 1:30pm, June 21 2026.

# NEXT_SESSION

> Immediate working state and next actions.
> **First action of any session: read `FOUNDATIONS.md`** (canonical source of truth).

---

## ✅ DONE — dataset-summary pipeline (tracked) + full-dataset PDF + methods explainer (2026-07-08)
On branch **`region-window-arithmetic`** (depends on ADR-0035 windowing). The per-slice summary
prototype is now a **tracked, reusable pipeline** in **`scripts/dataset-summary/`** (see its README) —
promoted out of gitignored `darkroom/` so it survives. Generated outputs (PDFs, per-slice JSON) stay
in `darkroom/` (unpublished-data-derived).

- **Full-dataset PDF** (`darkroom/dataset_summary_full.pdf`, gitignored): **one page per slice, all 39
  goldens**, ordered by treatment (baseline → senktide → TTX → sb222200), each titled
  `Group <cohort> · <slice> · <treat>`. Per page: context strip (roi1 calcium + 1 s-binned APs + region
  windows/solution_delay) over per-region blocks of **top-4 kernel ROIs** (ROI 1 pinned first), each
  panel overlaying **free-vector / parametric / shaped + STA** at the fixed absolute dF/F₀ scale
  (constant-unitary-amplitude anchor; STA scaled-to-fit; auto-scale inset top-left).
- **Cohort/treatment + region timing from `indiegroups_db4.xlsx`** (`indiegroups` + `exp_timing`
  sheets): `batch_dump.mjs` reads db4 and **overrides the goldens' metadata region timing** so db4
  corrections apply on a re-dump without touching the shared-bus goldens. group_id = MALE/ORX/OVX/DI.
- **TTX-timing corrections** Tony made in db4 flowed through (110/190/287); 110 landed at TTX onset
  **27 min** after two db4 edits. Non-analyzable blocks now state the neutral fact — *"⟨region⟩ — N
  spikes in window — too few for kernel test"* (vs *"no ⟨kind⟩ region"* when truly absent) — no verdicts.
- **Methods explainer** (`darkroom/methods_explainer.pdf`, synthetic/data-safe): one-page, graphics-first
  "Four ways to ask if there is a calcium kernel" (free-vector / parametric / shaped / STA), colors +
  names matching the summary. Could be promoted to `docs/img/` as a tracked teaching asset if wanted.

**Which goldens have decent kernels (app-test cases):** file **80** roi1 (+0.6 s, gold standard) and
**240** roi1 are cleanest (`scan_kernels.mjs`). Memory: [[dataset-summary-feature]],
[[unitary-amplitude-fixed-scale]].

**▶ NEXT / still owed (unchanged):** (1) **MATLAB re-export** of the TTX-corrected goldens is the
canonical fix (our db4 override just unblocks the deadline); (2) **merge `region-window-arithmetic` →
master**; (3) **bus contract v1.1** write; (4) optionally canonize the fixed-absolute-scale principle
(extend ADR-0029) + promote the explainer to `docs/img/`.

---

## ✅ DONE — region protocol windowing (ADR-0035, 2026-07-06) + dataset-summary PROTOTYPE
On branch **`region-window-arithmetic`** (commit `206b1a8`; **NOT yet merged to master, now pushed to
origin**). Tony laid out the established region-windowing rule ("don't relitigate") and directed it into
v1 that day; built, figure-gated, committed.

**ADR-0035 — region protocol windowing (canon: ADR-0035 + FOUNDATIONS §5 + ADR README).**
The app now derives a per-region analysis window from the raw markers + region NAME, before the ±1 s
spike-bracket. **Supersedes the ADR-0019 §4 raw-windowing sentence** (raw markers still the emitted
contract):
- **baseline** (name has "baseline") → last MAX anchored at the period END `[end−MAX, end]`.
- **treatment** (any non-baseline, non-hiK switch — sb222200, senktide, wash …) → wash-in delayed start
  `+DELAY`, then up to MAX `[start+DELAY, min(end, start+DELAY+MAX)]`.
- **hiK** (name normalizes to "hik"/"highk") → entire period raw (acts fast, no delay/cap).
- **full** (synthetic "(full recording)"/"whole") → raw passthrough (Tab 1 handoff / CSV / file-80
  equivalence byte-identical).
Defaults **DELAY=2min / MIN=12min / MAX=20min**, **user-adjustable** in Tab 2's Advanced fold (3 number
fields, shown only with metadata regions). Never silently drops: sub-MIN durations flagged-but-kept;
only a treatment shorter than DELAY is non-analyzable. Opt-in via `windowRegion(rec, region,
{protocol:true, solutionDelayS, regionMinS, regionMaxS})`, default off (existing callers/tests
unchanged). Spike-trim buffer confirmed = 10 samples = 1 s (aCa98_batch_APs.m:33), already
`DEFAULT_BUFFER_S`. **test:core 217/217 (+15), build clean.** Figure-gated by Tony (golden 98 sb222200:
382 wash-in APs + 627 cap APs trimmed; multi-treatment file 211 confirms per-region independence).

**Dataset-summary PROTOTYPE (darkroom, gitignored — see memory `dataset-summary-feature`).** Toward an
in-app "quickly summarize a dataset" feature (Tony's stated goal). Per-slice page: context strip (roi1
calcium + 1 s-binned APs + region windows/solution_delay) over per-region blocks of top-4 kernel ROIs
(baseline + treatment reserved, hiK if present), each panel overlaying free/parametric/shaped + STA.
**Key resolved decision:** kernels at a FIXED absolute dF/F₀ scale anchored on the ~constant unitary-event
amplitude (memory `unitary-amplitude-fixed-scale`) — settles the ADR-0024/0029 scale-mode horizon;
STA scaled-to-fit as shape reference. ROI 1 pinned first per block, then top-3. Scripts:
`darkroom/{scan_kernels,dump_slice_page2}.mjs` + `fig_slice_page2.py`. Best app-test goldens: file **80**
roi1 (+0.6 s, gold standard) and **240** roi1.

**▶ NEXT (owed, in order):**
1. **Merge `region-window-arithmetic` → master** (figure-gated; Tony's go-ahead).
2. **Bus contract v1.1** — the cross-team clarification in Dropbox `team_colonel_kernel/contract/`
   (names are semantic; app owns windowing; NO golden re-emit). Drafted, not written — needs Tony's OK
   (touches the MATLAB team's channel). See `solution-delay-decision-pending` memory.
3. **Dataset-summary:** lock the format (near-final), then fork — batch static darkroom pages vs. scope
   the **in-app Summarize feature** (recommended; dissolves the 4-region squish via a responsive grid).
   Optional: canonize the fixed-absolute-scale principle (extend ADR-0029).

---

## ✅ DONE — shared 20/80 plot shell (both tabs) + Tab 1→Tab 2 handoff (ADR-0033/0034, 2026-07-03)
Unified both tabs onto one layout and closed the ground-truth loop. On branch **`tab-shared-layout`**
(not yet merged to master).

- **Shared shell (`Shell.svelte`, ADR-0033):** 20% tools rail + 80% plots; top row = summary panel
  beside a **square top-right kernel** (`aspect-ratio:1`); full-width co-registered time-course bands
  below. Content per-tab via rail/summary/kernelPanel/bands snippets. Readouts (not a time band) sit
  beside the kernel — a narrower band there would break §11.5 co-registration. Tab 1 gained the rail
  + went full-height; Tab 2 re-slotted (§3 checks rail→summary, kernel+STA Band C→square, recon+raster
  stay full-width). Shared nav-row width toggle (capped 1600px ↔ full-bleed). **Supersedes band
  arrangement of ADR-0026 + §3 placement of ADR-0028** (region model intact).
- **Tab 1 defaults:** 300 s / 10 Hz / seeded random 0.1 Hz Poisson spikes (+ "↻ random 0.1 Hz").
- **Tab 1→Tab 2 handoff (ADR-0034, realizes §11.3):** "Recover this in Tab 2 →" builds a CSV in memory
  (output.times + known spikes + measurement fluorescence) and loads it through Tab 2's existing
  `loadCsv` — one-shot (`handoff`/`onConsumed`). Verified headless: 0.0 fluorescence error, exact
  spikes, no warnings. Build clean, no unused selectors, `test:core` 202/202.
- **Design tool kept:** `docs/design/shared-layout-prototype.html` (+ artifact) for revisiting.

**Next:** merge `tab-shared-layout` → master when eyeballed; Tab 2 not yet visually confirmed with a
real recording (the handoff makes it testable from Tab 1). Open: Tab 3, chosen-kernel sharing (§11.4).

---

## ✅ DONE — Tab 1 kernel amplitude control (ADR-0032, 2026-07-03)
Added the **peak-height (dF/F₀) axis** the noise tool needed to matter. `buildKernel` gained a 4th
arg `amplitude` (default 1 → existing callers + peak-1 core tests byte-identical); it scales the
builders' peak-1 shape in the one place kernel height is set, so output / kernel plot / SNR all
inherit it. A single universal `kernelAmp` control (0.01–1 slider beside the shape params, **UI
default 0.1**) — not a per-kernel param, so it survives a shape switch. Opens Tab 1 where physiological
σ bites: peak 0.1 → 10× noise gives SNR ≈ 4 (visibly degraded) vs. SNR ≈ 42 at the old peak 1
(invisible). Realizes the "separate, user-set amplitude axis" ADR-0031 already named — no canon
change. `test:core` 202/202. **`tab1-noise` fast-forward merged to `master` and pushed** (carries
the ADR-0031 noise tool + this ADR-0032 amplitude control together).

---

## ✅ DONE — Tab 1 measurement-noise tool (ADR-0031, 2026-07-02)
Built the Tab 1 measurement-noise tool on branch **`tab1-noise`**. AWGN is injected on the
forward-convolution **output** (measurement noise on the synthesized dF/F₀ trace, σ in dF/F₀ per
ADR-0015), and the clean teal output + a faint noisy realization are **overlaid** in the existing
output band. Consumes the already-calibrated `noise.js` model unchanged — `noise.js` NOT touched.

### What landed
- **`src/App.svelte`** — `noiseLevel`/`noiseSeed` state; `sigma`/`noisyOut`/`signalPeak`/`snr`
  derived; a surfaced **"Measurement noise"** control (0–10× σ slider default 0/off, live
  `σ = _ dF/F₀`, `SNR ≈ _` = peak-of-clean/σ, seeded **Reseed** disabled at level 0); output band
  gains `ys2={noisyOut}` + `color2="var(--noise-trace)"` and a `{#key noisyOut != null}` remount
  (uPlot fixes series count at init, so the overlay must be present at mount — remounts only when
  crossing level 0; reseeds/in-range changes flow through `setData`). Caption on the output label
  when noise on.
- **`src/app.css`** — `--noise-trace` (muted slate-teal, precomputed 40% teal / 60% `--text` per
  theme, concrete rgb so it's canvas-safe; light `rgb(81,122,127)` / dark `rgb(110,161,162)`).
- **Canon** — **ADR-0031** (Accepted); ADR index row; FOUNDATIONS §7 + §11.2 one-line cross-refs.

### Verified (Playwright, figures in gitignored `darkroom/`)
- Level 0 = byte-for-byte today (no overlay, reseed disabled, SNR "clean"); Level 1 → σ 0.0024,
  overlay appears, SNR ≈ 803; reseed draws a different realization, same (level,seed) reproduces
  (deterministic); coupled drag-zoom from **either** band + double-click reset stay co-registered
  with the overlay on (ADR-0030); no console/page errors. `npm run build` clean, `test:core` 202/202.
- **Detour worth noting:** an early "output-band drag doesn't zoom" scare was a **test-harness
  artifact** — the new control field pushed the output band below the 900px Playwright viewport, so
  the synthetic drag landed off-screen. Confirmed identical on master; with a taller viewport the
  output-band drag fires `ZOOM` normally. Mobile horizontal plot-overflow at ≤720px is likewise
  **pre-existing on master** (uPlot plot sizing), not introduced here; the single-column layout
  itself collapses correctly.

### ▶ NEXT — figure-gate by Tony (ADR-0018)
The eyeball read is owed: confirm the faint overlay is legible in both themes and that the SNR
framing reads right (at 1× on the unit-amplitude teaching kernel the noise is honestly tiny — peak
≈ 2, so SNR ≈ 800; it becomes visible as the slider climbs). Screenshots in `darkroom/`
(`tab1_noise_level1.png`, `tab1_noise_level10_output.png`). Then merge `tab1-noise` → master.

---

## ✅ DONE — custom domain live; deploy docs corrected (2026-07-02)
`kernel.tonydefazio.com` is **wired and live** and the deploy doc now matches reality.

### 2026-07-02 session summary
- **Custom domain LIVE.** Added `kernel.tonydefazio.com` as a Custom Domain on the `colonel-kernel`
  Worker (Cloudflare dashboard). `tonydefazio.com`'s DNS is already a Cloudflare zone (nameservers
  `arya`/`clyde.ns.cloudflare.com`), so the Worker custom-domain feature created the proxied record +
  cert itself — **no Porkbun edit needed** (Workers custom domains require the zone on Cloudflare;
  unlike Pages you can't CNAME `workers.dev` from an external host — that requirement was already met).
- **Privacy ritual PASSED on the custom domain.** `kernel.tonydefazio.com` serves 200 over HTTPS with
  `connect-src 'none'; default-src 'self'` shipped in the HTML. DevTools Network reload: all app
  requests same-origin (document + `index-*.js` + `index-*.css` + `load-xlsx-*.js`). The lone
  non-same-origin entry (`credentials-library.js` / "LastPass for Safari") is the **browser extension**
  injecting a content script — not app egress. Re-run in a private window w/ extensions off for a
  spotless log; posture already confirmed.
- **`DEPLOY_CLOUDFLARE.md` rewritten to reality (`919b0a2`, `26a9dda`).** It described a Cloudflare
  **Pages** connect-to-Git auto-deploy; reality is a **Workers** assets-only deploy via `wrangler.jsonc`,
  run **manually** (`npm run build` + `npx wrangler deploy`). Fixed: real live URL, manual steps, the
  Porkbun-CNAME step removed (wrong for a Cloudflare-managed zone), handoff-file cruft dropped.
- **`.wrangler/` gitignored (`919b0a2`).** Wrangler local state/temp — was untracked + unignored.

---

## ✅ RESOLVED — canon↔code drift closed; method 3 merged to master (2026-07-01)
The ~36-commit drift is CLOSED. `method3-shaped` (method 3, cut from tab2-regions) was
reconciled and **`--no-ff` merged into master** (db65a11): 0 conflicts, `test:core` 202/202,
clean build. The merged code carries Tab 2 (regions, xlsx loader, methods 2/3, region-recovery)
and already reflects **ADR-0028** — regional-only kernels, zoom-driven region selection, **no
Mode toggle / no prev-next** (verified in `src/lib/Tab2.svelte:103`). master is the truth again
and origin/master is deployed live.

### 2026-07-01 session summary
- **Merge + deploy.** Merged `method3-shaped`; shipped to Cloudflare Workers (assets-only Worker
  serving `dist/`) live at **https://colonel-kernel.tonydefazio.workers.dev**. Privacy ritual
  passed — only same-origin requests, `connect-src 'none'` confirmed on the live site (incl. a
  WebKit check).
- **Deploy scaffolding.** `.nvmrc` (Node 22); `wrangler.jsonc` (Worker name `colonel-kernel`,
  `workers_dev`/`preview_urls` explicit); `wrangler` devDependency; MIT `LICENSE`; tightened
  `.gitignore` (all of `data/` except README — closed a raw-data leak gap where a CSV/JSON in
  `data/` was committable).
- **Tab 1 plotting.** (a) Co-registered the spike↔output bands (equal `padRight` + `syncKey` +
  `cursorPoints`) so a spike drops straight onto its response, with a shared hover crosshair;
  (b) fixed zoom uncoupling — zoom is now **parent-owned** (drag zooms both bands together,
  double-click restores, single-click inert), and uPlot's native per-plot zoom is disabled on
  non-zoomable plots so the lag band can't be knocked loose either. Verified in WebKit.
- **Canon.** **ADR-0030** + **FOUNDATIONS §11.5** — axis co-registration as a durable cross-tab
  invariant (x aligned pixel-for-pixel; a different timebase deliberately is not; y identical when
  reasonable, human-decided; zoom parent-owned, never per-plot).

---

## ▶ NEXT ACTIONS

- **Deploy model — decide (auto-deploy only; custom domain now DONE).** Deploys are still MANUAL
  (`npm run build` + `npx wrangler deploy`). Optional: connect the repo in Cloudflare (Workers & Pages
  → `colonel-kernel` → **Builds → Connect to Git**) so every push to `master` auto-builds + deploys.
  Weigh against the fact that WIP lands on `master` often — auto-deploy would want a `deploy` branch or
  a build gate first. (`kernel.tonydefazio.com` is now live — see the 2026-07-02 block above.)
- **xlsx / SheetJS advisory — needs a call.** `npm audit` flags a HIGH in `xlsx` (prototype pollution
  + ReDoS; **no upstream fix**). Only triggers on a maliciously-crafted spreadsheet, and researchers
  open their own files — but it deserves a deliberate decision: accept-and-document (its own ADR),
  sandbox/replace the parse, or pin/patch. Not yet recorded anywhere.
- **Before making the repo public:** `LICENSE` is in (MIT); do a final `git ls-files data/ darkroom/`
  (must be empty) per the repo-hygiene rule.
- **QA — figure-gate the file-98 3-region case.** ADR-0028 mode-removal is merged, but the
  3-region rendering still needs Tony's eyeball (figure gate, ADR-0018) — confirm regions shade/
  label correctly, kernel band shows regional-only, double-click zoom + current-region behave.
  **Not tonight; needs a look.**
- **Repo tidy (optional).** `darkroom/` accumulated scratch probe scripts + figures from the Tab 1
  debugging — all gitignored, nothing tracked. Clear anytime.

---

## 🔭 HORIZON — view-zoom vs sub-window recovery → see [ADR-0027](docs/adr/0027-subwindow-recovery-region-view-mode.md)

The old over-broad fence here (all sub-window recovery = future V2) is **superseded by
[ADR-0027](docs/adr/0027-subwindow-recovery-region-view-mode.md)**: view-zoom stays view-only, but
**sub-window recovery is a first-class scientific operation** (§4) with a region view mode. Read the ADR.

---

## 🔭 HORIZON — method-1 bowl separability check (Konnerth backward-min) — darkroom-first, oracle-gated
**Sequenced BEHIND closing out method 3** (the reconciliation above + ADR-0023 graduation) — pick up
only once method 3 is fully landed. A DIFFERENT track from methods 2/3. Methods 2/3 buy a clean kernel
by foreclosing the bowl during recovery (parametric zeroes baseline by construction; method 3 hands
drift to a basis). Method 1 alone lets the raw bowl exist — diagnostically honest, but unreadable.
PROPOSAL: rehabilitate the raw method-1 kernel POST HOC — estimate the bowl as a lower-envelope via
Konnerth backward-minimum baseline correction (ref impl minBarF2.m, placed in repo MATLAB reference
dir), subtract, check whether the residual is the same +0.6 s kernel methods 2/3 show. The real
question this answers that 2/3 CANNOT: is the bowl ADDITIVELY SEPARABLE from the kernel? Methods 2/3
assume separability by construction and can't test it; method 1 + Konnerth can.

HAZARD: backward-min is a trough-hugging envelope — it can CARVE OUT a clean kernel from entangled
structure, manufacturing the separability it's meant to test (§4: negative-lag energy is sometimes
real lead/lag, sometimes artifact — human judgment; a min-envelope can't make that call and will eat
both). So:
- Oracle FIRST: plant known kernel + known bowl on the synthetic oracle, run Konnerth, subtract, check
  recovery vs planted truth. A clean file-80 result is uninterpretable WITHOUT the oracle as
  interpretive key (same lesson as the raw −0.74 correlation).
- Recalibrate t2/t4: minBarF2's values are recording-time-tuned for F₀ estimation; meaningless on the
  ±5 s lag axis. "Backward in time" has no physical meaning on a lag axis — it's borrowing the
  envelope-extraction MECHANISM, not the algorithm's semantics.
- DISPLAY-ONLY, raw kernel untouched, bowl stays visible (ADR-0017 quiet-anchored fence).
- If it passes the oracle → earns its OWN ADR (the "rehabilitate the raw kernel" track vs the "extract
  a clean kernel by construction" track). NOT part of ADR-0023, NOT on the method-3 graduation.

---

## 🔭 HORIZON — Tab 2 multi-trace overlay (all methods + STA on one lag axis) — scale-mode question is the real work, NOT the rendering
**Sequenced after the method-3 toggle wiring lands.** ADR-0021 names an up-to-4-traces-on-one-axis
need (free-vector + parametric + shaped + STA); the slice viewer deliberately shows ONE method at a
time. With 3 recovery methods now, the method-3 spread (coupled→converge, decoupled→diverge) is the
diagnostic — a one-at-a-time toggle HIDES exactly what method 3 exists to show, so the overlay is
worth building.

CAUTION — do not mistake "easy in the darkroom" for "solved": fig_method3_on80.png shows all four
traces legibly on one shared-y axis, but ONLY because matplotlib auto-scaled and file-80 ROI-1 happened
to have compatible amplitude ranges. That is the EASY case. The slice viewer shows one method at a time
BY DESIGN: ADR-0024 rejected twin-y (false-agreement hazard), and ADR-0029 built a four-way scale toggle
(shared-y / normalized / scale-to-kernels / scale-to-STA) precisely because NO single scaling is honest
across all cases. On a decoupled column, or one where STA and kernels live in different amplitude
regimes, four-on-one-axis either crushes a trace flat or visually IMPLIES agreement that isn't there —
the exact hazard ADR-0024 exists to prevent. The rendering is trivial (uPlot draws 4 series easily); the
unsolved design is WHICH of ADR-0029's four scale modes governs a 4-trace overlay on the cases that
aren't file-80 ROI-1. The darkroom figure is evidence the overlay is worth building, NOT evidence it's
already solved. Face the scale-mode question head-on; do not let "it looked easy in the darkroom" become
a reason to skip it. Collides with the existing ADR-0029 overlay-scale work on tab2-regions — coordinate,
don't duplicate.

---

## 🔭 HORIZON — longer-τ_decay oracle (the one stress ADR-0023's named hazard targets) — still unrun
**Sequenced after the method-3 toggle wiring lands.** ADR-0023's flagged follow-up: all method-3
evidence (oracle, noise sweep, file-80 graduation) plants τ_decay near 2.89 s. The structural
decay-tail-leakage argument predicts the drift⇄τ_decay confound is WORST at longer true τ_decay (longer
tail = more drift-like energy for the basis to absorb). A ~5–6 s τ_decay oracle was never run — it is the
single stress the named hazard most directly targets. Run it (extend the existing method-3 oracle
harness; plant τ_decay ~5–6 s, same 4 treatments, read whether basis/both still recover planted τ or
finally steal decay) BEFORE method 3 is relied on for long-decay indicators. Darkroom-first, figure-gated
(ADR-0018).

---

## 🔗 MATLAB ⇄ colonel_kernel data handoff — SHARED BUS
The data producer (MATLAB repo `interface2`) and this team coordinate via a shared
Dropbox folder both sides read/write: **`<Dropbox>/Richard DeFazio/team_colonel_kernel/`**
(read its `README.md` + `CHANGELOG.md` first). It holds the `.xlsx` input contract
mirror (`contract/`, canonical = our ADR-0019), a validation checklist, `golden/`
sample fixtures, and per-team status logs.
- **Producer status:** source archive repaired (72/72) and ready; was blocked on us.
- **Decisions — RESOLVED & LANDED:** clock-origin (**zero-based, one shared t=0 origin at
  experiment onset**) and spike semantics resolved in **ADR-0019, now authored AND committed to
  master (`c4b7909`)**; the **CONTRACT VERSION is frozen at 1.0** in the Dropbox mirror (stamped in
  `contract/export_contract.md`, `CHANGELOG.md`, and `status/app_team.md`). **The MATLAB exporter is
  unblocked** — build against v1.0.
- **Delivered by MATLAB (2026-06-25):** the v1.0 exporter `if2_export_workbook.m` (committed
  `ef3ac30`) + the **full 72/72 `.xlsx` batch**, integrity-checked, in the shared bus `golden/`. Our
  reader ingests them (see ▶ RESUME — 2026-06-25 below).

### ⚠ Region analysis-window arithmetic — UNRECONCILED CROSS-TEAM, needs shared-bus contract addition (NOT a colonel_kernel-only ADR)

**Symptom:** APs leak into post-switch windows (e.g. "APs in TTX") because no
`solution_delay` trim is applied.

**Diagnosis (both repos + bus searched, read-only, 2026-06-26):**
- The app brackets raw `[start_s, end_s]` + spike buffer (`windowRegion` /
  `load-xlsx.js`), NO `solution_delay`. This MATCHES current canon (ADR-0019 §4) and the
  FROZEN bus contract v1.0, which explicitly says "no `solution_delay` offset, include
  short regions (no skip), app owns all windowing." Golden fixtures encode this:
  SB222200 `start_s = 1200` (raw 20min×60, NOT 1320). So the leak is a contract
  OMISSION, not a bug against canon.
- Two DIFFERENT MATLAB rules exist, neither on the bus:
  - `aCa98_batch_APs.m` (recovery driver): +2min delay on treatments (baseline none),
    no cap, 5-min hard SKIP of short regions, no high-K+ exception.
  - `if2_region_windows.m` / MATLAB ADR-0005 (coordination pipeline, sce-detector
    branch): +2min delay, 20-min cap, 12-min floor-as-FLAG (never drops), high-K+
    raw exception (no delay/cap). Never brought to the shared bus.

**Resolution path:** this is a v1.0→v1.1 SHARED-BUS CONTRACT change, made WITH the MATLAB
lead (golden fixtures encode the current no-delay assumption and may need re-emit/
re-validation). Open scientific decisions for both teams: (a) adopt `solution_delay`
(leak says yes); (b) cap or no cap; (c) short-region skip vs flag; (d) high-K+
exception or treat-as-normal. Decide ONCE on the bus, then each repo's ADR references
it. Do not author a third divergent rule in colonel_kernel.

---

## ▶ RESUME — 2026-06-26 — Tab 2 became a live instrument (ADR-0026 layout + interaction)

This session turned the Tab 2 single-column slice viewer into a usable reading instrument: a
workflow-staged layout plus a linked cursor and view-only zoom. **Every piece was eyeball-confirmed by
Tony** (figure-gate, ADR-0018). The 2026-06-25 block below remains the build state this sits on.

### DONE THIS SESSION
- **ADR-0026 layout** (canon `81bc84f`; FOUNDATIONS §11.4 settled for Tab 2): workflow-staged **left
  rail** (~300px) holding file line + summary + Settings + a default-collapsed **Advanced** fold
  (λ/noise) + the **four §3 checks relocated** as a compact label:value readout ("numbers; figures are
  the instrument"); right column = **three co-equal-height plot bands** (278px each). **Spike raster
  promoted to first-class** — equal absolute height, filled bars (sparse-cell legible), pinned
  [0,maxCount] retained; retires the old ~62/38 consolidated panel.
- **recon↔raster x co-registration fixed**: the bands shared xRange + left gutter but not the right
  edge (uPlot reserves a right gutter only when an x-axis shows). Pinned a shared `padRight` so both
  data regions share identical edges (455/1575) — axes lock, not merely coincide.
- **Linked cursor** across the two recording-time bands (uPlot `cursor.sync`, matched on **DATA-x** not
  pixel). Kernel/STA band **excluded** (lag axis).
- **Cursor value-dots**: actual + predicted on recon, count on raster; **count=0 is NOT suppressed**
  (confirms genuine no-spike — the calcium-without-APs read). Kernel/STA excluded.
- **View-only x-zoom**: drag to zoom, **single-click to reset** to full (drag never resets — click/drag
  split on a shared 6px threshold). Synced across both recording-time bands; **x-only** (recon dF/F₀ and
  the raster's pinned count axis untouched); kernel/STA excluded.
- **New `Plot.svelte` props, all additive / defaults-off / Tab 1 untouched**: `fill`, `barSize`,
  `padRight`, `syncKey`, `cursorPoints`, `zoomable` + `onZoom`.
- **mat2csv legacy-CSV output stamped `__pre-adr0019`** (filename + `# RETIRED` first line + docstring) —
  footgun removed; xlsx (ADR-0019) is the contract.
- **165 `test:core` green throughout; build clean (no unused selectors).**

### PARKED / HORIZON
- **Zoom is view-only — canon boundary (`1b3cae2`).** The recovered kernel, STA, and §3 numbers are
  whole-recording properties and do NOT recompute on the zoomed window (verified byte-identical across
  zoom). **Windowed / per-epoch recovery** (a window-local kernel compared across epochs) is the
  **future V2 regions tool** (ADR-0019 region metadata enables it), a **future ADR** with a
  spike-sufficiency hazard — NOT a side-effect of zoom.
- **NEXT obvious step Tony reached for: REGIONS — scope UNDECIDED, decide fresh before building.** Split:
  (1) view regions as overlays, (2) navigate / zoom-to-region — both **view-only, small**; vs
  (3) **edit boundaries** — canon: a **data-pipeline matter, NOT the app** (fenced off); (4) per-region
  recovery — **that IS the windowed-recovery V2 tool** above.
- **§3 checks can fall just below the fold** on the 300px rail (`overflow:auto`) — a rail-density tweak,
  not a blocker.
- **Dev-server build-stamp idea**: print the commit hash in-page so a stale HMR server can't impersonate
  current code (it cost time this session). Cheap papercut fix.

### STILL PENDING (unchanged — owed their own focused passes, NOT done this session)
- **Canonize the file-80 cross-method spread** finding (col 1 only clean, **7/9 parametric railed**) as a
  §4 data point.
- The **792 s calcium-without-APs** and **1000 s spikes→calcium (+~0.6 s)** events are candidate **§4
  illustrations of the partial biconditional** — surfaced cleanly by the new cursor, **not yet canonized**.

### FRONTIER (unchanged)
**Method 3 (shape-regularized; ADR-0023 baseline fork still open)** + the **9-up re-fan** across-column
incidence view.

---

## ▶ RESUME — 2026-06-25 (late) — method 2 + the Tab 2 slice viewer built; method 3 is next

**The current frontier.** Method 2 (constrained-parametric) is implemented and the Tab 2 **single-
column slice viewer** is built end-to-end on `tab2-ui`. The reconciled ROI-1 read and all earlier
blocks below remain canon/history. **Method 3 (shape-regularized) is the next recovery method.**

### REPO STATE AT SESSION END (read first)
- **`master` = `d29c3cb`** — pushed, in sync with `origin/master`. Canon only: ADRs **0022** (no-AP
  policy), **0023** (method-3 baseline-strategy fork, *Proposed/open*), **0024** (kernel/STA overlay
  amplitude axis — shared-y default + normalized toggle, twin-y rejected), **0025** (Tab 2 indicator
  column + railed-fit display — facts-not-verdicts), plus the §5 zero-based fix, the symmetric
  `round(1.0/dt)` bracket folded into ADR-0019, and FOUNDATIONS §2/§3/§5/§11 updates.
- **`tab2-ui` = `d523af2`** — the code branch, **force-pushed** (rebased onto master, so it diverged
  from the old `origin/tab2-ui`; future pushes need `--force-with-lease`). **165/165 `test:core`**,
  build clean (SheetJS still code-split). Carries everything in DONE below.

### DONE THIS SESSION (all on `tab2-ui` unless noted)
- **ADR-0021 method 2 — constrained-parametric recovery, IMPLEMENTED** (`src/lib/core/deconvolve-parametric.js`):
  causal double-exponential `kernel(θ)=amp·(exp(−t/τd)−exp(−t/τr))`, anchored t=0, zero baseline by
  construction; nonlinear LSQ (Levenberg–Marquardt). Returns the ADR-0009 contract. **file-80 ROI-1
  (Tony-confirmed, ADR-0018):** peak **+0.63 s**, **τ_decay 2.89 s** (the "n/a (tilt)" symptom is
  dissolved), τ_rise 0.23 s. Canonized in FOUNDATIONS §3.
- **Option B** — parametric reconstruction uses the FULL analytic kernel (~5·τ_decay), not the ±5 s
  display slice, so the tail isn't clipped (`doubleExpCausalFull`, `reconstructParametric`). ROI-1
  reconstruction R² −0.062 → **−0.030** (the residual is honest decoupling, not clipping).
- **Tab 2 SLICE VIEWER built** (`src/lib/Tab2.svelte`): column selector over all ROI columns (col 1 =
  target, §4); **both recovery methods** reachable (free-vector / parametric toggle); the four §3
  checks per method; **ADR-0024** overlay amplitude toggle (shared-y default + normalized, unmissably
  badged, kernel peak amp numeric in both modes); **ADR-0025** indicator strip (τ-railed,
  peak-at-boundary — neutral facts), railed-parametric output **default-hidden + reversible "show
  anyways"**, free-vector never auto-flagged.
- **Consolidated data panel**: ONE calcium trace serving both the actual-vs-predicted reconstruction
  (upper ~2/3, shared dF/F₀ y) AND coupling context for a **tunable-window spike histogram** (lower
  ~1/3, own count y, pinned axis so empty AP stretches stay visible). Window range dt→5 s, default
  1 s; at the dt floor the band **is** the §13 recovery input. Display re-bin (`rebinCounts`) **never
  feeds recovery** (purity test green). Rotated y-axis titles (`Plot.svelte` `yLabel`).
- **New tested core helpers** (`src/lib/core/readout.js`, all pure/framework-free): `tauRailed`,
  `peakAtBoundary`, `normalizeUnitPeak`, `rebinCounts`; `PARAM_BOUNDS` exported from
  deconvolve-parametric.js. (+34 `test:core` checks across the session, 131→165.)
- **9-column re-fan RECON (read-only, Tony-confirmed)** — `darkroom/fig_refan_file80.{mjs,py}` +
  `_table.csv`: 9/9 columns analyzable, 0 ADR-0022 skips (140 spikes shared). Surfaced free-vector +
  parametric + STA per column, cross-method spread, baseline-tilt indicator. **7/9 parametric fits
  railed** (τ at bound — the ADR-0021 loud-failure), several free-vector kernels boundary-peaked. No
  verdicts asserted (ADR-0018). This was the evidence behind ADR-0024 and ADR-0025.

### ▶ LIVE TASK NEXT SESSION — method 3 (shape-regularized, ADR-0021) + the 9-up view
1. **Shape-regularized recovery** — keep the Laplacian smoothness term; **add baseline-flatness +
   acausal-energy** lag-localized terms. **Highest-scrutiny method** (ADR-0021 epistemic-risk note).
   **Baseline strategy is an OPEN fork — see ADR-0023 (Proposed):** (a) baseline-flatness *penalty*
   vs (b) MLspike-flavored baseline-drift *nuisance basis*; the identifiability risk (drift ⇄ long
   τ_decay) is the central caution. **Decide ADR-0023 deliberately before/while building method 3.**
2. **9-up small-multiples view** — the re-fan recon is read-confirmed; promote it from a darkroom
   figure to an in-app multi-column view (the slice viewer is per-column; this is the across-column
   incidence sweep). Unblocked: methods + no-AP policy (ADR-0022) are canon.

### CANON STATUS (the "needs canonizing" items from the earlier block are DONE)
- ✅ No-AP policy → **ADR-0022** (Accepted). ✅ Window bracket → folded into **ADR-0019 §4**
  (symmetric `round(1.0/dt)`). ✅ Overlay shared-y/twin-y → **ADR-0024** (resolved; MATLAB-figure
  check dropped as prerequisite). ✅ Indicator/railed display → **ADR-0025**.

### DEPENDENT / DOWNSTREAM (still open)
- **Up-to-4-traces-on-one-axis** — ADR-0021 names it; the slice viewer shows ONE method's kernel + STA
  at a time (method toggle), NOT both kernels at once. Surfacing all three recovered kernels + STA on
  one lag axis is the unresolved design problem.
- **Tab 1 vs Tab 2 spike representation differ** (flagged, not resolved): Tab 1 spike row = snap+unit
  (height always 1, ADR-0001 teaching default); Tab 2 = binned-count (height = count, §13 validation).
  Deliberate-distinction question for Tony to rule on.
- Blank STA **"peak ___ s"** field; broader **UI-issues bucket**.

### PARKED (unchanged)
- **Folder move `golden/` → `data/`** (MATLAB-coordinated, prompt drafted not sent); keep the 4
  acceptance fixtures (80/98/13/250) as a named hashed subset.
- **Long-parked:** `fig_oracle.png` → `docs/img/` (consent + README entry); **dt-only divergence
  warning UI** (ADR-0012); **Savitzky–Golay baseline-independent display** idea (n/a-tilt symptom;
  now also relevant to ADR-0023's display-only baseline strand).

---

## ▶ RESUME — 2026-06-25 (HISTORY — ADR-0021 landed; superseded by the late-2026-06-25 block above)

**The frontier at the time.** The reconciled ROI-1 read (✓ RECONCILED banner) and the 2026-06-23 block
below remain canon/history; this is the build state on top of them.

### DONE THIS SESSION
- **ADR-0019 xlsx ingest spine — built + pushed on `tab2-ui`.** `loadWorkbook` (3-sheet read,
  case-insensitive match, machinery-gated), `windowRegion` (analysis-time spike-bracketing),
  `regionsOf` (default full-trace region), code-split SheetJS (own chunk ~114 KB gzip, base bundle
  unaffected). Commits `370425a` (spine) + `8f22324` (a11y fix). 118 `test:core` green; 3 real
  goldens validated by `npm run xlsx-acceptance` (offline; goldens stay out of the repo, §6).
- **ADR-0020 — committed on `master` (`19d6634`):** region-end markers emitted raw, finite overhang
  past `tEnd` not clamped. Accepted (core contract).
- **`.xlsx` drop seam WIRED to the single-ROI readout** — first-analyzable-region default;
  `regionViewToLoadedRegion` adapter feeds the existing readout unchanged. **Verified against the
  file-80 golden: xlsx path reproduces the CSV-path canon** — peak **+0.60 s**, baseline-relative amp
  **+0.0096**, kernel Pearson **0.99995** vs the CSV path. **123 `test:core` green.** Figure read
  **CONFIRMED by Tony (ADR-0018)** — the +0.6 s peak is present under the known baseline tilt, matches
  the CSV-path positive control. **Committed on `tab2-ui` (`34110f1`).** Evidence (gitignored):
  `darkroom/fig_xlsx_file80_roi1.png` + `darkroom/xlsx_equiv_file80.mjs`.
- **MATLAB batch:** 72/72 workbooks exported + integrity-checked in the shared bus;
  `if2_export_workbook.m` committed (`ef3ac30`).
- **ADR-0021 — committed on `master` (`cba7140`, Accepted):** kernel recovery as **three parallel
  methods** (free-vector / constrained-parametric / shape-regularized), spread-is-diagnostic;
  canonizes the *design* only (implementation incremental). README row + FOUNDATIONS §2 cross-ref.

### ▶ LIVE TASK NEXT SESSION — implement the three-method recovery (ADR-0021)
ADR-0021 is **canon (`cba7140`, Accepted — design decided, implementation incremental).**
Implementation is the work, **in order**:
1. **Constrained-parametric** — double-exponential (`τ_rise` / `τ_decay` / amp), **anchored t=0, zero
   baseline by construction**; nonlinear LSQ fit of `density ⊗ kernel(θ)` to the trace over θ.
   Returns the ADR-0009 `{samples, zeroIndex, dt, times}` contract. **Eyeball-verify against file-80
   ROI-1 (ADR-0018) before proceeding** — expect decay τ to become a **real number** (dissolves
   "n/a (tilt)") and a reconstruction that **doesn't carry the bowl**.
2. **Shape-regularized** — keep the Laplacian smoothness term; **add baseline-flatness +
   acausal-energy** terms. **Highest-scrutiny method** per the ADR-0021 epistemic-risk note.

Free-vector (method 1) is **already done; never discarded.**

### ALSO NEEDS CANONIZING (before / around the implementation)
- **No-AP policy → its own ADR** (candidate, not written). Flag-on-read; **batch-skip**; user-selected
  single-file → *"no APs in this recording — deconvolution not possible."* Covers the **33 silent-cell
  files + 22 partial** (per-region `zeroSpkRegions`, `golden/_batch_summary_v1.csv`).
- **Window bracket → fold into ADR-0019 or a short follow-up ADR.** Symmetric `round(1.0/dt)` bracket
  is **authoritative** (Tony's call 2026-06-25; MATLAB's incidental +1 tail not reproduced — file-80
  corr 0.99995, peak lag identical). **Decided, not yet canonized.**

### DEPENDENT / DOWNSTREAM
- **9-column re-fan** (the incidence sweep) — **gated on** the methods + the no-AP policy being canon.
- **UI:** ADR-0021 creates the **up-to-4-traces-on-one-axis** problem; the kernel/STA overlay
  **amplitude-axis mode is now RESOLVED — shared-y default + normalized-overlay toggle, twin-y rejected
  ([ADR-0024](docs/adr/0024-kernel-sta-overlay-display-mode.md))**; the blank STA **"peak ___ s"**
  field; a broader **UI-issues bucket**.

### PARKED
- **Folder move `golden/` → `data/`** (MATLAB-coordinated, prompt drafted not sent) — move the 72-file
  export to `data/`; keep the **4 acceptance fixtures (80 / 98 / 13 / 250)** as a named, hashed subset
  the `xlsx-acceptance` script binds to by name. App-side trivial (`GOLDEN_DIR` default + 4 paths).
- **FOUNDATIONS §5 "absolute recording time"** stale wording (flagged `bfc9774`, standalone fix).
- **Long-parked:** `fig_oracle.png` → `docs/img/` (consent + README entry); **dt-only divergence
  warning UI** (ADR-0012); **Savitzky–Golay baseline-independent display** idea (motivated by the
  n/a-tilt symptom).

---

## ▶ RESUME — 2026-06-23 (HISTORY — Tab 2 single-ROI slice; superseded by 2026-06-25 above)

**Build state at the time** (the reconciled ROI-1 read below is canon; this records how the
single-ROI readout reached the state the 2026-06-25 block builds on).

**DONE — single-ROI Tab 2 readout, built + eyeball-verified on file 80 ROI 1, committed on
`tab2-ui` (`9f39837`; NOT pushed, NOT merged to master):**
- Four §3 checks as four separate raw-number readouts (no rollup; ADR-0011 fit-reported):
  plausibility (`kernelDiagnostics`), reconstruction residual, λ-stability, STA agreement.
- Recovered kernel + STA overlaid on ONE shared lag/amplitude zero-lag origin (geometry matches the
  MATLAB figure).
- **Full-width reconstruction overlay** (predicted = density ⊛ recovered kernel vs actual dF/F₀):
  it **visibly breaks at the ~790 s calcium-without-spikes event** — the §3 decoupling *drawn* — while
  tracking elsewhere. Machinery sanity: full-latent reconstruction R² = 1.000 (forward path inverts
  exactly); the retained-±5 s-kernel R² = −1.05 is the reported §3 fit, not a bug.
- log-λ slider over the canon sweep 0.002–3 (was a 0–0.02 linear slider that couldn't reach it).
  Drop region collapses to a compact strip once loaded (whole-tab drop-sensitivity retained).
  87/87 `test:core`, build clean.
- Evidence (gitignored): `darkroom/fig_roi1_readout.{mjs,py,json,png}` — the readout + the JS-vs-lab
  canon panel (corr −0.7428 / +0.8415).

**RESUME HERE (next slice): RE-FAN the readout across all 9 ROI columns** — repetition of the
verified single-ROI card across columns (column 1 highlighted, §4 strip), not new analysis.

**THREE FINDINGS TO CANONIZE — do these FIRST next session, BEFORE the re-fan:**
- **(a) Baseline-relative peak-amp convention.** Reported peak amplitude = peak minus the mean over
  the [−0.5, 0) s pre-zero-lag window (matches STA's STAbasewin). **DISPLAY-ONLY**; the raw kernel
  trace is untouched (ADR-0017). Implemented as `preZeroBaselineMean` (core, additive helper).
  **Candidate ADR.** ROI 1: amp vs baseline **+0.0096** vs lab **+0.0108** (~11%).
- **(b) FOUNDATIONS §3 ROI-1 positive control gains an AMPLITUDE leg.** Recovery amplitude
  (baseline-relative) lands within **~11%** of the lab kernel amplitude — a third leg alongside the
  existing **peak-lag (+0.6 s)** and **λ-stability** legs.
- **(c) Attach to the PARKED Savitzky–Golay item:** decay **τ is unfittable under the baseline tilt**
  (shown as "n/a (tilt)") is the concrete motivating symptom for the parked baseline-independent /
  first-derivative display idea (never in the recovery path).

**STILL OPEN (unchanged):**
- Kernel/STA overlay **shared-y vs twin-y** — **RESOLVED ([ADR-0024](docs/adr/0024-kernel-sta-overlay-display-mode.md)):**
  shared-y default + normalized-overlay toggle, twin-y rejected (false-agreement risk). Decided from
  the re-fan magnitude-gap evidence + the false-agreement argument; **the MATLAB-figure check is no
  longer a prerequisite.**
- Long-parked (not commitments): promote `fig_oracle.png` → `docs/img/` (consent + README entry);
  the Savitzky–Golay / first-derivative baseline-independent display idea (see (c)).

---

## ✓ RECONCILED — 2026-06-23 (Tab 2 ROI 1 recovery read; figure-gated)

This replaces the earlier "⚠ CRITICAL — recovery bug / sign-inverted, diagnose first" banner
(commit `c380995`), which was the **WRONG diagnosis**. Canon (FOUNDATIONS §3, ADR-0017) now
reflects the reconciled read below. Evidence figures are stored local-only at
`darkroom/decisions/` (gitignored; derive from unpublished file 80 ROI 1) — read the figures
before acting on any number here.

**TWO AGREED FIGURE READS** (figure-gate policy — the human eye is the instrument; see below):

- **(a)** ROI 1 recovered kernel = a **+0.6 s kernel feature riding a large tilted baseline.**
  Kernel present; baseline corrupted. **NOT sign-inverted.**
  [`darkroom/decisions/2026-06-23_roi1_kernel_on_baseline.png`]
- **(b)** JS-recovered vs lab kernel, file 80 ROI 1, λ = 0.002: **Pearson corr = −0.7428 over
  full ±5 s, but +0.8415 in the ±1 s peak window.** The two methods **AGREE at the +0.6 s peak**;
  they disagree on the **slow baseline, which has opposite tilt.** The −0.74 is a whole-window
  statistic dominated by the baselines.
  [`darkroom/decisions/2026-06-23_js_vs_lab_roi1.png`]
- **Caveat on (a)/(b):** the JS trace's GLOBAL max is at **−4.90 s** (baseline edge), not +0.6 s;
  the +0.6 s kernel is a strong **LOCAL** feature on a tilted baseline.

**THE RECONCILED READ (now canon):** *"kernel recovered, agrees with lab at the +0.6 s peak
(+0.84 window); baseline tilt unsolved; −0.74 is a whole-window / baseline-dominated statistic, not
peak disagreement."* This is **neither extreme**: not c380995's "sign-inverted / inverts / misses the
kernel" (the **+0.8415 peak-window correlation disproves "inverts/misses"**), and not an unqualified
"two methods agree" (the whole-window −0.74 and the baseline tilt are real). The real **open problem
is the recovered-kernel BASELINE TILT** — not the kernel, and not a sign inversion.

**WHAT CHANGED IN CANON THIS COMMIT:**
- `c380995`'s "recovery bug / sign-inverted, diagnose first" banner is removed and superseded by
  this section. `c380995` is **kept in history; do NOT act on its diagnosis.**
- **FOUNDATIONS §3** — the ROI-1 positive-control language now carries the +0.84-window /
  −0.74-full distinction and the unsolved baseline-tilt caveat (no unqualified "two methods agree").
- **ADR-0017** is **NOT** reopened: the acausal-ratio bullet now states the kernel is recovered
  (agrees at the +0.6 s peak), with the negative-lag bowl attributed to Laplacian low-frequency
  blindness; the caveat distinguishes the positive-control regime from a fully-uncoupled ROI.
- **STA is unaffected and trustworthy:** ROI 1 STA recovers the clean transient (0.0346 @ 0.8 s,
  acausalRatio 0.001) — [ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md) cross-method
  partner earning its place on real data.

**STILL OPEN (the real next problem):** the recovered-kernel **baseline tilt** — a
regularization-side / display-characterization question, **not a recovery bug**. The original "stage 3
is blocked behind a recovery fix" premise is therefore **dissolved** (there is no recovery bug to
fix); how the baseline tilt is surfaced in the Tab 2 readout is a presentation question for Tony to
sequence, not a hard block. **PARKED (rabbit hole, not a commitment):** first-derivative /
Savitzky–Golay of the recovered kernel as a possible **baseline-independent** way to make the fast
+0.6 s onset pop above the slow tilt. **Display / detector idea only; never in the recovery path.**
Tony tried linear/poly detrend in MATLAB — both made it worse, which is why a subtraction-free
approach was raised.

**FIGURE-GATE POLICY (now [ADR-0018](docs/adr/0018-figure-gate-policy.md)):** for any claim whose
evidence is a figure, **Tony reads it first; Claude reconciles to that read and never lets a number or
a second opinion (incl. CC) overturn it.** A claim is "figure-based" even when no image is in front of
us if its truth lives in a plot. This session: a −0.74 correlation and a CC screenshot read both
pushed "broken recovery"; **Tony's eye (kernel present, bad baseline) was correct.** Operational
extension of [ADR-0014](docs/adr/0014-machinery-check-metric.md) (human gate).

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
- **FOUNDATIONS §3** — ROI 1 is the real-data positive control: a recoverable +0.6 s
  kernel that agrees with the lab `deconvreg` peak (+0.84 in the ±1 s window; the
  whole-window −0.74 is baseline-dominated, not peak disagreement; baseline tilt
  unsolved), alongside localized decoupling episodes (790 s calcium-without-APs;
  400–700 s gain change) that are measured, not treated as erasing the kernel. The
  synthetic oracle is the *machinery* oracle because ROI 1's *true* kernel is unknown
  (ground-truth availability), NOT because real ROIs lack a fixed kernel.
- **FOUNDATIONS §4** — negative-lag refinement (genuine lead/lag vs regularization
  artifact; human judgment).
- Independent re-derivation matched lab `deconvreg` on ROI 1 (peak +0.6 s, within 17%) →
  confidence to port the MATLAB pipeline. **CONFIRMED (see RECONCILED banner): the shipping
  `deconvolve.js` reproduces that +0.6 s peak and agrees with the lab there (+0.84 over the ±1 s
  window). The whole-window corr −0.74 is baseline-dominated, NOT a sign inversion — the earlier
  "sign-inverted bug" read (c380995) was wrong. Open item is the recovered-kernel baseline tilt.**
- **ADR-0005 / STA** — `spikeTriggeredAverage.m` ported to `src/lib/core/sta.js` (the §3 check-4
  cross-method leg); the non-visual Tab 2 core is now complete (all four checks backed).

### ⏸ Tab 2 UI history (single-ROI readout now BUILT — see ▶ RESUME at top)

> **There is no recovery bug.** The reconciliation (see banner) is done and is now canon: the kernel
> is recovered and agrees with the lab at the +0.6 s peak (+0.84 window); the −0.74 whole-window corr
> is baseline-dominated, not a sign inversion. The baseline tilt is now *surfaced* in the readout —
> via the baseline-relative peak-amp number and the reconstruction overlay — rather than left as an
> open presentation question (see ▶ RESUME at the top; finding (a)/(c)). The actionable next step is
> the column re-fan, not this block.

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
  .mat→CSV) + `loadCsv` (CSV→signal contract). Verified end-to-end on real file 80; ROI 1
  recovers its +0.6 s kernel (the §3 real-data positive control), riding a still-unsolved tilted
  baseline (see RECONCILED banner).
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
proportional calcium at 400–700 s), `fig_real_kernels.png` (per-ROI recovered kernels; ROI 1 shows
an explicit λ-stable +0.6 s kernel — the real-data positive control, agreeing with the lab
`deconvreg` peak — alongside its localized decoupling episodes; the remaining ROIs are read
per-column per §3, not asserted as a blanket "no kernel").

**✓ RESOLVED (see RECONCILED banner) — circular-deconv zero-padding artifact ([ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md)).**
> ADR-0017 is **not** reopened. The JS path does **not** invert the kernel: ROI 1's +0.6 s kernel is
> recovered and agrees with the lab at the peak (+0.84 over the ±1 s window; the whole-window −0.74 is
> baseline-dominated). The padding-delta (B−A ≈ 0.0013) stands; the negative-lag bowl is attributed to
> Laplacian low-frequency blindness, not padding. The remaining open item — the recovered-kernel
> baseline tilt — is tracked in the RECONCILED banner, not here.
Four eyeball-confirmed experiments (figures in gitignored `darkroom/`:
`fig_padding_artifact_80.png`, `fig_pad_isolation_oracle.png`, `fig_ef_real_roi1.png`) settle it:
the zero-pad step's **isolated** contribution is negligible (oracle B−A = 0.0013, under the 0.02
gate, even with a 1.035 dF/F₀ end-step). The real-ROI-1 acausal bowl (≈0.30) sits **beneath a
recovered +0.6 s kernel** (the §3 positive control) and is dominated by **Laplacian low-frequency
blindness (§4)**, with a localized ~790 s calcium-without-spikes contaminant as a second term —
*not* padding, and not removed by detrending. **No padding fix; no detrend/window in the recovery path.** Endpoint-anchored detrend
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
