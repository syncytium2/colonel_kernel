# NEXT_SESSION

**Working state as of 2026-08-10.** Short by design. Read
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
- **Challenges across all three tabs** — "Stamp the kernel" (Tab 1, with Advanced mode;
  replaced "Fit the trace" 2026-08-06, [ADR-0046](docs/adr/0046-tab1-stamp-the-kernel-challenge.md)),
  "Beat the Colonel" (Tab 2, behind a toggle, with timers), "Guess the spikes" (Tab 3,
  with Advanced mode). Editable spike band on Plot.
- **SheetJS pinned** to the maintained CDN tarball 0.20.3, closing the `xlsx` 0.18.5 CVEs
  ([ADR-0036](docs/adr/0036-sheetjs-install-from-maintained-tarball.md)), plus Dependabot,
  a weekly freshness workflow, and [docs/DEPENDENCY_HEALTH.md](docs/DEPENDENCY_HEALTH.md).
- **Deploy hygiene (2026-07-18)** — `npm run deploy` now executes the whole runbook with
  gates; a shallow-clone build guard in [vite.config.js](vite.config.js) closes the bug that
  shipped a wrong Tab 0 "Born" date; [DEPLOYED.md](DEPLOYED.md) records what is live.
- **Tab 0 leads with the problem (2026-07-18, figure since replaced)** — Tab 0 opens with
  the premise figure rather than the four-methods explainer, which had been answering a
  question the visitor had not been shown. The *framing* stands; the figure itself is now
  simulated (see 2026-07-31 below), so the "only unpublished-data figure that ships" note
  that used to sit here no longer applies — **nothing unpublished ships at all.**
- **User data access + input template (2026-07-30)** — the app never told anyone what file it
  wants. Tab 0 gained a **"Bring your own recording"** section (contract, the rules that bite,
  two template downloads); the same guidance is on Tab 2's dropzone and in its rail, which is
  where users actually land since the nav auto-loads the Tab 1 handoff. The template is a
  **working example recording** — drop it back in and a kernel comes out — synthesized
  in-browser from core, never committed.
  [ADR-0038](docs/adr/0038-input-template-working-example-recording.md); discharges the
  deliverable ADR-0019 §5 had reserved as TBD. Guarded by `npm run template-acceptance`.
  Same pass fixed Tab 2 having **no keyboard path to load a file**.
- **Interactive-demo review (2026-07-30)** — all four tabs driven in a browser at four
  widths; findings in
  [docs/reviews/interactive-demos-2026-07-30.md](docs/reviews/interactive-demos-2026-07-30.md).
  The math is untouched; everything found is interaction/layout. The top four are listed
  under "▶ Next action" and **none of them are fixed yet.**
- **README rewritten (2026-07-30)** — two thirds of it was unedited `create-vite`
  boilerplate. Now leads with what the tool does and does not do, the input contract, and
  the privacy posture. The murderboard caught three format claims that were wrong *and had
  shipped in the app copy too* — most seriously the region-name rules, which omitted the
  20-minute analysis cap.
- **[docs/technical_overview.md](docs/technical_overview.md) (2026-07-31)** — standalone
  write-up of the architecture, the deconvolution math and the build gates, for readers
  arriving from outside. An independent verification pass caught six wrong claims in the
  first draft, one of which contradicted FOUNDATIONS §4 on acausal energy.
- **The premise figure is now SIMULATED, and zoomable (2026-07-31)** — the significant
  change of these two days. `src/lib/core/premise-sim.js` models the phenomenon instead of
  reproducing a recording: AP-linked calcium summing linearly from bursts of 1–5 spikes,
  plus three calcium events with no spikes beneath them, in two morphologies (tall/brief/
  symmetric via a gaussian; medium-rise/12-s-decay via the calcium builder). Built from the
  app's own primitives, so the model cannot drift from the tool. 16 tests guard it.
  Because it is synthetic the figure could then be made **live and x-zoomable** — two
  co-registered bands, drag or jump-button to zoom, y pinned so amplitudes stay comparable —
  which is the capability a real-data version was reverted for on 2026-07-30.
