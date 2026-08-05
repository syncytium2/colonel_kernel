# ADR-0043: Tab 3 overlays true and recovered input in one band

## Status

Accepted
(Display-only; the deconvolution and its readouts are untouched. Adjusts the Tab 3 band layout
inside the ADR-0033 shell, preserving the ADR-0030 co-registration invariant. Records a layout
rule — *the band carrying the x-axis must be paid for it* — that applies wherever equal-height
bands are stacked.)

## Context

Tab 3 stacked three equal-height bands: the measured trace, the true spike train, and the
recovered input. Two problems, one of which was hiding the other.

**The recovered band was drawn 8 pixels tall.** Measured on the deployed site at a 1600×1000
viewport: the first two bands got 71px of plot each, the third got **8px**. All three had the
same 105px body — the difference is that the bottom band is the one carrying the x-axis and its
`time (s)` label, and uPlot spends roughly 60px on that. An equal split of the *container* is not
an equal split of the *plot* when one band pays a fixed tax out of its share.

At 8px nothing is legible, and worse, it actively misleads: Tony read the recovered trace as
having **negative** deflections aligned with the spikes and asked whether the math was wrong.

**The math was not wrong.** Checked directly against the default signal: the recovered value at
every one of the 33 true spike times is **positive**, +0.23 to +0.29, and the negative excursions
(min −0.067) occur only *away* from spikes. That is the regularized inverse's ringing — the thing
this tab exists to display (FOUNDATIONS §2). The apparent sign flip was an artifact of an 8px
plot, not of `inferSpikes`.

## Decision

1. **Superimpose the true spikes and the recovered input in one band**, freeing a third of the
   column. True spikes stay ink stems, recovered stays the purple line, on **one shared y-axis**.
2. **The shared axis is the point, not a compromise.** The recovered estimate is in the same
   units as the input it estimates, so a perfect recovery would reproduce unit-height deltas. On
   one axis the reader sees directly that naive deconvolution returns a peak about **0.3× a true
   spike**, smeared across samples, with ringing in between — which is exactly what the summary's
   `PEAK / TRUE ×0.3` and `RECOVERED < 0 47%` readouts say in numbers. Two separate y-axes, each
   auto-scaled to its own series, had been *hiding* that amplitude gap by drawing both at full
   height.
3. **The band carrying the x-axis gets a basis head start**: `flex: 1 1 60px` against its
   neighbour's `1 1 0`, equal grow. This hands back what the axis costs, so the two **plots** end
   up the same height rather than the two containers. Measured after: 123px and 119px, against
   71/71/8 before.
4. **An inline key**, since the band now holds two series and identity must not rest on color
   alone — a stem swatch and a line swatch, using the ADR-0041 tokens.

## Consequences

- **The tab now shows what it always computed.** Nothing about the recovery changed; it is merely
  large enough to read. The recovered peaks visibly sit *on* the spikes.
- **A general layout rule, and the other two tabs were measured against it** (1600×1000, live):

  | | trace band | axis-carrying band |
  | --- | --- | --- |
  | Tab 3 (fixed here) | 123px | 119px |
  | Tab 2 | 117px | **86px** → 101/101 (ADR-0045) |
  | Tab 1 | 198px | **45px** → 167/76 (ADR-0045) |

  Both are the same tax, neither is broken enough to act on unasked. **Tab 2's raster is meant to
  be *co-equal*** — ADR-0026 promoted it to first-class precisely because it is the recovery
  input — so 86-against-117 quietly under-delivers on a settled decision. **Tab 1's 45px** is
  partly this ADR's own doing: [ADR-0040](0040-tab1-band-order-follows-tab0.md) capped that band
  at 172px reasoning about the *body*, and the plot inside it is 45px, thinner than the ~76px
  Tab 0 gives its raster. ADR-0040 has been annotated with the correction. Both were queued rather
  than swept into this change, and are now closed by
  [ADR-0045](0045-close-axis-tax-and-csp-style-attrs.md) — which found that Tab 2's case
  *delivers* ADR-0026's co-equal intent rather than revisiting it.
- **Measure plots, not containers.** Every one of these was invisible from the markup and obvious
  from one `boundingBox()` on `.u-over`. Worth doing after any band-proportion edit.
- **Co-registration preserved and verified**: both bands' plot areas measure identical
  (x = 416…1535 at 1600px wide), the ADR-0030 / FOUNDATIONS §11.5 invariant.
- **The screenshot was the bug report, and the numbers were the diagnosis.** Reading "negative
  spikes" off an 8px strip was reasonable; the fix was to check the recovered value at the spike
  times rather than argue with the picture. Worth remembering that a collapsed plot can invert
  apparent sign.
- 237/237 core tests, clean build; no core change, no canon change.
- Relates to: [ADR-0033](0033-shared-plot-shell-square-kernel.md) (the shell and its bands),
  [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md) (the invariant preserved),
  [ADR-0040](0040-tab1-band-order-follows-tab0.md) (the sibling band-proportion decision on
  Tab 1), [ADR-0041](0041-plot-series-palette-one-color-per-quantity.md) (the tokens the key
  uses), [ADR-0042](0042-noise-on-by-default-kernel-band-key.md) (the noise this trace now
  carries, which makes the ringing more pronounced than it was).
