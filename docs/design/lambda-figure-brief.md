# The regularization section, and a brief for its figure

**Status:** the section ships (Tab 0, fold "The dial marked λ"). The figure does not exist yet.
This is the write-up plus the cues for drawing it.

**Why this document.** The λ section is 609 words with no picture, and every murderboard round
across two runs has flagged that — it is the top residual in both
[`tab0-lambda-section_2026-08-22.md`](../reviews/tab0-lambda-section_2026-08-22.md) and
[`tab0-start-here_2026-08-23.md`](../reviews/tab0-start-here_2026-08-23.md). The section is
about the *shape* of a recovered kernel, written for a reader with no signal-processing
background, and it asks them to picture three things they have never seen.

⚠ **Not murderboarded.** Written at end of session as a handoff. Run `/murderboard` on it, and
on the figure once it exists — the figure especially, since role 8's false-friend rule is the
one that most often bites a plot like this.

---

## What the section argues, in order

1. **Convolution and deconvolution, named.** Building a trace from spikes and a kernel is
   convolution; going back is deconvolution, and it is not a clean reversal.
2. **Unchecked, the answer is exact and impossible.** At λ = 0 the reconstruction matches the
   recording to R² ≈ 0.999, and about half the per-frame numbers Tab 3 hands back are negative.
   A spike count cannot be negative.
3. **So the tool asks a narrower question** — not "which kernel reproduces this trace?" but
   "which reasonably *smooth* kernel reproduces this trace?" That insistence is
   **regularization**; **λ** sets how hard you insist.
4. **Three scope facts.** λ drives only the free-vector method (parametric has none, shaped has
   its own fixed penalties, and the stability check sweeps λ itself rather than following the
   slider). Tab 2's λ smooths the *kernel*, Tab 3's smooths the *spikes*. The two λ numbers are
   not comparable, because each competes against a different quantity.
5. **The payoff, and the trap.** Sweeping λ is part of the stability check. A feature that
   appears at one λ and vanishes at the next is a smoothing artifact. **But steadiness is not
   proof** — the penalty has no grip on slow structure, so a drifting baseline or a pre-spike
   step sits unmoved from one end of the slider to the other. A steady sweep buys the absence
   of one kind of error; whether there is a kernel at all is what the other three checks are for.

## The three facts the figure has to carry

All recomputed from the shipped solver (33 spikes, 300 s at 10 Hz, noise 3× cohort σ):

| λ | peak | lag | roughness | DC (slow content) |
|---|---|---|---|---|
| **0.002** — slider min, and the default | 0.10355 | 0.60 s | 9.53e-2 | 1.932e-2 |
| 0.05 | 0.10330 | 0.40 s | 6.81e-2 | 1.935e-2 |
| **3** — slider max | 0.10256 | 0.50 s | 3.69e-2 | 1.935e-2 |
| 3000 — a thousandfold off the slider | 0.08093 | 0.80 s | 5.22e-3 | 1.931e-2 |

1. **Across the whole exposed slider the kernel barely moves.** Peak changes ~1%, lag by one
   sample. What *does* change is roughness — 2.6× smoother from end to end. The dial does
   something; it just is not the something a first-time reader expects.
2. **λ has no grip on slow structure, at all.** The penalty weight is `(2 − 2cos ω)²`, which is
   **exactly zero at DC** and rises as ω⁴:

   | frequency | weight λ multiplies |
   |---|---|
   | 0 Hz | **0** |
   | 0.002 Hz | 5.5e-12 |
   | 0.156 Hz | 9.3e-5 |
   | 1.25 Hz | 3.4e-1 |
   | 5 Hz | 1.6e+1 |

   The DC column above shows the consequence: it moves 0.2% across *six orders of magnitude* of
   λ. A baseline tilt or an acausal pedestal is untouchable.
