# NEXT_SESSION

**Working state as of 2026-07-18.** Short by design. Read
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

Core suite: **217 passing**. Deployed state: see [DEPLOYED.md](DEPLOYED.md).

## ▶ Next action — Tony's call

There is no single obvious next slice; the last feature push (Challenges) closed cleanly.
**Pick one of the open items below and name it here.** Do not infer a next action from the
archive — those pointers are stale.

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

**Needs Tony's eyeball (figure gate, [ADR-0018](docs/adr/0018-figure-gate-policy.md)):**

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
