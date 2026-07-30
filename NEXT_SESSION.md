# NEXT_SESSION

**Working state as of 2026-07-30.** Short by design. Read
[`FOUNDATIONS.md`](FOUNDATIONS.md) first (canonical), then this.

> **Rule for this file:** one dated state block, one next action, and a list of
> genuinely open items. When it stops matching `git log`, fix it or archive it.
> The previous version drifted 28 commits and grew three contradictory
> "RESUME HERE" pointers, which is how parallel sessions ended up disagreeing
> about what was next. History lives in
> [`docs/archive/NEXT_SESSION-history-2026-07-08.md`](docs/archive/NEXT_SESSION-history-2026-07-08.md)
> — useful background, **not** current state.

## Where things stand

All four tabs are built and live. Since the last handoff update (2026-07-08):

- **Tab 0 "Start here"** + the citable [Methods & Mathematical Reference](public/methods.html),
  the four-methods explainer figure, and born-on / last-updated dates baked from git at build time.
- **Summaries & export (Phase 1)** — in-app per-recording summary → Save as PDF.
- **Tab 3** — naive spike inference (honest illustration, FOUNDATIONS §2).
- **Challenges across all three tabs** — "Fit the trace" (Tab 1), "Beat the Colonel"
  (Tab 2, behind a toggle, with timers), "Guess the spikes" (Tab 3, with Advanced mode).
  Editable spike band on Plot.
- **SheetJS pinned** to the maintained CDN tarball 0.20.3, closing the `xlsx` 0.18.5 CVEs
  ([ADR-0036](docs/adr/0036-sheetjs-install-from-maintained-tarball.md)), plus Dependabot,
  a weekly freshness workflow, and [docs/DEPENDENCY_HEALTH.md](docs/DEPENDENCY_HEALTH.md).
- **Deploy hygiene (2026-07-18)** — `npm run deploy` now executes the whole runbook with
  gates; a shallow-clone build guard in [vite.config.js](vite.config.js) closes the bug that
  shipped a wrong Tab 0 "Born" date; [DEPLOYED.md](DEPLOYED.md) records what is live.
- **Tab 0 leads with the problem (2026-07-18)** — the ROI 1 premise figure (real paired
  recording, 140 AP ticks over the calcium trace) now opens Tab 0 above everything but the
  title, with prose naming the two decoupling episodes. Previously Tab 0 opened with the
  four-methods explainer, answering a question the visitor had not been shown. Same figure and
  framing the README leads with; matches FOUNDATIONS §3–4. **This is the only unpublished-data
  figure that ships in the public app** — consent widened and the rule for any future one is
  recorded in [docs/img/README.txt](docs/img/README.txt).
- **User data access + input template (2026-07-30)** — the app never told anyone what file it
  wants. Tab 0 gained a **"Bring your own recording"** section (contract, the rules that bite,
  two template downloads); the same guidance is on Tab 2's dropzone and in its rail, which is
  where users actually land since the nav auto-loads the Tab 1 handoff. The template is a
  **working example recording** — drop it back in and a kernel comes out — synthesized
  in-browser from core, never committed.
  [ADR-0038](docs/adr/0038-input-template-working-example-recording.md); discharges the
  deliverable ADR-0019 §5 had reserved as TBD. Guarded by `npm run template-acceptance`.
  Same pass fixed Tab 2 having **no keyboard path to load a file**.
- **Interactive-demo review (2026-07-30)** — all four tabs driven in a browser at four widths;
  findings in [docs/reviews/interactive-demos-2026-07-30.md](docs/reviews/interactive-demos-2026-07-30.md).
  The math is untouched; everything found is interaction/layout. Highest-severity items are
  listed under "▶ Next action" below.

Core suite: **217 passing**, plus `npm run template-acceptance`.

**The live site is behind.** [DEPLOYED.md](DEPLOYED.md) records `66abde3` (2026-07-18); `master`
is at `30c990b` (2026-07-20), and the 2026-07-30 work above is not committed yet. Nothing here
reaches users until `npm run deploy` runs.

## ▶ Next action — Tony's call

The 2026-07-30 review produced a ranked list; **the top four are small, local, and independent**
(full detail and repro in the review doc):

1. **A scored round can be rewritten after it is scored.** Beat the Colonel's sliders stay live
   after reveal (0.760 → −1.000 while the tally still says `Ties 1`); Guess the spikes' `clear`
   is enabled post-reveal and rewrites 42% F1 → 0%.
2. **Plot bands collapse 206 px → 18 px at ≤900 px**, a cliff at the breakpoint.
3. **Toggling a challenge destroys a loaded recording** — Tab 2 unmounts and silently reloads
   the synthetic handoff.
4. **Deep-linking `#tab2` gives a blank tab**; the tab is never written back to the URL.

**Pick one and name it here.** Do not infer a next action from the archive — those pointers
are stale.

## Open items

**Needs a decision from Tony (blocking, cheap once decided):**

- **Trace color grammar, app ⇄ summaries.** The app colors by **region**; the summary PDFs
  color by **method**. Not a find-replace — pick the canonical scheme first. Cheapest shared
  win is region hues + the STA / actual-vs-predicted colors. Detail in the
  [archive](docs/archive/NEXT_SESSION-history-2026-07-08.md) under "align trace color schemes".
- ~~**Cloudflare Web Analytics beacon.**~~ **Resolved 2026-07-18**, in-repo rather than via the
  dashboard: [`public/_headers`](public/_headers) sets `no-transform` on the HTML routes, and
  Cloudflare cannot inject into a response it may not transform. The live console is now clean on
  both `/` and `/methods`, and `npm run deploy` fails if any third-party beacon reappears.
  **Optional follow-up:** also set it to Disable in the dashboard (account → Web Analytics →
  Manage site) for defense in depth — the two are independent. Note the injection is
  **user-agent gated**, so verify as a browser, never with a plain curl.
