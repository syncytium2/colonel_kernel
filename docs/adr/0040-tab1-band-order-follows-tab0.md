# ADR-0040: Tab 1 stacks output above input, following Tab 0's premise figure

## Status

Accepted
(Display-only. Adjusts the Tab 1 band arrangement inside the ADR-0033 shell; the ADR-0030
co-registration invariant is preserved and verified. No core change, no canon change.)

## Context

Tab 1 stacked its two time bands input-first: the spike train on top, the synthesized dF/F₀
output below it. That ordering reads as the pipeline's *data flow* (input, then output), but it
puts the object of interest second. The calcium trace is what the tab is about — it is what a
real experiment actually measures, and the thing Tab 2 then tries to invert. The spike train is
the thing that produced it.

Two places in the app already stacked them the other way. Tab 0's premise figure
(`PremiseFigure.svelte`) puts the calcium trace on top with a short spike raster beneath, and the
Tab 1 challenge view (`FitTheTrace.svelte`) puts the reconstruction on top with the user's spikes
beneath. So the Learn view of Tab 1 was the odd one out, including against the challenge view
sitting one button away from it.

Tony raised both points: the spike train should sit below the trace, and Tab 0's layout is the
one to follow.

## Decision

**Tab 1's Learn view adopts Tab 0's premise-figure arrangement.**

1. **Output on top, input beneath.** The x-axis and its `time (s)` label move to the lower
   (spike) band. Which band carries the axis is free: co-registration is held by equal
   `padRight` and equal `yAxisSize`, not by both bands drawing an axis (ADR-0030).
2. **Each band named on its y-axis** — `dF/F₀` and `spikes`, as on Tab 0 — rather than by the
   band header alone. `yAxisSize` goes 48 → 54 on **both** bands to fit the labels; equal is the
   part that matters.
3. **The trace gets the height; the raster is a short strip** (~136px of band *body*, matching
   Tab 0's figure). The raster carries one bit per sample, so height beyond legibility buys
   nothing.

   > **Correction (ADR-0043).** "136px of body" is not 136px of *plot*. The raster band is also
   > the one drawing the x-axis and its label, ~60–95px of uPlot chrome paid out of its own
   > height, so the measured plot area is **45px** — thinner than intended, and thinner than
   > Tab 0's raster (whose own 136px likewise includes its axis, leaving ~76px). The band order
   > and the cap-not-fixed-height decision below stand; only this pixel claim was wrong.
   > [ADR-0043](0043-tab3-overlay-true-and-recovered-input.md) states the general rule and fixes
   > the case where it actually broke something.
4. **The strip is a CAP (`max-height`), not a fixed height.** This is the one place Tab 0 could
   not be copied literally. Tab 0's figure sits in document flow, where the trace always has
   room to fill; Tab 1's bands divide a viewport. A fixed raster height held its 136px while the
   trace shrank underneath it — measured, the trace fell *below* the raster at ~1100px wide
   (122px vs 136px) and to 0px below the 900px breakpoint. Capping lets both shrink together:
   the intended proportion holds where there is room, and degrades evenly where there is not.

Deliberately **not** changed: the colors. Tab 0 draws calcium blue (`#1f77b4`) and spikes red
(`#d21f3c`); Tab 1 keeps teal (`#2a9d8f`) and a neutral raster. Unifying them is defensible but
is a palette decision, not a layout one, and Tab 1's teal is named in user-visible copy that
ADR-0031 introduced ("teal = clean · faint = noisy"). Flagged for Tony rather than folded in.

## Consequences

- **The two Tab 1 views now agree**, and both agree with Tab 0. Toggling "Fit the trace" no
  longer reverses the vertical order of the same two quantities.
- **Co-registration verified, not assumed.** Both bands' plotting areas measured identical at
  x = 488…1619 on a 1728px viewport — the ADR-0030 / FOUNDATIONS §11.5 invariant that a
  sheared-geometry pair once broke.
- **Measured band heights** (plot body, trace | raster): 300 | 142 at 1728×1117, 174 | 142 at
  1440×900, 129 | 129 at 1100×800, 0 | 0 at 880×800. The trace dominates wherever there is room
  to.
- **The ≤900px collapse is untouched and still open.** Both bands reaching 0px there is the
  known review finding (NEXT_SESSION "Next action" item 2), pre-existing and out of scope here;
  the cap was chosen so this change does not make it worse.
- **Deliberately unlike Tab 2.** ADR-0026 gives Tab 2's raster *co-equal* height because there
  it is the recovery **input** — the thing being consumed. On Tab 1 it is an illustration of
  what produced the trace. Same two quantities, different job, different weight.
- Relates to: [ADR-0033](0033-shared-plot-shell-square-kernel.md) (the shell these bands sit in),
  [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md) (the invariant preserved),
  [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) (Tab 2's co-equal raster, diverged
  from on purpose), [ADR-0031](0031-tab1-forward-noise-injection.md) (the teal-vs-faint copy the
  palette question would touch).