- **Kernel support is now cut on amplitude (2026-08-05)** — Tony spotted the Tab 1 calcium
  kernel cornering at exactly 2.00 s. Supports were cut at a fixed multiple of the shape's own
  parameter (±3σ, 5τ, 5·τ_decay), which bounds the distance but not the value the last sample
  still holds, so every kernel ended on a step: 1.11% / 0.67% of peak, 2.68% at the Tab 1
  calcium defaults, and up to 9.14% as τ_rise → τ_decay. A step is broadband, so it seeds
  ringing in the Tab 2 FFT decon. One `TAIL_EPS = 1e-3`-of-peak threshold now replaces all
  three rules; worst case is 0.1% at every slider position, and a swept tail-step invariant in
  the tests pins it. [ADR-0039](docs/adr/0039-kernel-support-amplitude-cutoff.md).
- **Tab 1 stacks output above input (2026-08-05)** — the calcium trace is the object of
  interest, so it now sits on top with the spike train as a short strip beneath, following
  Tab 0's premise figure. The Tab 1 Learn view had been the only one of the three stacking
  them the other way. Tab 0's *fixed* 136px raster could not be copied literally into a
  viewport-dividing shell — it inverted the priority at ~1100px — so the strip is a cap that
  shrinks with the trace. [ADR-0040](docs/adr/0040-tab1-band-order-follows-tab0.md).