- **Deploy model.** Still manual (`npm run deploy`). Auto-deploy on push to `master` remains
  undecided — WIP lands on `master` often, so it would want a `deploy` branch or a build gate.

**Cross-team (not a colonel_kernel-only ADR):**

- **Region analysis-window arithmetic — shared-bus contract v1.0 → v1.1.** APs leak into
  post-switch windows because no `solution_delay` trim is applied. This matches current canon
  (ADR-0019 §4) and the frozen bus contract, so it is a contract **omission**, not a bug. Two
  divergent MATLAB rules exist, neither on the bus. Decide **once on the bus** — `solution_delay`
  yes/no, cap, short-region skip-vs-flag, high-K⁺ exception — then each repo's ADR references it.
  Do not author a third rule here. Full diagnosis in the archive.

**Raised by the 2026-07-20 MLspike kernel export — full record in
[docs/reviews/kernel-export-mlspike-2026-07-20.md](docs/reviews/kernel-export-mlspike-2026-07-20.md):**

- **Method 2 fits only 1 of the 8 human-identified kernels.** `pm_fit_quality` is `good` for
  `20250925_233` only; 5 failed (4 with R² ≤ 0, 2 railed at the `tau_rise` bound, 237
  non-converged), 2 poor. A double exponential is the standard forward model in this
  literature and ours fits one of eight recordings a human says visibly contain kernels.
  Too rigid a model, baseline tilt defeating the objective, or bad initialization — unknown.
  **The most substantive open science item on this list.**
- **STA vs deconvolution amplitude disagree bidirectionally** — STA higher on 3 of 7, lower on
  4, spanning 0.43× to 10.5×. Not an offset that can be corrected for. Two methods that should
  agree on per-spike amplitude do not, and it is undiagnosed.
- **`20260130_272` and `20250807_181` have acausal ratio > 1** (2.14, 2.36) — more recovered
  energy before the spike than after, which is physically impossible. Both are on the human
  list, so the eyeball and the diagnostic disagree; not yet adjudicated.
- **λ-stability sweep never run for the 8.** `a_robust` was handed over as the recommended
  amplitude at `lambda = 0.002` with `stability: false`. Cheap to run; ADR-0004 wants λ visible.
- **No ADR records the no-saturation assumption.** Grep of all 37 ADRs for "saturation" is
  empty; ADR-0006 is linear-vs-*circular*, a different claim. An early draft of the handoff
  cited it wrongly. Either an ADR or a FOUNDATIONS line should state the linear-response
  assumption.
- **ROI-1 labelling is CLOSED for these 8** — Tony confirmed 2026-07-20 they are ROI 1. What
  remains is the *screen's* disagreement (it calls ROI 1 plausible for only `20241004_80`; six
  of the rest find nothing anywhere; for `209`/`235` it never examined baseline). That is a
  screen problem now, not a provenance one.

**Needs Tony's eyeball (figure gate, [ADR-0018](docs/adr/0018-figure-gate-policy.md)):**

- **Careful kernel walkthrough — SCHEDULE THIS.** A *quick* baseline-only human review is
  recorded in [docs/reviews/kernel-review-baseline-2026-07-19.md](docs/reviews/kernel-review-baseline-2026-07-19.md):
  8 recordings with usable baseline kernels (80, 151, 181, 209, 233, 235, 237, 272). The careful
  pass is still owed — all regions, verdict written down per slice as it is made.
  **The ROI-1 mislabel worry that framed this is CLOSED** (Tony confirmed 2026-07-20 these are
  ROI 1); the walkthrough's remaining purpose is coverage of the other regions, plus deciding
  whether the eyeball or the acausal-ratio diagnostic wins on `272` and `181` (see the
  2026-07-20 block above).
- **File-98 three-region case.** ADR-0028 mode-removal is merged but the 3-region rendering is
  ungated: confirm regions shade/label correctly, the kernel band shows regional-only, and
  double-click zoom + current-region behave.

**Horizon (no decision pending, not blockers):**

- **Tab 2 multi-trace overlay** (all methods + STA on one lag axis). The blocking scale-mode
  question is settled — unitary calcium event amplitude is ~constant, so kernels get a **fixed
  absolute display scale**. The rendering is the remaining work.
- **Method-1 bowl separability check** (Konnerth backward-min) — darkroom-first, oracle-gated.
- **Longer-τ_decay oracle** — the stress [ADR-0023](docs/adr/0023-method3-baseline-strategy.md)
  names; still unrun.
- **Laplacian-prior low-frequency blindness** — dominant term in the real-data acausal bowl.
  [ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md) isolated padding as negligible
  and scoped this out. A regularization-convention question; not a UI blocker.
- **Deferred core/UI:** dt-only divergence warn-UI ([ADR-0012](docs/adr/0012-timing-vector-authoritative-dt-derived.md)),
  antialias accumulator ([ADR-0001](docs/adr/0001-delta-rasterization.md)), the Tab 1
  slide-and-multiply animation (pure presentation; the math is proven).

## Conventions that bite

- **Canon → `master`.** FOUNDATIONS, ADRs, the ADR index, and this file live on `master` only.
  Code goes to a short-lived feature branch, merged back `--no-ff`.
- **Deploy only via `npm run deploy`**, from a full clone on `master`. See
  [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).
- **Repo hygiene:** `git ls-files data/ darkroom/` must be empty before any push.
- **Figures go in gitignored `darkroom/`**, never the repo or a temp dir.
