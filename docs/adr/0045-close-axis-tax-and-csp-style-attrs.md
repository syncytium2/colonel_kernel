# ADR-0045: Close the axis tax on Tabs 1–2, and the last inline style attributes

## Status

Accepted
(Display-only, no core change. Applies [ADR-0043](0043-tab3-overlay-true-and-recovered-input.md)'s
rule to the two tabs it measured but left queued, and delivers
[ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md)'s co-equal raster as measured rather
than as declared. Corrects the sizing in
[ADR-0040](0040-tab1-band-order-follows-tab0.md).)

## Context

Two loose ends, both found by measuring rather than reading.

**The axis tax.** ADR-0043 established that the band drawing the x-axis pays for it out of its own
share, so an equal split of the *containers* is not an equal split of the *plots*. It fixed Tab 3
and tabulated the other two without acting: Tab 2 measured **117 vs 86px** — and ADR-0026 promoted
that raster to *first-class, co-equal* precisely because it is the recovery input — and Tab 1
measured **198 vs 45px**, where ADR-0040 had sized the cap against the band body and got a plot
thinner than the ~76px Tab 0 gives its own raster.

**Two `style-src-attr` CSP violations on Tab 2.** Reported in NEXT_SESSION as harmless console
noise. The cause turned out to be worth knowing: instrumenting `setAttribute` caught **zero**
inline-style writes, which ruled out the runtime and pointed at markup. Svelte 5 instantiates
static markup by cloning a template built from an HTML **string**, so a literal `style="…"` in a
component is parsed as an inline style attribute and the strict CSP (ADR-0008,
`default-src 'self'`) blocks it. Exactly two static `style` attributes existed in the codebase —
the reconstruction legend's two swatches — matching the two violations exactly. Interpolated
`style={…}` attributes are set through CSSOM by the runtime and never trip it, which is why the
neighbouring dynamic swatches were always fine.

## Decision

1. **Tab 2's raster band gets `flex: 1 1 31px`** against the reconstruction's `1 1 0`, equal grow —
   the same rule as Tab 3, sized to the measured 31px gap. Result **101 / 101px**: co-equal in the
   plots, which is what ADR-0026 asked for.
2. **Tab 1's raster cap goes 172px → 203px.** The cap always included the axis; ~31px of it is
   uPlot chrome. Result **167 / 76px** — the raster now matches the ~76px Tab 0 gives its own,
   which was ADR-0040's stated intent. The cap-not-fixed-height decision is unchanged.
3. **Static `style` attributes become classes.** `.k-trace` / `.k-machine` carry the two fixed
   legend colors from the ADR-0041 tokens. Violations **2 → 0** on the built artifact.

## Consequences

- **Measured, not asserted** (1600×1000, built artifact): Tab 1 167/**76**, Tab 2 **101/101**,
  Tab 3 123/119. Every band stack in the app now splits its *plots* rather than its containers.
- **A rule for new markup: never write a literal `style="…"` in a component.** It is invisible in
  dev — the CSP is injected at build time, so the dev server never enforces it — and it fails
  silently in production, where the style simply does not apply. Fixed colors go in a class;
  genuinely dynamic ones may stay interpolated, since those go through CSSOM.
- **The console is clean again**, which is the point: FOUNDATIONS §6's guarantee rests on that
  CSP, and a console carrying expected violations is where an unexpected one would hide.
- **`npm run deploy` still does not check for console violations** — it gates on third-party
  beacons only. Catching this needed a Playwright pass against `npm run preview` or the live site.
  Worth a gate; not added here.
- 240/240, machinery-check and template-acceptance pass.
- Relates to: [ADR-0043](0043-tab3-overlay-true-and-recovered-input.md) (the rule),
  [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) (the co-equal raster now delivered),
  [ADR-0040](0040-tab1-band-order-follows-tab0.md) (whose cap this corrects),
  [ADR-0008](0008-csp-build-time-injection.md) (the CSP being satisfied),
  [ADR-0041](0041-plot-series-palette-one-color-per-quantity.md) (the tokens the classes use).
