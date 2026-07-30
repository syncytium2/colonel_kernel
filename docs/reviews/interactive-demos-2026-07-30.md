# Interactive demo review — all four tabs (2026-07-30)

**Scope:** the interactive demos and challenge modes on Tabs 0–3, reviewed for
refinement. Not a science review — no kernel verdicts here.

**Bottom line:** the math is sound and the challenges are genuinely well conceived.
Everything below is in the interaction and layout layer. Three items make the app
actively wrong in front of a user (D1, D3, D4); one makes it unusable on a common
screen width (D2).

## How this was checked

- Read `FOUNDATIONS.md`, `NEXT_SESSION.md`, `CLAUDE.md`, the ADR index.
- Drove the running dev build in headless Chromium: every tab, every challenge mode,
  at 1440 / 900 / 768 / 420 px, light and dark, plus scripted play sessions
  (place spikes → reveal → score → new round).
- Measured layout geometry and score state **in the live DOM** rather than inferring
  from CSS, and read the source for every claim.
- `npm run test:core` → **217 passed, 0 failed.**

Scratch harness (gitignored): `darkroom/_shots/`.

---

## A. Wrong in front of the user

### D1 · A scored round can be silently rewritten after it is scored

Two variants, both reproduced and measured:

- **Beat the Colonel.** The sliders stay live after "Reveal & score"
  ([BeatTheColonel.svelte:245-253](../../src/lib/BeatTheColonel.svelte#L245-L253)), and
  `userR2` / `verdict` are `$derived` (:160, :163). Measured: revealed at **0.760**,
  then dragged the sliders → headline reads **−1.000** while the tally stays
  `You 0 / Colonel 0 / Ties 1`. The number on screen no longer matches the recorded result.
- **Guess the spikes.** `clear` is rendered outside the play-phase guard
  ([GuessTheSpikes.svelte:219](../../src/lib/GuessTheSpikes.svelte#L219)). Measured:
  revealed at **42% F1, 4/14 hits**; clicked `clear` → **0%, 0/14**, same round, no undo.

`reveal()` should snapshot the score into `$state` and freeze (or hide) the inputs.

### D2 · The plot bands collapse to 18 px at ≤900 px

Measured band heights on Tab 1:

| viewport | band heights | page overflows horizontally |
|---|---|---|
| 1440 px | 206 / 206 px | no |
| 900 px | **18 / 18 px** | no |
| 768 px | **18 / 18 px** | no |
| 420 px | **18 / 18 px** | **yes** |

`.appmain{height:100vh}` ([App.svelte:476](../../src/App.svelte#L476)) plus Shell's
≤900 px stack ([Shell.svelte:106-127](../../src/lib/Shell.svelte#L106-L127), which sets
`.top-row{height:auto}`) lets the rail, summary and 320 px kernel square consume the
viewport; `.bands{flex:1 1 auto;min-height:0}` absorbs the whole deficit. Plot's 150 px
floor only fires at ≤1 px ([Plot.svelte:125-129](../../src/lib/Plot.svelte#L125-L129)),
so it never engages. This is a cliff at the breakpoint, not a taper — and 900 px is iPad
portrait or half a laptop screen. A `min-height` floor on `.band` plus dropping the
`100vh` lock under the breakpoint would fix it.

### D3 · Toggling a challenge destroys a loaded recording, without asking

`{#if challenge2}` swaps `BeatTheColonel` for `Tab2`
([App.svelte:265-269](../../src/App.svelte#L265-L269)), so Tab 2 unmounts and its
`recording` state dies with it. On return, `lastHandoffId` re-initialises to `-1`
([Tab2.svelte:212](../../src/lib/Tab2.svelte#L212)) and the `$effect` at :217-231 reloads
the Tab 1 synthetic handoff. A researcher who dropped their `.xlsx`, glanced at the game,
and came back is now looking at synthetic data labelled "Tab 1 (synthetic)". The file-drop
path deliberately doesn't bump the handoff id, which is what makes the guard useless
across a remount.

### D4 · Deep-linking `#tab2` gives a blank flagship tab

`initialTab()` ([App.svelte:27-35](../../src/App.svelte#L27-L35)) can return 2, but only
the nav `onclick` calls `goToTab2()` (:239) — which is what builds the handoff. Land on
`#tab2` and `handoff` is null, so the tab renders an empty dropzone. The comment at
:24-26 asserts these deep links work.

Related: `tab` is never written back to the URL (no `history.*`, no `hashchange` anywhere),
so the current tab can't be bookmarked or shared and the back button doesn't move between
tabs.

### D5 · Two missing-space rendering bugs

Svelte trims leading whitespace at the start of a block:

- [BeatTheColonel.svelte:303-304](../../src/lib/BeatTheColonel.svelte#L303-L304) renders
  "…took **3.5 ms**.That's about 444× faster."
- [BeatTheColonel.svelte:337](../../src/lib/BeatTheColonel.svelte#L337) renders
  "target vs **your kernel**vs Colonel (dashed)".

### D6 · Two x-axes after "Reveal answer" (Fit the trace)

`showXAxis` / `xLabel` are baked into uPlot's opts at `onMount` only
([Plot.svelte:284-285, 315-318](../../src/lib/Plot.svelte#L284-L285)); the live-update
`$effect` (:448-458) calls `setData` and nothing else. FitTheTrace flips both on phase
change ([:240-241](../../src/lib/FitTheTrace.svelte#L240-L241)) expecting the axis to move
down to the new True-spikes band, but that plot has no `{#key}` wrapper. Result: the spike
band keeps its axis and the new band adds a second one, with different plot-area heights —
which breaks the x co-registration the `padRight` / `yAxisSize` machinery exists to protect
(ADR-0030). Confirmed in code and on screen.

`color`, `kind`, `barSize`, `cursorPoints` and `syncKey` are init-only in the same way.

### D7 · Right-edge off-by-one on the editable spike bands

`addSpike` accepts `t <= DURATION` ([FitTheTrace.svelte:102](../../src/lib/FitTheTrace.svelte#L102),
[GuessTheSpikes.svelte:126](../../src/lib/GuessTheSpikes.svelte#L126)), but `makeGrid`
gives times 0…DURATION−dt ([timebase.js:30](../../src/lib/core/timebase.js#L30)) and
`rasterize` drops index ≥ n ([rasterize.js:80-83](../../src/lib/core/rasterize.js#L80-L83)).
A spike snapped to exactly DURATION is stored and counted, never drawn, and can't be
shift-clicked away — only "clear" recovers. Bound should be `DURATION - grid.dt`.

### D8 · Tab 3's "Recovered input" band is x-shifted for the Gaussian kernel

[Tab3.svelte:40-45](../../src/lib/Tab3.svelte#L40-L45) takes `traceValues[i]` with no
`kernel.zeroIndex` term, while `convolveOnGrid` emits
`times[i] = t0 + (i − kernel.zeroIndex)·dt`
([convolve.js:47-49](../../src/lib/core/convolve.js#L47-L49)). The Gaussian has
`zeroIndex = round(3σ/dt) > 0` ([kernels.js:93-101](../../src/lib/core/kernels.js#L93-L101)),
so the recovered train is displaced by `zeroIndex·dt` against the true-spike band directly
above it. Latent on the default calcium kernel (`zeroIndex = 0`); switch Tab 1 to Gaussian
and it appears. `GuessTheSpikes` and `BeatTheColonel` both handle this correctly via
`sliceGrid(full, zeroIndex)` — Tab 3 is the odd one out.

---

## B. The demos, tab by tab

### Tab 0 · Start here

The ROI 1 premise figure is the strongest thing in the app: it states the problem in one
picture before proposing a tool. Narrow-viewport rendering is clean. Three gaps:

- **The challenges are invisible.** No challenge mode is named anywhere in
  `Help.svelte`. They are discoverable only by noticing a 🎯 button that appears
  conditionally in the nav once you are already on a tab. The single most engaging
  layer of the app has no entry point on the page whose job is to be the entry point.
- **"The three tabs"** ([Help.svelte:139](../../src/lib/Help.svelte#L139)) with four tabs
  in the nav. Stale rather than wrong — the three cards are tabs 1–3 — but it reads as
  an error.
- **The Tab 3 card is a dead end.** It is a `<div class="card static">` with no click
  handler and no "Open Tab 3 →" line (:162-171), styled almost identically to the two
  live buttons, and marked "(In progress.)" — while Tab 3 is directly reachable from the
  nav. `navFromHelp` would have handled `n === 3` fine.

### Tab 1 · Convolution + "Fit the trace"

**The tab does not show convolution.** It shows an input and an output. The mechanism —
kernel sliding, multiplying, accumulating — is exactly what a naive visitor needs and is
the one thing absent. See D9 below on the doc drift around this.

**Fit the trace** is a good loop (place spikes, shape a kernel, watch R² respond) with a
punishing entry: it opens at **R² −0.944**, and the metric clamps at −1.000
([challenge.js:31-33](../../src/lib/core/challenge.js#L31-L33)) so two very different bad
attempts read identically — no steering signal exactly when the learner needs it. The
target (`GOOD_FIT` 0.85) is never shown during play. With zero spikes placed, the
editable band renders a y-axis of **0 / 50 / 100** for what will hold unit-height stems.

"clear spikes" and "skip" are 12 px underlined text links sitting side by side; one is
destructive and unconfirmed, the other is not. The verdict says "try again", but the only
button is "New round →", which draws a different hidden trace — there is no path back to
the same round.

### Tab 2 · Kernel recovery + "Beat the Colonel"

Reached the intended way (clicking the nav button), Tab 2 is dense but coherent, and
auto-loading the Tab 1 signal so the tab is never a cold empty state is the best structural
decision in the app.

**It opens on internal vocabulary.** First screen: "§3 checks", "free-vector", "acausal
ratio", "full-latent R²", "retained-kernel R²", "§3 decoupling" — none defined in the UI,
and §3 is a FOUNDATIONS section the visitor has not read. ADR numbers leak into user-facing
copy, worst of all on an error path:
[Tab2.svelte:896](../../src/lib/Tab2.svelte#L896) — *"no APs in this recording —
deconvolution not possible (ADR-0022 policy skip; not fit)"*. Also "Region windows
(ADR-0035)" and "the §13 recovery input". The rail title is `colonel_kernel` in lowercase
snake_case while every other tab uses "Tab N · …" and Tab 0 says "Colonel Kernel".

**Beat the Colonel** — measured, rounds 1–6 at default sliders:

| round | verdict |
|---|---|
| 1 | 🤝 Uncoupled — "counts for nobody" |
| 2 | 🎖️ Colonel |
| 3 | 🏆 **You** — won without touching a single slider |
| 4 | 🤝 Uncoupled |
| 5 | 🎖️ Colonel |
| 6 | 🎖️ Colonel |

Three problems visible in that table:

- **Every first-time player's first round is the unwinnable one.** `roundSeed` starts at 1
  and `uncoupled = rand() < 0.34`
  ([BeatTheColonel.svelte:93](../../src/lib/BeatTheColonel.svelte#L93)) lands true on seed 1.
  The uncoupled round is the best idea in the game — the punchline that sometimes there is
  no kernel to find — but it needs a won round behind it to mean anything.
- **The game can be won by doing nothing.** Round 3 credited a win, updated the tally, and
  fired confetti with the sliders untouched.
- **No-contest is recorded as a tie.** The banner says the round "counts for nobody"; the
  scoreboard reads `Ties 2`. A third counter would match the copy.

Also: confetti fires on uncoupled rounds by design (:186-190) while the text directly below
says nobody can win — rewarding the moment whose lesson is that there is nothing to win.
And the player's slider steps (0.01 / 0.05 / 0.01) quantise parameters the hidden kernel
draws continuously, so the contest is tilted in a way the copy never admits.

### Tab 3 · Spike inference + "Guess the spikes"

**The challenge contradicts the tab's own thesis.** Learn mode says naive inference produces
"48% negative samples… why honest spike inference needs more than a division". The challenge,
same session, reports **MACHINE (F1) 96%** under the caption *"Even naive deconvolution
struggles — that's the point."* The number and the caption disagree, and the tab that exists
to show inference is hard demonstrates a machine that is very good at it. This is the finding
most worth Tony's judgement, because it is a message conflict, not a bug — see the ⚠ below.

Smaller items:

- "Reveal & score" is clickable with zero spikes placed, producing "The machine got 96%…
  you got 0%" prefixed with 👍.
- The "you" card silently changes metric between phases: R² during play, F1 percentage after
  reveal. In Advanced play mode two cards render the same metric and the same value side by
  side (:237-244).
- The Advanced toggle doesn't change `roundSeed` (:147-151), so the hidden spike train and
  kernel are identical across the toggle — you can reveal, flip to Advanced, and replay a
  round whose answer you have seen. (Noise does change, so it is a leak rather than a
  free win.)
- Learn mode and the challenge share nothing — different grid, kernel and noise — so
  switching is a full context reset with no bridge either way.

---

## C. Cross-cutting

### D9 · The slide-and-multiply animation doesn't exist, but two canon docs say it does

The only `getContext` / `requestAnimationFrame` in `src/` is the confetti in
`Celebration.svelte`. `NEXT_SESSION.md:127` correctly lists the animation as deferred, but
`CLAUDE.md:17` states "the Tab 1 slide-and-multiply animation **is** hand-drawn Canvas" and
`FOUNDATIONS.md:492` lists it in the stack table as a settled choice. Flagging rather than
diverging, per CLAUDE.md. Either build it or correct both docs.

### D10 · Celebration is written for a game the player may not be playing

Every win message names the Colonel or the algorithm as an opponent —
*"You beat the Colonel!"*, *"The Colonel tips his cap."*, *"Intuition > regularized least
squares"* ([Celebration.svelte:13-26](../../src/lib/Celebration.svelte#L13-L26)) — yet the
component is also rendered by `FitTheTrace` (:263), which has no opponent at all, and by
`GuessTheSpikes` (:327), whose opponent is "the machine".

`prefers-reduced-motion` only shortens the text animation (:218-219); the 180–300-particle
canvas storm still runs. And `aria-hidden="true"` on the wrapper (:173) suppresses the nested
`role="status"` message (:176), so the win is announced to nobody.

### D11 · Accessibility: the core interaction is mouse-only

`Plot.svelte` binds `mousedown` / `mousemove` / `mouseup` and nothing else (:364-365,
:414-416) — no pointer or touch events. Spike placement **is** Fit the trace and Guess the
spikes, so both are unplayable on any touch device; with D2 that makes tablet and phone a
dead end.

Keyboard is no better. Tabbing through Tab 1 (measured) reaches nav → rail controls → the
Advanced `<summary>`, then wraps. No plot is focusable anywhere in the app; no `role`,
`aria-label` or text alternative on any canvas. Live scores, timers and verdicts have no
`aria-live`, so the feedback that is the entire point is never announced.

> **Tab 2's file-loading half of this was fixed on 2026-07-30** alongside the
> bring-your-own-data work. The dropzone's `role="button" tabindex="0"` was an ARIA lie
> with no key handler — and it made assistive tech announce the entire panel as a single
> button label, which surfaced as a real ambiguity once the panel gained explanatory copy.
> The role is gone, and the `<input type="file">` is now clipped rather than
> `display: none`, so it is focusable with a visible `:focus-within` ring. Verified in the
> built artifact. The plot and challenge findings above are untouched.

Tab 1 has a spike-times text field — the one existing model for a non-mouse input path, and
the obvious thing to give the challenges.

### D12 · Layout: the biggest panels are the emptiest

Measured at 1440×900 on Tab 1:

- Summary panel: 378 px tall, content ends at 202 px → **176 px / 47% empty**. Same on
  every tab.
- Kernel square: 404×400, the shell's designated primary element
  ([Shell.svelte:66-94](../../src/lib/Shell.svelte#L66-L94)). Causal kernels are identically
  zero for all negative lags (`zeroIndex = 0`), and the default ±5 s window
  ([App.svelte:87](../../src/App.svelte#L87)) against a τ_decay of 0.4 s leaves the actual
  shape occupying roughly a fifth of the axis. **The most prominent panel in the app is
  mostly whitespace by construction.**

Meanwhile the time bands — where the signal is — get whatever is left. Tab 1's output band
also shows 300 s at 10 Hz across ~1000 px, so no individual transient is resolvable at the
default view, and neither Tab 1 band offers a zoom hint on screen.

### D13 · Timers measure page-open time, not effort

All three challenges start their timer on mount, so a freshly opened tab already reads
"⏱ 1.2 s" before any interaction, and "You took 1.6 s; the Colonel took 3.5 ms — about
444× faster" is computed against a round nobody played. The interval also keeps ticking
while the tab is backgrounded (no `visibilitychange` handling), which inflates the same
claim. The Colonel's timing is additionally measured inside a `$derived`
([BeatTheColonel.svelte:132-134](../../src/lib/BeatTheColonel.svelte#L132-L134)) — impure
work in a memoised derivation.

### D14 · Three CSP inline-style violations on any plot-bearing view (production only)

The shipped `index.html` sets `default-src 'self'` with no `style-src`, so inline styles are
blocked. Loading Tab 2 from the **built** artifact logs three
`Applying inline style violates … 'default-src 'self''` console errors. They originate in
uPlot, not app code — Svelte sets its own legend swatches through the CSSOM, which CSP does
not police, and those swatches were verified to compute correctly
(`rgb(42, 157, 143)` etc.). Every plot and legend renders correctly, so the present impact
appears to be nil; it is logged here because a console that is *expected* to be noisy is a
console nobody reads, and FOUNDATIONS §6's verification ritual depends on reading it.

Invisible on the dev server, which carries no CSP — exactly the gap CLAUDE.md warns about
when it says to run the ritual against the built artifact.

### D15 · Hardcoded trace colours

`#2a9d8f`, `#d21f3c`, `#c0392b` are literals across the challenge components and Tab 2.
Dark mode (`app.css:38`) redefines the CSS variables but not these, and `resolveColor` runs
once at mount ([Plot.svelte:117-121](../../src/lib/Plot.svelte#L117-L121)). In practice both
themes render legibly at page load, so the live exposure is limited to an OS theme switch
without a reload — lower severity than it first appears. Noted mainly because it is the same
open item `NEXT_SESSION.md` already lists as "Trace color grammar, app ⇄ summaries", still
awaiting a decision.

---

## D. Suggested order of work

1. **D1, D3** — the app showing a result that is not the result it recorded, and eating a
   researcher's loaded file. Both are small, local fixes.
2. **D2** — a `min-height` floor on `.band` and dropping the `100vh` lock below 900 px.
3. **D5, D7, D6, D8** — contained bugs, each an hour or less.
4. **D4** — call `goToTab2()` from `initialTab()`, and push the tab to the URL hash.
5. **Tab 3's message conflict** (§B) — needs a decision, not a patch. See ⚠ below.
6. **Beat the Colonel's round 1** — reserve the uncoupled round until at least one round
   has been played, and add a "no contest" counter distinct from ties.
7. **D11** — at minimum, a numeric/text spike-entry path for the two placement challenges,
   `aria-live` on the score cards, and a focusable file input in Tab 2.
8. **D12** — reclaim the summary panel's 47%, and default the kernel window to the kernel's
   own support.
9. **D9** — build the animation or correct `CLAUDE.md` and `FOUNDATIONS.md`.

---

## Review report

Checked: claim verification against source (every code claim re-verified by an independent
adversarial pass, nine of nine confirmed), internal consistency, figure↔text agreement
between the measured DOM and the prose, and line editing. All numeric claims in this
document were measured in the running app, not estimated.

**Residual ⚠ flags for Tony:**

- ⚠ **Tab 3's machine-vs-message conflict is a judgement call, not a defect.** The 96% F1
  is real and reproducible; whether the right fix is a harder round, a different baseline,
  or different copy is a pedagogy decision that touches FOUNDATIONS §2. Flagged, not resolved.
- ⚠ **Tab 2 was exercised only through the Tab 1 handoff and an empty dropzone.** `data/` is
  gitignored, so no real multi-region `.xlsx` was loaded. Region shading, double-click region
  selection, the regional kernel band and the summary PDF export are **unreviewed**. This
  overlaps the File-98 three-region item already open in `NEXT_SESSION.md`.
- ⚠ **No formal WCAG contrast audit was run.** D15's severity is a judgement from light and
  dark screenshots, not a measured contrast-ratio pass.
- ⚠ **Uncoupled-round behaviour was sampled at six rounds.** The 1-in-3 rate is read from
  the source constant (`rand() < 0.34`), not estimated from play.
