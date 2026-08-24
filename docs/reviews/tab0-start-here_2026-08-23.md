# Murderboard run — Tab 0 "Start here", after the cut-to-minimum restructure
- upstream:  syncytium2/murderboard @ fae0eca
- vendored:  fae0eca (re-vendored at call-up — the gate exited 1 against `f26414a`, itself
  vendored earlier the same day; landed on `main` as `1cbfa5b` before any review began)
- freshness: current
- artifact:  the BUILT, rendered Tab 0 from `npm run preview`, captured by Playwright in both
  shipped states (folds closed, folds open) at 1400/1000/620/380 px in light and dark.
  `tab0-closed-1000-light.png` `882f971b` → `ff26baf2`.
  Generators: `Help.svelte` `01db19d7` → `28a266f3`; `PremiseFigure.svelte` `105b79f2` →
  `7f1f5976`; `methods_explainer.svg` regenerated → `f67d307e`.
- roles:     11 of 11 run (round 0), 11 of 11 re-run blind (round 1)
- rounds:    1 blind verify round. **STOPPED UNCONVERGED — see the severity table.**

## The problem this restructure was solving

Tab 0 was **1,649 words over 5,234 px — about six screens** — written as a patient on-ramp for
a naive researcher working through the tool. That reader is a small minority of the traffic.
Most arrivals are skimming: someone curious after hearing about the project, or someone
reading the author's résumé, with a thin slice of actual users. The page asked all of them for
six screens before it said what it does.

The cut: keep the argument visible — what this is → the problem, as a live figure → that it is
rigorous → where to go — and **relocate everything else into five collapsed `<details>` folds
on the same page**. Nothing deleted; every word still ships, one click deep, with both deep
links (`#lambda`, `#bring-your-own`) opening their own fold on arrival.

**Result: 509 visible words over 2,095 px, ~2.3 screens.** The skim path survived; the review
is about what the fold did to everything it moved.

## What the review found, and why it matters more than the word count

