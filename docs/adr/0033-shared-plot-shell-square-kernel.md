# ADR-0033: Shared 20/80 plot shell across both tabs — square top-right kernel

## Status

Accepted
(2026-07-03. Introduces one layout shell for Tab 1 and Tab 2. **Supersedes the band
*arrangement* of [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md)** — three co-equal
bands → two full-width bands + a square kernel + a summary panel — **and the §3 *placement* of
[ADR-0028](0028-regional-only-kernels-zoom-driven-selection.md)** — §3 moves from the pinned
rail-bottom into the summary. **Preserves** the [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md)
/ FOUNDATIONS §11.5 co-registration invariant intact; updates FOUNDATIONS §11.4.)

## Context

The two tabs had grown two unrelated shells: Tab 1 a centered ~920px teaching column (controls in
a top card, a 2-column workspace) and Tab 2 a full-height ~300px rail + three co-equal plot bands
(ADR-0026). Two asks converged: (1) optimize the display of the time-course data on both tabs with
generous room for the kernel, and (2) make the two tabs feel like one instrument. Tony approved a
prototype (`docs/design/shared-layout-prototype.html`): a **20% tools rail + 80% plot area**, the
kernel a **square pinned top-right**, and the time-course bands **full-width below**.

The binding constraint is §11.5 co-registration ([ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md)):
the recording-time bands (Tab 1 spike train + output; Tab 2 reconstruction + raster) must align
**pixel-for-pixel** on x. A time band placed *beside* the square kernel would be narrower than the
bands below it → the axes shear → the invariant breaks. So the slot beside the kernel cannot hold a
time band.

## Decision

1. **One shell component, `Shell.svelte`, for both tabs.** A 20% tools rail (min 210px, max 300px)
   beside an 80% plot area. The plot area is a fixed-height top row — a **summary panel** (fluid
   width) next to a **square kernel** (`aspect-ratio: 1`, its side = the row height) — above
   **full-width, co-registered time-course bands**. Each tab supplies four snippets: `rail`,
   `summary`, `kernelPanel`, `bands`. Structure is shared; content stays per-tab.

2. **Readouts sit beside the kernel, never a time band.** The top-left slot holds numbers, because a
   time band there would break §11.5 (above). Tab 1 → kernel peak / noise σ / SNR / spike count;
   Tab 2 → the four §3 checks (relocated from the rail-bottom). This *serves* the display ask: the
   time-course bands now get the entire 80% width.

3. **Tab 1 adopts the rail + full-height shell.** Its controls (spikes, kernel shape, peak, noise,
   advanced timebase) move from the top card into the rail; the title folds into the rail (matching
   Tab 2, ADR-0028 rationale). The kernel becomes the square; the spike + output bands become the
   full-width bands. All co-registration, coupled zoom, and the noise-overlay `{#key}` remount
   (ADR-0031) are prop-driven and carry over unchanged.

4. **Tab 2 re-slots onto the shell.** Rail = the existing controls; summary = the four §3 checks
   (the `checksOpen` rail-bottom fold is retired — the summary panel scrolls); kernelPanel = the
   recovered-kernel+STA overlay (was full-width Band C), now the square; bands = reconstruction +
   spike raster. Region hues, the Current/All overlay toggle, railed "show anyways", and every plot
   prop are unchanged; Band C's long descriptive label is trimmed to fit the square (overlay-mode
   badge shortened to NORM / AXIS:KERNELS / AXIS:STA, full text in `title=`).

5. **A shared width toggle.** One nav-row control sets a `wide` preference fed to both tabs: capped
   at 1600px (default — keeps traces from stretching and the kernel square sane on ultrawide) or
   full-bleed. Plots re-fit through `Plot.svelte`'s existing `ResizeObserver`; no per-plot work.

6. **Tab 1 opens as a realistic synthetic recording.** Defaults change to a **300 s** window at
   **10 Hz** (a typical calcium-imaging frame rate) with a **seeded random 0.1 Hz Poisson** spike
   train (plus a "↻ random 0.1 Hz" redraw). This makes the ADR-0031 noise tool bite and feeds a
   plausible recording into the [ADR-0034](0034-tab1-tab2-handoff.md) handoff.

## Consequences

- **Supersedes, not contradicts.** ADR-0026's *layout intent* (workflow-staged rail + first-class
  raster + numbers-not-verdicts) stands; only the band **arrangement** changes (kernel promoted out
  of the band stack into the square; §3 moved rail→summary). ADR-0028's region model (zoom-driven
  selection, regional-only kernels, Current/All toggle) is **untouched**. FOUNDATIONS §11.4 updated.
- **§11.5 co-registration preserved by construction** — the only reason readouts, not a band, sit
  beside the kernel. The recording-time bands remain full-width and pixel-aligned.
- **The kernel gets a dedicated square** on a lag axis — its natural symmetric shape, sized by the
  top-row height (`clamp(240px, 34vh, 340px)`), the same slot in both tabs.
- **Display-only; no core touched.** 202/202 core tests; clean build, no unused selectors.
- Relates to: [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) (band arrangement
  superseded), [ADR-0028](0028-regional-only-kernels-zoom-driven-selection.md) (§3 placement
  superseded; region model intact), [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md)
  (the co-registration invariant this obeys), [ADR-0031](0031-tab1-forward-noise-injection.md) /
  [ADR-0032](0032-tab1-kernel-amplitude-control.md) (Tab 1 noise + amplitude, carried onto the shell),
  [ADR-0034](0034-tab1-tab2-handoff.md) (the handoff the new Tab 1 defaults feed).