3. **A decoupled recording is just as steady.** Measured across the same sweep: a coupled
   column's peak amplitude swings ~1%, a decoupled one 9–43% — so the sweep *does* have some
   power on peak amplitude — but on **peak lag** a pure-noise trace is perfectly steady (0.00 s
   range) while the real kernel moves 0.20 s. Steadiness on its own proves nothing.

---

## Figure cues

The reader is a biologist or a curious non-specialist. They do not read log axes, frequency
plots, or equations, and they will not know what "DC" means. Aim for something they can take in
before deciding whether to read the words.

**Cue 1 — Draw the non-event on purpose.** The strongest thing this figure can do is show three
recovered kernels at λ = 0.002 / 0.05 / 3 that look *the same*, and label that plainly:
*"the whole slider, end to end"*. The reader expects a dial to do something dramatic; the honest
finding is that within its exposed range it does not. Let the picture deliver the surprise, then
the caption explains it. **Shared y-axis across all three panels, and say so on the figure** —
three autoscaled panels would manufacture a difference that is not there.

**Cue 2 — Put the artifact in the picture and let it sit still.** Plant a slow baseline tilt (or
a small step *before* the spike) in the same three panels. It survives all three unchanged. This
is the section's most important claim — "surviving the sweep is not proof" — and it is a claim
about something *not moving*, which prose is bad at and a picture is good at. Mark it with an
arrow and four words: *"this never moves"*.

**Cue 3 — Show what the dial genuinely buys, so the figure is not purely negative.** A fourth
panel far off the slider (λ = 3000) where the kernel really has been ironed into a bland bump —
labelled *"far beyond the slider — what over-smoothing actually looks like"*. It gives the
reader the contrast the first three panels deny them, while being honest that they cannot reach
it from the app.

**Cue 4 — One optional panel, if it can be made non-quant: coupled vs decoupled.** Two kernels
side by side, both steady across the sweep, one real and one from a column with no coupling.
Caption: *"both of these hold steady. Only one is a kernel."* This is the sharpest statement of
the trap, but it needs care — it risks reading as "the tool is unreliable" rather than "this
particular check has a narrow job". Cut it before cutting cues 1–3.

### What to avoid

- **No frequency-domain panel.** The ω⁴ table above is the *reason* for cue 2, not the figure.
  Draw the consequence, not the mechanism.
- **No log axis, and no λ values as the only labels.** Label the panels in words first
  ("as low as the slider goes" / "as high as the slider goes"), with λ in small type beneath.
- **No equations, and no "DC".** Say "the slow drift underneath" if you must name it.
- **Do not let the panels autoscale independently** — see cue 1. Cross-panel comparison is the
  entire point, and shared limits are what make it honest.
- **Watch the false-friend rule.** A recovered kernel plotted on a ±5 s lag axis looks like a
  trace over time to anyone who has just scrolled past the premise figure. Title the panels
  "recovered kernel", label the x-axis **"lag from spike (s)"** (not "time"), and keep the
  visual grammar clearly different from the premise figure's bands — the four-methods explainer
  already had to be corrected on exactly this axis label.

### Build notes

Everything needed is already in the bundle and already simulated, so no data question arises:
`buildKernel` → `rasterize` → `convolveOnGrid` → `addAWGN` → `recoverKernel`, the same chain the
table above was measured with (`src/lib/core/`). Two ways to ship it:

- **Static SVG**, generated like the four-methods explainer
  (`scripts/dataset-summary/methods_explainer.py`, rendered via `darkroom/venv`, copied into
  `src/lib/assets/`). Cheapest, print-safe, and reviewable as a file. **If the panels are drawn
  by hand rather than computed, the figure must say so** — that lesson cost the explainer figure
  a blocking finding.
- **Live component**, like `PremiseFigure.svelte`, computed at mount from the solver. More work,
  but it cannot drift from the implementation, and the reader could drag λ themselves. Given
  that the section is *about* a control, this is the better fit if there is appetite.

Prefer computing the panels from the real solver either way. The explainer figure's four panels
were drawn from a single array, which made its bottom-line claim a check that could not fail.