**Folding removed the pressure, not the problem.** The λ section is 571 words with no figure —
flagged by role 9 in every round of both this run and the previous one. Folding it stopped
anyone noticing, which is not the same as fixing it. It is also the one fold *entered from
outside* (both λ sliders' "?"), so its reader arrives with no context at all.

**The page asked the reader to do something impossible.** The premise paragraph said "look at
the tick row beneath each one, and it is empty". At the default full-record view each shaded
band is **~7 px of a ~660 px axis** inside a raster of 139 ticks. The page's central claim was
unverifiable at the only view it ships in. Zoomed, the evidence is unmistakable — so the
instruction now sends the reader to the zoom.

**And in dark mode the figure said the opposite of its caption.** The warm shade composites
*brighter* than the dark ground — the same polarity as the white spike ticks — so a 7 px band
renders as a fat tick sitting exactly where the caption says the row is empty. A warm colour
cannot be made darker than a near-black ground, so the shade is now theme-aware.

**Two claims were false against the code the page ships.** "Colonel Kernel makes no network
requests at all" is contradicted by the template button three lines above it (a 487 kB chunk),
and it overclaimed past the project's own canon — FOUNDATIONS §6 forbids *third-party*
requests and its verification ritual reads "confirm only same-origin requests". And the fold
titled "The four recovery methods" sat directly above prose saying three; canon is
unambiguously three, with STA as §7's *validation partner* that "solves no inverse problem".

**The figure everyone trusted is a drawing.** `methods_explainer.py` draws all four panels from
one `k_true` array — free-vector is `k_true + noise − tilt`, STA is a box blur. Its bold bottom
line, "If a real kernel exists, all four roughly AGREE", is therefore **a check that cannot
fail**: the agreement is a property of the drawing. The figure now says so on its face.

## What would validate this, and what still would not

Everything asserted about λ, the recovery methods, the checks, the file format and the premise
simulation was recomputed against the shipped modules — 40+ claims across two rounds, with the
disagreements resolved by running the solvers rather than by argument. What is **not** yet in
place is the thing three roles asked for in both runs: **the λ section is still prose about a
shape.** Until it carries the figure, its counter-intuitive claims are asserted, not shown.

## How this generalises

**Folding content is a scope change, not a layout change.** Everything moved behind a fold
kept its defects and lost its scrutiny, and the two heaviest folds (λ, the file format) are the
two with inbound links from elsewhere — so the material least likely to be read on the skim
path is the material most likely to be arrived at directly.

**A fix is new unreviewed text, and the second round proves it.** Round 1's blocking list is
dominated by defects in *adjacent* components the cut exposed rather than caused, plus two I
introduced while fixing round 0. One of my contrast fixes made dark mode worse than before it
(6.77:1 → 2.91:1) by fixing the theme I was looking at.

**Test at a value that can fail.** Two separate state-preservation checks in this run were
initially run with the control at its default — the one value a reset restores — and reported
a clean pass. Both were re-run off-default and one of them then failed.

---

# Appendix A — role ledger

| # | Role | R0 | R1 (blind) | Representative finding |
|---|---|---|---|---|
| 1 | Prove It | 5 | 4 | "no network requests at all" falsified by the template button three lines above it |
| 2 | DOI or Die | 5 | 3 | CASCADE / MLspike / OASIS verified correct against primary sources; named on Tab 0 with no route to the citations |
| 3 | Cross-Examiner | 10 | 10 | fold titled "four recovery methods" directly above prose saying three; canon is three + a validation partner |
| 4 | Reviewer 2 | 7 | 7 | the explainer's bottom-line claim is unfalsifiable — all four panels drawn from one array |
| 5 | Kill Your Darlings | 9 | 8 | "tall" applied to the shorter of the two events it contrasts (0.14 vs 0.26 dF/F₀) |
| 6 | RTFM | 8 | 8 | STA does not "just average the trace around each spike" — it rejects crowded spikes, skips the endpoints, and subtracts a per-event baseline |
| 7 | Reinventing the Wheel | 6 | 7 | `premise-sim.js` re-derives the exported `apIndependentTrace()` and a second onset-placement algorithm |
| 8 | You Lost Me | 11 | 11 | the page's central instruction cannot be executed at the view it ships in |
| 9 | Show, Don't Tell | 6 | 6 | λ fold: 571 words, 0% figure, the most-linked destination in the app |
| 10 | Ship It | 17 | 17 | `#lambda` landed 46–73 px past the only heading and pushed the tab bar off-screen — invisible under reduced motion, where it worked |
| 11 | Start With the Problem | 7 | 7 | the cold open is right; "More, if you want it" labels required reading as optional |

No role returned "nothing to check" in either round.

# Appendix B — findings by severity per round

| Round | Blocking | Major | Minor | Signal |
|---|---|---|---|---|
| 0 (initial, 11 roles) | 3 | 16 | ~25 | — |
| 1 (blind, 11 roles) | 5 live¹ | 25 | 43 | **not clearly falling — STOP** |

¹ One blind group reported 7 blocking, but measured a bundle predating several round-0 fixes
and said so; three of its seven (the "four ways" figure text, the nested spec fold, the "?"
accessible name) were already fixed when it measured. Five were live. All five are now fixed.

**Stopping reason: severity not clearly falling.** The process treats a flat or rising blocking
count after a round as a signal to escalate rather than patch again, and the honest reading
here is that the count did not fall. The character of the findings changed, though: round 0's
blocking findings were *in the restructure*; round 1's were mostly in **adjacent components the
restructure exposed** — the premise figure's dark-theme shading, the download CTA's contrast,
the deep-link scroll. That is a widening scope, not a failing artifact, which is exactly the
judgement the escalation rule exists to hand to a human.

# Appendix C — fixes applied

**Blocking.** The false network-requests claim, in both places, replaced with the accurate one
("no backend… the only requests this page makes are for its own code"). Four→three recovery
methods, in the fold title, the prose, the caption, the alt text **and the regenerated SVG**.
`dF/F₀` and `kernel` both defined on the visible spine — "kernel" hoisted out of a fold, being
the noun the product is named after and previously used four times before it meant anything.
The premise instruction now sends the reader to the zoom instead of asking them to read a 7 px
band. Theme-aware `--premise-shade`, so the dark-mode band stops reading as a tick. The λ
deep link lands at 0 px on its heading with the tab bar on screen, at every viewport tested and
under reduced motion — by scrolling the container explicitly rather than `scrollIntoView`,
which overshot and moved the window. The primary download CTA moved to a new `--accent-solid`
token; white on it is 7.45:1 in both themes, against 4.39:1 light / **2.64:1 dark** before.

**Major.** The unsupportable "ten thousand times smaller" removed (recomputed 616×, and it
swings 6×–15,000× with the recording). "One distorted kernel" replaced with what the solver
does — decay pulled short, fit collapsing. STA described as it is implemented, with the
high-spike-rate caveat ADR-0005 calls expected and benign. "Independent" softened to what is
actually true. OASIS given its real relationship to this tool (same route, opposite prior).
Free-vector no longer described as solving "one sample at a time". The λ bullets no longer read
as self-contradicting. The hero leads with the job. The inert "Full width" control no longer
renders on Tab 0. The nested file-format fold now opens from the link that promises it.

**Craft.** All Tab 0 text passes WCAG 1.4.3 in **both** themes with folds open, measured against
the true composited background. The `▸` marker is out of the summaries' accessible names.
`.sr-only` moved to `app.css` with the reason the neighbouring rule gives. The figure's
description is screen-reader-only but verified present in the AX tree. File-format corrections
against `load-xlsx.js`: case-insensitive headers, the two exact region names, the 12-minute
floor, the wash-in exception, and the CSV spike column.

**Gates.** 268 tests pass (including the anchor assertions, negative-control verified). No new
Svelte warnings versus `main` — the same 5 both sides. Zero console errors. **Zero off-origin
requests** in every configuration and flow. No duplicate element ids in either state.

# Appendix D — residual ⚠ (the deliverable is NOT "done")

1. **⚠ The λ fold is 571 words with no figure.** Flagged by role 9 in all four rounds across
   two runs. Named replacement, buildable from the shipped solver: the recovered kernel at
   λ = 0.002 / 0.05 / 3 on shared axes with the DC error printed under each (the curves sit on
   top of each other — that *is* the "λ barely dents it" claim), plus |Lap(ω)|² against
   frequency so "zero at DC, grows as ω⁴" is a shape rather than a sentence.
2. **⚠ The explainer figure's panels are still drawings.** Now labelled as such, which was the
   blocking part. Making it evidence means computing the panels from `recoverKernel` /
   `recoverKernelParametric` / `recoverKernelShaped` / `spikeTriggeredAverage`. Two smaller
   defects live in the same asset: the "rise" label is struck through by its own curve, and
   the dashed true-kernel reference is unlegended.
3. **⚠ `methods.html` §5 misdescribes MATLAB `deconvreg`** ("no exposed parameter… the
   smoothing happens silently" — `lrange` sets it, `regop` replaces the operator, `lagra` is
   returned), and **eq. (4) writes the penalty as λ² where the solver computes λ** — confirmed
   independently in both runs. FOUNDATIONS.md:407 repeats the first. Canonical documents;
   the λ²-vs-λ choice recalibrates the slider range, so it is a decision, not a typo.
4. **⚠ `premise-sim.js` re-derives production code** — the AP-independent stamping loop is a
   near-literal copy of the exported `apIndependentTrace()` (comment included), and
   `placeInQuietGaps` is a second onset-placement algorithm whose canonical sibling's docstring
   claims they are the same thing. A future `timescale` change moves the slider and leaves the
   figure behind.
5. **⚠ The premise figure at ≤380 px** — 139 ticks in a 302 px raster read as a solid bar and
   the bands narrow to ~2 px, so the figure's argument is invisible on a phone. Same for the
   explainer SVG, whose axis text lands at ~2.3 px at 380 px.
6. **⚠ The static fallback PNG contradicts the live figure** — it shades each event across its
   whole decay, and those bands visibly contain spikes. Labelled inline; regenerating it is a
   darkroom job.
7. **⚠ No ADR** for the restructure, the fold contract, or the `#lambda` deep link.
8. Minor, recorded not fixed: `figcaption` is not first/last child of `<figure>`, so the live
   zoom state line joins the figure's accessible name and changes as the reader zooms; the
   raster band's 0–1 y-ticks are meaningless on a raster; "violations"/"unexplained events"/
   "shaded stretches"/"AP-independent" are four names for one thing; `ROI`, `ephys` and `hiK`
   are undefined in the file-format fold; the Tab 3 card is a non-clickable `div` that reads as
   loose text to assistive tech; `→` and `↓` leak into two accessible names; page-level
   horizontal overflow of 9–84 px at 380 px (pre-existing, outside Tab 0); and role 11 would
   reorder the folds cheapest-first.
