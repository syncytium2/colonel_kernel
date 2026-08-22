# Murderboard run — Tab 0 §"The dial marked λ" (+ the two λ slider help controls)
- upstream:  syncytium2/murderboard @ f26414a
- vendored:  f26414a (re-vendored during this run — the freshness gate exited 1 at call-up
  against `729fb06`; landed on master as `5086eb0` before any review began)
- freshness: current
- artifact:  the BUILT, rendered section from `npm run preview`, captured by Playwright.
  `t0-lambda-1000-light.png` `936bf5da` → `8690ce4c`;
  `t2-lambda-1000-light.png` `d06564f1` → `e6519ee3`;
  `t3-lambda-1000-light.png` `5ebe4a71` → `5cda8cf1`.
  Generator `src/lib/Help.svelte` `e79660ad` → `b691de3a`.
- roles:     11 of 11 run (round 0), 11 of 11 re-run blind (rounds 1 and 2)
- rounds:    2 blind verify rounds. **STOPPED UNCONVERGED — severity not falling.**

## The problem this section was written to solve

A first-time visitor to colonel_kernel met λ as a bare Greek letter on a slider. It appeared
twice — inside Tab 2's default-collapsed **Advanced** fold, and on Tab 3 — with no explanation
anywhere in the app. The only prose on it was `methods.html` §5, which opens with an argmin
over a discrete Laplacian operator: correct, citable, and useless to the biologist the tool is
also built for. Tab 0, the on-ramp, contained the word "regularization" zero times.

## What the review found, and why it matters more than the section

The draft was fluent and confidently wrong about the thing it was teaching. The review's
central result is not a wording defect; it is that **the section's scientific advice was
inverted**, and three independent roles proved it numerically against the shipped solver
rather than arguing about it:

- The draft told the reader that λ too low gives a ringing kernel and λ too high irons real
  features flat, and to turn the dial to see it. Measured across Tab 2's **entire** exposed
  range (0.002–3): the recovered peak moves ~1–2% and the lag not at all. A "bland bump"
  needs λ ≈ 3000 — a thousandfold past the slider maximum. The bullets described regimes the
  reader cannot reach, so following the instruction shows them nothing.
- The reason is structural and the project already knew it: the penalty is `(2−2cos ω)²`,
  exactly zero at DC and rising as ω⁴, so λ has **no grip on slow structure**. Measured: a 58%
  DC error sat unchanged across seven orders of magnitude of λ. `methods.html` §12 already
  names this "Laplacian low-frequency blindness", and §5's callout already names the acausal
  pedestal it produces. The draft nonetheless taught λ-sweep survival as a trust check without
  saying what it cannot catch — precisely the "can the alarm ring?" failure, aimed at the
  advice rather than at a result.
- On Tab 3 the same machinery smooths the **spike train**, not the kernel. A smoothness prior
  on a spike train is the wrong prior — the opposite of the sparsity/non-negativity route
  OASIS takes — so raising λ there makes the answer worse, not cleaner. The draft's bullets
  said "the kernel" and were simply false for one of the two sliders they served.

Two further defects were structural rather than textual. The section was **unreachable from
the sliders it explained** (both linked outward to the equations, so the naive reader still
met the argmin), and the first fix for that — routing the "?" to Tab 0 in place — **destroyed
the reader's session**, because Tab 2 is mounted under `{#if tab === 2}`. Moving λ to 2.000,
clicking help, and returning gave a collapsed fold and λ back at its 0.0020 default; a loaded
recording would have gone the same way.

## What would validate this, and what still would not

The section now states the narrow claim the mathematics supports: a feature that vanishes as
λ moves is a smoothing artifact, and **steadiness is not proof**, because the artifacts that
matter most sit in the penalty's blind spot. That claim is verified. What is **not** yet in
place is the thing three separate roles asked for across all three rounds: a picture. The
section is ~400 words of prose about a *shape*, on a page that twice demonstrates it can draw
one, and the app already computes the exact sweep the figure would plot.

## How this generalises