- **One color per plotted quantity (2026-08-05)** — closes the color question the band-order
  work left open. Plot colors were hex literals at seven call sites, so red had drifted into
  three meanings (Tab 0 spikes, Tab 2's reconstruction, "you" in Guess the spikes) and two
  collisions sat inside single views. Roles now live once in `app.css` as `--series-*`:
  teal = data/target, red = what the machine produced, purple = what you control, ink =
  spikes, gray+dashed = hidden truth. Validated for colorblind separation, not eyeballed.
  Copy that named colors ("the red ticks…") is now position-based.
  [ADR-0041](docs/adr/0041-plot-series-palette-one-color-per-quantity.md).
- **Noise is ON by default, and the kernel band has a key (2026-08-05)** — **amends canon.**
  §7 named noise injection "so deconvolution isn't deceptively easy" and §11.2 then set it to
  **0**, so Tab 1 opened noiseless and handed Tab 2 a noiseless signal: its headline read
  retained-kernel R² **1.0000**, acausal ratio 0.0000. Tab 1 now opens at 3× cohort σ
  (SNR ≈ 14); Tab 2's default reads 0.8920 / 0.0134 with real ringing. The kernel+STA square's
  key existed but sat below the fold in the summary panel and had drifted; it now sits under
  the square, derived from the series.
  [ADR-0042](docs/adr/0042-noise-on-by-default-kernel-band-key.md).
- **Tab 3 overlays true vs recovered input (2026-08-05)** — the recovered band was rendering
  **8px tall** (the bottom band pays for the x-axis out of an equal share), which made a
  positive peak read as a negative one and looked like a sign error in the deconvolution. It
  is not: recovered is **positive at all 33 spike times** (+0.23…+0.29); the negatives fall
  only *between* spikes, which is the ringing §2 exists to show. Now one shared y-axis, where
  the ≈0.3× amplitude shortfall is the visible lesson rather than something two auto-scaled
  axes hid. [ADR-0043](docs/adr/0043-tab3-overlay-true-and-recovered-input.md).
- **AI/search visibility groundwork (2026-08-10, branch `ai-visibility`)** — the on-page half
  of the "site is not indexed" open item below. The pre-JS body was an empty
  `<div id="app">` with `<title>colonel_kernel</title>`; `index.html` now carries a real
  title, meta description, canonical, OG tags, JSON-LD, and a static crawler-readable
  summary inside `#app` that `main.js` clears before mount. `/methods` gains canonical +
  OG + JSON-LD. New `public/robots.txt` (replaces the **host-injected** Cloudflare one that
  blocked AI crawlers — the policy is now ours, all crawlers welcome), `sitemap.xml`, and
  `llms.txt` (curated AI-facing summary; keep its claims in sync with FOUNDATIONS).
  JSON-LD is a non-executable data block, so the strict CSP is untouched — verified against
  the built bundle with `scripts/screenshot.mjs` (zero console errors, app mounts over the
  static summary). **Not yet deployed.**

- **AP-independent calcium is now a dial, not just a claim (2026-08-18, branch
  `ap-independent-slider`)** — Tabs 1, 2 and 3 each get a 0 → 1 slider: `0` = every sample is
  calcium a kernel explains, `1` = the spike train explains none of it. The AP-linked part
  fades as events accumulate in the widest spike-free stretches, modeled on `_80` ROI 1
  (§3) — the two morphologies move out of `premise-sim.js` into `core/ap-independent.js` and
  are re-exported, so Tab 0's figure and the new control share one definition. Tabs 1/3 share
  one bound value (one signal, two rails); Tab 2's is tab-local and badges the reconstruction
  band `⚠ … synthetic` while it is off zero. Measured payoff: the default handoff's
  retained-kernel R² goes **0.89 → −0.56** at mix 0.45, and a real 37-ROI recording's
  reconstruction R² **0.42 → −0.61** at 0.40.
  [ADR-0049](docs/adr/0049-ap-independent-calcium-slider.md). **Deployed 2026-08-18.**
- **…and the dial moved to the chrome the same day
  ([ADR-0050](docs/adr/0050-ap-independent-dial-is-global-chrome.md))** — three per-tab
  sliders in three rail positions, one inside Tab 2's collapsed Advanced fold, is three
  places to hunt for one idea; and Tab 2's slider could read 0.00 over a trace Tab 1 had
  already contaminated through the handoff. Now **one global value** in a full-width strip
  under the tab row, identical position on Tabs 1–3, hidden on Tab 0 — applied **exactly
  once**, which is why the handoff now carries the *uncontaminated* trace and Tab 2 places
  the events itself. Each tab keeps its own statement of consequence.

Core suite: **260 passing**, plus `npm run template-acceptance`.
Deployed state: see [DEPLOYED.md](DEPLOYED.md) — **current as of 2026-08-05.**

**History was rewritten on 2026-07-31 (dated 07-30 in the commits).** The reverted
interactive figure had left the ROI 1 recording in git history, so it was stripped with
`git-filter-repo` and force-pushed. Verified: master's tree hash unchanged, all 233 commits
present with identical authors/dates/subjects, exactly 2 trees differing. **Every commit SHA
from 2026-07-18 onward changed** — any SHA written down before that is dead, and any other
clone must be **re-cloned, not pulled.**

## ▶ Next action — Tony's call

The 2026-07-30 review produced a ranked list; **the top four are small, local, and independent**
(full detail and repro in the review doc):

1. **A scored round can be rewritten after it is scored.** Beat the Colonel's sliders stay live
   after reveal (0.760 → −1.000 while the tally still says `Ties 1`); Guess the spikes' `clear`
   is enabled post-reveal and rewrites 42% F1 → 0%. **Tab 1's new challenge had the same bug
   and is fixed** (2026-08-07, ADR-0047: both click handlers return unless `phase === 'play'`)
   — the one-line shape of that fix applies to the other two. **These two are still open.**
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

**Raised by the 2026-08-10 AI-visibility work:**

- **Golden-path browser eval — TODO, named but not started.** An agent-runnable Playwright
  pass against the **built** app: serve `dist/`, download the ADR-0038 template workbook,
  drop it back into Tab 2, assert the recovered τ / peak-lag land within tolerance. This is
  the browser-level loop the node gates (`test:core`, `machinery-check`,
  `template-acceptance`) cannot close — real UI, real file path, real CSP'd bundle — and it
  would double as the "deploy does not gate on console CSP violations" gate the 2026-08-05
  item asks for. Related and also unstarted: agent legibility / accessibility
  (`App.svelte` has zero ARIA attributes; labeled controls and landmarks serve screen
  readers and AI agents alike).
- **Resume-tool feedback disposition (2026-08-10).** External review of the two live apps
  (this and no_peak) named five items. Already done here before it arrived: static
  methods page (`/methods`), JSON-LD, robots.txt/llms.txt (the AI-crawler allow is a
  **deliberate** trade — discoverability in exchange for training use — recorded in
  `public/robots.txt`'s comment). Done on this pass: **cross-links** — the pre-JS body and
  `llms.txt` now link no_peak, and no_peak links back (fireflies is not live and is not
  linked). Still off-repo for Tony: GitHub profile README linking both apps, NCBI
  bibliography if it allows links, sitemap submission to Google/Bing.
- **Cloudflare "managed robots.txt" is voiding the crawl policy on BOTH zones —
  dashboard action needed (Tony).** Confirmed live 2026-08-10 on kernel.* and nopeak.*:
  the edge PREPENDS a managed block (`Content-Signal: ai-train=no`, plus `Disallow: /`
  for GPTBot, ClaudeBot, CCBot, Google-Extended, Amazonbot, Applebot-Extended,
  Bytespider, meta-externalagent) ahead of our file. Named user-agent groups beat our
  `User-agent: *` allow, so the AI crawlers we deliberately allow are blocked
  regardless of the repo's robots.txt. Third host-side override after the beacon and
  the host-injected robots.txt of 2026-07-31. Fix is per zone in the dashboard:
  AI Crawl Control / Security → Bots → turn **managed robots.txt OFF** (and keep
  "Block AI Scrapers and Crawlers" off). Verify after: `curl -s <site>/robots.txt`
  must return our file's text as the whole response, no managed preamble. No
  redeploy needed — it is purely an edge setting.
- **Prerender — Tony's call, recommendation: not yet.** The review's headline item is a
  SvelteKit `adapter-static` + `prerender` migration so `/` is real HTML at build time.
  Genuine benefit, but it touches routing, the CSP-inject and born-date build plugins, and
  the deploy runbook — real migration cost for a gain the static pre-JS body already mostly
  captures. Recommendation: hold until inbound links + sitemap submission have had a chance
  to work; revisit if the site still fails to index. Note the current
  clear-static-body-then-mount pattern is **not cloaking** — every user agent gets identical
  bytes; the summary is a standard SPA placeholder, never UA-gated.

**Raised by the 2026-08-07 haruspex-handoff murderboard** (run record:
[docs/reviews/kernels_v1_handoff_para_2026-08-07.md](docs/reviews/kernels_v1_handoff_para_2026-08-07.md)):

- **Haruspex has no findable home for the human-identified kernel list.** The 8-ID list (all
  ROI 1, no deviations) lives only in
  [docs/reviews/kernel-review-baseline-2026-07-19.md](docs/reviews/kernel-review-baseline-2026-07-19.md)
  and the bus CSV — there is no haruspex-facing bus folder, which is why they asked for a list
  that already existed. The reviewed handoff note (full text in the run record) now carries
  the list + analysed windows; it still needs a durable home haruspex can see. Their next
  step, **raw-F extraction, will also need per-recording F₀ or raw traces** — the kernels
  export deliberately ships neither.
- **Spike-count discrepancy between the review doc and the export, unreconciled.** The
  2026-07-19 review quotes 235: 3554 and 209: 2006 spikes; the CSV's baseline `n_spikes` says
  1937 and 1240. The other three quoted counts match exactly. Likely cause: for exactly those
  two the screen scored **senktide** (its most-spikes region), so the review quoted
  senktide-window counts against the export's baseline counts — but neither doc says so.
  One line in whichever doc gets touched next would close it.
- **Exporter nit:** `colonel_kernels_v1.json` stores `dt = 0.100000000083` for `20250926_237`
  where the CSV says 0.1 — harmless (~1 µs over 1200 s), worth one rounding line in
  `scripts/dataset-summary/export_kernels.mjs` at the next regen.
- **Standing debts the handoff leans on, still open** (owed since 2026-07-19/20): the
  λ-stability sweep behind `a_robust` (haruspex's coupling-floor use will likely trigger the
  "ask us for the sweep" clause), the careful all-regions walkthrough, the baseline-restricted
  screen re-run, and the screen's dense-firing under-call cleanup.
- **Murderboard staleness was invisible at session start.** The briefing printed no warning
  while the vendored copy sat behind upstream (d0ce4e7 vs 635c5a8); the skill's call-up gate
  (`--refresh`) caught it. The `--hook` cache masking a fresh upstream move is by design, but
  worth knowing the briefing's silence is not evidence of freshness. Re-vendored to 635c5a8
  and landed on master this session (merge `4da0e19`; stamp-only, content was identical).

**Raised by the 2026-08-05 work:**

- ~~**Tab 1's "Fit the trace" challenge is in the wrong direction.**~~ **Closed 2026-08-06**
  by [ADR-0046](docs/adr/0046-tab1-stamp-the-kernel-challenge.md) — replaced by **"Stamp
  the kernel"**: both spikes and kernel given, you build the output. Reworked the same day
  by [ADR-0047](docs/adr/0047-tab1-stamp-consumes-the-spike.md) so a click **consumes**
  the spike and replaces it with its kernel — the input drains as the output fills, which
  is what convolution actually does. Normal shows the target and the count; Advanced hides
  both, so "have I found them all?" is the real question. **Still open:** the
  **slide-and-multiply animation** below is related but NOT discharged — the challenge
  makes you *perform* stamp-and-sum, it does not animate the kernel sliding. Whether the
  animation is still wanted now the operation is playable is Tony's call.
- ~~**The band that draws the x-axis is systematically short-changed.**~~ **Closed
  2026-08-05** by [ADR-0045](docs/adr/0045-close-axis-tax-and-csp-style-attrs.md).
  Live: Tab 1 167/**76**px, Tab 2 **101/101** (ADR-0026's co-equal raster delivered as
  measured), Tab 3 123/119. The rule stands for new work: **measure `.u-over`, not the
  container**, after any band-proportion edit.
- ~~**Two `style-src-attr` CSP violations fire on Tab 2.**~~ **Closed 2026-08-05** by
  [ADR-0045](docs/adr/0045-close-axis-tax-and-csp-style-attrs.md) — **2 → 0** live. Cause:
  Svelte 5 clones static markup from an HTML *string*, so a literal `style="…"` in a
  component is parsed as an inline style attribute and the strict CSP blocks it. Exactly
  two existed. **Rule: never write a literal `style="…"` in a component** — invisible in
  dev (the CSP is injected at build time) and silently unapplied in production; use a
  class. Interpolated `style={…}` goes through CSSOM and is fine.
- **`npm run deploy` does not gate on console CSP violations** — only on third-party
  beacons. Catching the above needed a Playwright pass against `npm run preview` or the
  live site. A cheap gate worth adding.

**Raised by the 2026-07-30/31 work:**

- **The simulation models calcium-without-spikes, but not spikes-without-calcium.** Every
  burst in `premise-sim.js` still gets its proportional transient. The real recording's other
  finding — the stretch where spiking continues and the response collapses — is not modelled.
  A gain envelope over part of the trace would cover it, in the same file.
- **The 780 s claim still stands in canon and in the citable document.** FOUNDATIONS §3 and
  `public/methods.html` both say the large transient near 780 s has "no matching spikes"; the
  figure shows red ticks at its onset (zoom kept at `darkroom/_shots/roi1_zoom780.png` while
  that directory survives). The phenomenon is real but looks like *disproportion*, not
  absence. **The app no longer repeats it** — Tab 0's figure is simulated — but `/methods` is
  served publicly and still does. Per ADR-0018 the eyeball adjudicates, so this is Tony's
  call, not a patch.
- **The site is not indexed at all** — `site:kernel.tonydefazio.com` returns nothing. Causes,
  in order: no inbound links anywhere (the biggest by far; the UMich experts page or a GitHub
  profile README would fix it), a landing page whose pre-JS body is `<div id="app"></div>`,
  `<title>colonel_kernel</title>` as the search-result headline, no meta description, no
  sitemap, never submitted. Note Cloudflare injects a `robots.txt` we did not write — it
  permits search and blocks AI crawlers, which is benign, but it is host-injected and
  invisible to the repo, exactly like the beacon was. A `public/robots.txt` would make the
  policy ours. **On-page half addressed 2026-08-10** (state block above): title, description,
  static pre-JS body, JSON-LD, sitemap, and our own `robots.txt` are in. **Still open, and
  still the biggest cause: inbound links** (UMich experts page, GitHub profile README) and
  submitting the sitemap to Google/Bing — both live outside the repo.
- **Tab 2's multi-region path is still UNREVIEWED.** `data/` is gitignored, so the demo review
  never loaded a real multi-region workbook: region shading, double-click region selection,
  the regional kernel band and the summary PDF export are unexercised. Overlaps the File-98
  three-region item below.

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
