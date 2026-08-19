# ADR-0051: Tab 3 separates the extraction trace from the spike raster — and sizes them by what they are

## Status

Accepted
(**Supersedes [ADR-0043](0043-tab3-overlay-true-and-recovered-input.md)'s overlay.** ADR-0043's
*layout rule* — the band carrying the x-axis must be paid for it, measure `.u-over` and never
the container — stands, and is generalized below. Adds an opt-in `compactTop` to the shared
shell; no other tab moves.)

## Context

ADR-0043 superimposed the true spikes and the recovered input on one shared y-axis, to make a
real point: the recovered estimate is in the *same units* as the input it estimates, so a
shared axis shows directly that naive deconvolution returns ≈0.3 of a unit spike. It fixed a
genuine bug (an 8px band that made a positive peak read as negative) and it made that one
comparison legible.

It also cost the tab its subject. Unit-height stems own a shared axis, so the recovered
trace — **the output of the tab, its whole reason to exist** — was drawn inside the bottom
third of one band, and the ringing and **negative lobes** that FOUNDATIONS §2 keeps this tab
for were a few pixels of wobble at the baseline. Tony's report: *"i thought we decided to
separate the spike raster and the extraction trace. spike raster can be a third its current
size, while the extraction trace [the showpiece of the tab] is tiny and not scaled."*

The AP-independent dial (ADR-0049/0050) sharpened it further: with contamination on, the most
interesting thing on the tab is the *shape* of the spikes the inversion invents under calcium
no spike caused — detail that a bottom-third-of-a-band rendering cannot show at all.

## Decision

1. **Three bands, not two:** measured trace (context) → **recovered input** (the showpiece) →
   true spikes (a short strip). The two input-space objects stay adjacent so they can still be
   compared; only the axis they share is given up.

2. **The recovered input gets its own y-scale**, and says so: its header reads
   `own y-scale · peaks at ×N of a unit spike`. The magnitude fact ADR-0043 wanted does not
   need the axis to carry it — it is a number in the readout (`PEAK / TRUE`) and now a phrase
   in the band's own header. The ringing *does* need the axis. Labelled independent scaling is
   what ADR-0024 permits; unlabelled rescaling is what ADR-0029 forbids, and this is the former.

3. **`compactTop` on the shared shell.** The fixed top row is `clamp(300px, 42vh, 480px)`,
   sized for tabs whose kernel square is the *result*. Tab 3's square shows the **assumed**
   kernel — an input the user already chose on Tab 1 — and measured 399px of top row against
   397px for three bands, which is what left the raster a 0px plot. Tab 3 opts into
   `clamp(190px, 24vh, 300px)`, and to `clamp(130px, 20vh, 200px)` under `max-height: 820px`.

4. **BASIS = CHROME, GROW = PLOT.** Equal `flex-grow` does not produce comparable plots,
   because chrome is not equal between bands — measured here: **82px** for a band with no
   x-axis (26 header + 4 margin + 16 padding + 2 border + 34 inside uPlot) against **145px**
   for the one drawing the x-axis and its `time (s)` label. With `flex: 1 1 0` the raster's
   entire 149px share disappeared into chrome and its stems got **4px**. Each band now
   declares its own chrome as the flex **basis** and its share of the remainder as the
   **grow** (1 : 2.4 : 0.7), so those ratios are ratios of real plot height. This generalizes
   ADR-0043's `flex: 1 1 60px` head start from a two-band special case to a rule.

5. **Short viewports shrink the CHROME, not the plots.** Under `max-height: 820px` the band
   padding, header type and flex bases all shrink together, because at 700px tall three bands
   were spending ~309px of a ~360px band area before a sample was drawn.

## Consequences

- **Measured, at 1500×950:** plots are **62 / 124 / 49px** (trace / recovered / raster) against
  the old 123 / 119 where the recovered trace occupied roughly the bottom 40px of its band. The
  showpiece gains ~3× usable vertical range; the raster lands at about a third of the band it
  used to share, as asked. At **1200×700**: 36 / 71 / 29 — proportions held, nothing collapsed.
- **Co-registration verified, and a break caught by measuring.** All three plots span an
  identical x extent (430…1435 @1500px). The first cut did **not**: a y-LABEL is part of axis
  geometry, not decoration, and labelling two of three bands pushed the unlabelled one 22px
  left (408…1435 vs 430…1435). All three now carry a y-label. §11.5 holds.
- **Two layout defects were found only by measuring `.u-over`**, exactly as ADR-0043 warned:
  `flex: 0 1 auto` on a `min-height: 0` band collapses its plot to 3px, and the y-label shift
  above. Neither is visible in a screenshot at a glance.
- **The inline two-series key is gone** with the overlay that needed it; each band now names
  its own single series, so identity is never left to color alone (ADR-0041).
- **Residual:** below ~650px of viewport height the three bands are still cramped. That is the
  same cliff [NEXT_SESSION](../../NEXT_SESSION.md) already tracks as open item 2, not a new one.