Two lessons outlive this section. First, **a fluent draft about a method you did not write is
the dangerous case** — every wrong claim here was plausible, house-style, and consistent with
the surrounding prose; only recomputation caught them. Second, **fixing a review finding is
authoring new unreviewed text**: both blocking findings in round 2 were created by round 1's
fixes, and one of them (a contrast token darkened for light mode and applied to both) made
dark mode worse than before the fix. The blind-first re-review is what surfaced them.

---

# Appendix A — role ledger

Round 0 = initial review, 11 parallel subagents. Rounds 1–2 = blind re-review of the repaired
artifact, reviewers given the renders and sources and told nothing of prior findings or edits.

| # | Role | R0 | R1 (blind) | R2 (blind) | Representative finding |
|---|---|---|---|---|---|
| 1 | Prove It | 8 | 5 | 7 | Both failure bullets describe λ regimes neither slider reaches (peak moves <0.2% across 0.002–3) |
| 2 | DOI or Die | 4 | 4 | 2 | `methods.html` §5's `deconvreg` claim is false against MathWorks docs; eq. (4) uses λ² where the solver uses λ |
| 3 | Cross-Examiner | 12 | 5 | 5 | "four trust checks" is a coined term; canonical is "four goodness-of-fit checks" (1 repo hit vs 8 files) |
| 4 | Reviewer 2 | 11 | 9 | 4 | λ sweep has no power against slow artifacts; "surviving = real" is the unsafe converse the draft invited |
| 5 | Kill Your Darlings | 13 | 13 | 5 | "convolution" never defined anywhere on Tab 0 before this section leans on it |
| 6 | RTFM | 9 | 9 | 4 | Tab 3's λ smooths the spike train; opposite prior to OASIS (eq. 3), opposite monotonicity |
| 7 | Reinventing the Wheel | 6 | 6 | 5 | `.ctl > span` over-scoped to 8 controls to serve 1; three duplicate link rules; `.field-lab` already existed |
| 8 | You Lost Me | 11 | 10 | 6 | **Clicking "?" destroyed the reader's Tab 2 session** (reproduced: λ 2.000 → 0.0020) |
| 9 | Show, Don't Tell | 6 | 6 | 3 | 0% figure in the page's longest prose section, on a visual claim; named 3 buildable replacements |
| 10 | Ship It | 7 | 7 | 5 | "?" orphaned into the gutter between two wrapped label lines at 940–1220px; contrast 4.39:1 |
| 11 | Start With the Problem | 5 | 6 | 3 | Section names Tab 2/Tab 3 before the tab roster introduces them; opens on mechanism, not stake |

No role returned "nothing to check" in any round.

# Appendix B — findings by severity per round (the convergence evidence)

| Round | Blocking | Major | Minor | Stopping signal |
|---|---|---|---|---|
| 0 (initial) | 6 | ~34 | ~52 | — |
| 1 (blind) | 2 | 21 | ~30 | falling — continue |
| 2 (blind) | 2 | 7 | 18 | **flat blocking — STOP AND ESCALATE** |

**Stopping reason: severity not falling.** Blocking held at 2 across two blind rounds. Per the
process, a flat blocking count after two rounds means patching will not retire the problem and
the human must decide. Majors and minors fell steadily (34 → 21 → 7, 52 → 30 → 18), and both
round-2 blocking findings were *introduced by round-1's fixes* rather than being survivors —
which is the round-manufactures-its-own-surface effect the process documents. A third round was
not run.

# Appendix C — fixes applied

**Corrected against recomputation:** the two failure bullets (unreachable regimes) replaced
with what λ actually governs; "surviving the sweep is not proof" plus the blind-spot mechanism;
Tab 2 kernel vs Tab 3 spike-train split, with both ranges stated and their incomparability
named (~10⁴ apart); λ scoped to free-vector only, with the stability check noted as sweeping λ
itself rather than following the slider; the three dedicated tools given their actual methods
(supervised / biophysical / non-negative + sparse) after two rounds got this wrong; "reproduces
exactly" → "almost perfectly" (R² = 0.99935); "four trust checks" → "four goodness-of-fit
checks", correctly as *part of* the stability check; "shape-regularized" → "shaped" to match
the UI; "convolution" and "deconvolution" defined at first use; the false `deconvreg`
generalisation deleted rather than restated.

