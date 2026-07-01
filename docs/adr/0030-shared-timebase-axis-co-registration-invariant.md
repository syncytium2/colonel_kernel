# ADR-0030: Shared-timebase axis co-registration is a cross-tab invariant (Tab 1 adopts the Tab 2 mechanism)

## Status

**Accepted.**

Generalizes the co-registration the Tab 2 layout introduced
([ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md): "reconstruction and raster remain
co-registered on one shared recording-time x") into a **durable, cross-tab plotting invariant**, and
records the **y-axis identity policy** as a human-decided instance of the figure-gate
([ADR-0018](0018-figure-gate-policy.md)). Governs **display layout only**; no core/recovery math
changes. Settles FOUNDATIONS §11.5 (new).

## Context

Tab 1 stacks two recording-time bands — the input spike train and the `input ⊗ kernel` output — so
the eye can drop straight down from a spike to where its response begins. But the spike band hid its
x-axis (`showXAxis={false}`) while the output band showed one. uPlot only auto-reserves right-edge
space when an x-axis is present (for the last tick label), so the two plot areas ended up with
**different right edges and sheared**: a spike no longer landed above its response. The bands shared
an x *range* but not an x *geometry*.

Tab 2 had already hit and solved this exact class of bug during its layout work
([ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md)): its reconstruction and raster bands
co-register by pinning an identical x-range, an equal left gutter, and an **equal right padding**
(`padRight`) on both, plus a cursor linked by data-x (`syncKey`) and per-series value-dots
(`cursorPoints`) for a shared hover crosshair. The mechanism already lived in the shared `Plot`
component; Tab 1 simply never opted in. Verified against a Tony-confirmed screenshot on the default
`0.5, 1.0, 1.2` spike train (gitignored `darkroom/`, [ADR-0018](0018-figure-gate-policy.md)).

## Decision

1. **Shared timebase ⇒ co-registered x-axis (required).** Any set of plots that share a timebase
   (recording-time on Tab 1's spike/output and Tab 2's reconstruction/raster; a lag axis among lag
   plots) MUST align pixel-for-pixel: identical **x-range**, equal **left gutter** (`yAxisSize`), and
   equal **right padding** (`padRight`) so a feature at time *t* sits at the same x in every band. A
   shared x-*range* alone is insufficient — the plot-area *geometry* must match too.
2. **Stacked/adjacent shared-time bands get a shared hover crosshair.** Link the cursor by data-x
   (`syncKey`) so hovering either band draws the same dashed time-line on all of them, and show
   per-series value-dots (`cursorPoints`): the dashed line says *where in time*, the dot says *the
   value there*.
3. **Different timebase ⇒ deliberately NOT co-registered.** The kernel/STA band is an operator on
   **lag**, not a signal on recording-time; it keeps its own symmetric ±win lag axis and shares no
   `syncKey` with the recording-time bands ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md)).
   Co-registering axes of different meaning would be a lie.
4. **y-axes: identical when reasonable, human-decided.** Prefer pinning a **shared y-range** across
   related plots whenever it makes magnitudes comparable *by construction* (e.g. kernels/STA across
   regions — [ADR-0024](0024-kernel-sta-overlay-display-mode.md), [ADR-0029](0029-overlay-scale-kernel-sta-targets.md)).
   This is a **preference, not an absolute**: where a shared scale would flatten detail, a per-plot
   scale is correct. The call is the human's per the figure-gate
   ([ADR-0018](0018-figure-gate-policy.md)), not an enforced rule.
5. **Tab 1 adopts the mechanism now.** Its spike and output bands take equal `padRight`, a shared
   `syncKey`, and `cursorPoints`, matching Tab 2. (Implemented in `src/App.svelte`; the props already
   existed in `src/lib/Plot.svelte`.)

## Consequences

- The `padRight` shear (one band hides its x-axis, edges diverge) is closed wherever the pattern is
  applied — Tab 1 and Tab 2 now behave identically.
- **New shared-time bands must opt in.** The three props are per-`Plot`, not automatic; a future band
  that forgets them re-introduces the shear (the original Tab 1 bug). Hence recording it as an
  invariant in FOUNDATIONS §11.5 rather than leaving it as a Tab-2-only detail.
- The y-axis policy stays a judgment call, not a lint rule — deliberately, so log/detail cases can
  diverge without "violating" a spec.
- No math, no core, no recovery change; `test:core` unaffected (202 passing). The gate is the figure.

## Notes

Update FOUNDATIONS §11 to add **§11.5 (axis co-registration)** and cross-reference this ADR. The
Tab 2 co-registration line in [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) is now the
first instance of this general rule, not a one-off.

## References

- FOUNDATIONS §11.5 (axis co-registration — the durable rule this ADR settles), §11.2 (tab-local
  display controls), §2 (the kernel as an operator on lag — why the lag band does not co-register).
- [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) — Tab 2 layout; introduced the shared
  recording-time x that this ADR generalizes.
- [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) — the kernel's own symmetric lag
  axis (the deliberately-non-co-registered case).
- [ADR-0018](0018-figure-gate-policy.md) — figure-gate; the y-axis "identical when reasonable" call
  is the human's, and this change was validated by a Tony-confirmed screenshot, not a metric.
- [ADR-0024](0024-kernel-sta-overlay-display-mode.md), [ADR-0029](0029-overlay-scale-kernel-sta-targets.md)
  — shared-y amplitude policy for the kernel/STA overlay (instances of the y-axis preference).
- Evidence: `darkroom/fig_tab1_align_hover.png` (gitignored; default `0.5, 1.0, 1.2` train),
  read-confirmed by Tony per ADR-0018.