**Structural:** both sliders now reach the section via `#lambda` in a **new browser tab**, so
Tab 2's session survives — verified by moving λ off its default first, since a test run at the
default cannot detect a reset to the default.

**Craft:** "?" restored to one line at all widths tested (was orphaned in the gutter at
940–1220px); `box-sizing` makes it 16×16 like its twin; 24×24 hit box; three duplicate link
rules folded into a global `.out-link`; a `--link-accent` token so light mode clears WCAG 1.4.3
at 6.15:1 **without** the first attempt's regression, which had taken dark mode from 6.77:1 to
2.91:1; stray underline on the anchor-flavoured `.help-btn` reset.

**New gate:** `methods-url.js` exports its anchors and `core.test.mjs` asserts each exists —
including the in-app `#lambda`. Verified by negative control: renaming an anchor fails the
suite, restoring it passes. 268 tests, 0 failures. No new Svelte build warnings (5 before,
the same 5 after). Zero third-party requests; CSP intact in the shipped HTML.

# Appendix D — residual ⚠ (the deliverable is NOT "done")

1. **⚠ No figure.** Flagged by role 9 in all three rounds and by role 8 twice. ~400 words of
   prose about a shape. Named replacement, buildable from modules already in the bundle and
   from simulated data (so repo hygiene is untouched): a small-multiples strip of the same
   kernel recovered at three λ on **shared y-limits with the true kernel ghosted**, plus a
   sweep plot overlaying a coupled and a decoupled column. Role 9 notes drawing the second one
   is what would have caught the round-1 blocking finding, since the two curves do not overlay.
2. **⚠ `methods.html` §5 misdescribes MATLAB `deconvreg`** — "no exposed parameter … the
   smoothing happens silently" is false: `lrange` sets the multiplier (scalar pins it), `regop`
   replaces the operator, and `lagra` is returned. `FOUNDATIONS.md:407` repeats it as "silent
   Laplacian". The true statement is about the lab's own two-argument call site
   (`TDdeconvStack.m:63`), not about the function. **Canonical documents — your edit, not mine.**
3. **⚠ `methods.html` eq. (4) writes the penalty as λ²; the solver computes λ.** Confirmed by
   three roles across two rounds, and the code's own docstring agrees with the code. The app's
   slider is therefore eq. (4)'s λ². A one-character fix in the document, or a change to the
   code — but the λ range and the stability sweep are calibrated to the current convention, so
   this is a decision, not a typo. The section links this equation as "The equations behind λ".
4. **⚠ Section position — two runs of role 11 disagree.** Round 0 judged position 6 correct and
   argued against moving it (§5 and §6 form one argument). Round 2 argued for moving it below
   "Your first run in 30 seconds", because it forward-references Tab 2, Tab 3 and the four
   checks before the page introduces any of them. Both are reasoned; I did not flip it on a
   split vote. The deep link is unaffected either way.
5. **⚠ Tab 3's λ input carries two labels** (`input.labels.length === 2`), so its accessible
   name includes the live value — "Regularization λ λ 0.05". Pre-existing; Tab 2 was
   restructured away from this pattern during the review and Tab 3 was not.
6. **⚠ No ADR.** This shipped a user-facing Tab 0 section, a `#lambda` deep-link contract, and
   a new shared module. ADR-0050 and ADR-0051 each got one for comparable changes.
7. Minor, recorded not fixed: Tab 2's slider tops out at 2.958 rather than 3 (log step
   overshoot) while the text says 3; `.help-btn`'s 1.25:1 ring contrast (pre-existing, shared);
   "opens in a new tab" is in an `aria-hidden` ↗ on two of three controls; the tool-name order
   differs from the canonical CASCADE/MLspike/OASIS in seven other files; the reduced-motion
   scroll idiom is duplicated in `App.svelte` and `Help.svelte`; page-level horizontal overflow
   of 84px at ≤380px caused by the tab row (pre-existing, not this change).
