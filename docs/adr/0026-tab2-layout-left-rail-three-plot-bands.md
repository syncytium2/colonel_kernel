# ADR-0026: Tab 2 layout — workflow-staged left rail + three co-equal plot bands

## Status

**Accepted.**

Settles the Tab 2 case of the **per-tab disclosure layout** left open in FOUNDATIONS §11.4, and
applies the §11.1 two-audience tiering (surface / one-layer-down / contextual) to the flagship's
control surface. Operates under [ADR-0018](0018-figure-gate-policy.md) (figure-gate — figures lead,
numbers reconcile; validated against a layout mock, Tony-confirmed). Relocates, but does not change,
the controls governed by [ADR-0024](0024-kernel-sta-overlay-display-mode.md) (overlay amplitude mode)
and [ADR-0025](0025-tab2-indicator-column-railed-fit-display.md) (indicator column / railed-fit
display) — both still live in the rail's Settings / readout sections. Governs **display layout only**;
no core/recovery math changes.

## Context

The original Tab 2 layout stacked all controls (file line, summary, slicebar, λ/noise sliders) above
the plots and placed the four §3 checks as a full-width card grid below them. On a real 16"
fullscreen browser the chrome consumed the top third of the screen and the kernel/STA panel fell
below the fold. The spike display sat at ~27% of a shared panel (the prior ~62/38
reconstruction/spike split), reading as secondary to the dF/F₀ trace — despite the spike train being
the *input* to kernel recovery. Validated against a throwaway layout mock on the file-301 baseline
(635 spikes, 0.604 Hz), Tony-confirmed ([ADR-0018](0018-figure-gate-policy.md)).

## Decision

1. **Workflow-staged left rail (~300px), all controls + readouts.** Sections collapsible. PRE-LOAD:
   file management open, rest dormant. POST-LOAD: file management auto-collapses to a filename +
   "change" line; rail then surfaces, top to bottom: concise summary (ROIs/spikes/frames/dt/Hz);
   Settings (Column, Method, Overlay scale); an "Advanced" fold holding λ + noise, collapsed by
   default (§11.1 tiering); the four §3 checks as a compact label:value stat readout, captioned
   "numbers; figures are the instrument" ([ADR-0018](0018-figure-gate-policy.md)).
2. **Right column: three co-equal-height plot bands**, full vertical extent — (a) reconstruction
   (actual vs predicted dF/F₀, spike-window slider inline), (b) spike raster, (c) recovered kernel +
   STA overlay.
3. **Spike raster promoted to first-class.** Equal ABSOLUTE height to the other two bands — it is the
   recovery input, not a subordinate strip. This deliberately SUPERSEDES the prior ~62/38
   consolidated-panel split. Retains binned-count + pinned [0, maxCount] axis (decoupling visibility,
   unchanged); stems render as filled bars (width/fill) so low counts read on sparse cells.
   Reconstruction and raster remain co-registered on one shared recording-time x.

## Consequences

- Recovers the full top-third of vertical chrome; all three plots clear the fold on a 16" fullscreen
  viewport.
- The ~62/38 panel split (prior NEXT_SESSION spec) is retired.
- §3 checks move from a full-width grid to the rail; figures lead, numbers reconcile
  ([ADR-0018](0018-figure-gate-policy.md) preserved).
- Sparse-cell raster legibility (e.g. file-80, 0.131 Hz, pinned [0,2]) depends on the filled-bar
  render; confirm at equal height on file-80 during implementation.
- Pre-load rail state is specified but built lazily — post-load is the 99% state.

## Notes

Update FOUNDATIONS §11.4 "per-tab disclosure layout (open)" to reference this ADR as the settled
Tab 2 disclosure layout. [ADR-0024](0024-kernel-sta-overlay-display-mode.md) (overlay amplitude
mode) and [ADR-0025](0025-tab2-indicator-column-railed-fit-display.md) (indicator column / railed-fit
display) are unaffected and still live in the rail's Settings / readout sections.

## References

- FOUNDATIONS §11.1 (two-audience tiering), §11.2 (tab-local display controls), §11.4 (per-tab
  disclosure layout — the open item this ADR settles for Tab 2), §3 (the four checks now in the rail).
- [ADR-0018](0018-figure-gate-policy.md) — figure-gate; the layout was validated by a Tony-confirmed
  mock, not a metric.
- [ADR-0024](0024-kernel-sta-overlay-display-mode.md), [ADR-0025](0025-tab2-indicator-column-railed-fit-display.md)
  — relocated into the rail, unchanged.
- Evidence: the file-301 baseline layout mock (gitignored `darkroom/`; 635 spikes, 0.604 Hz),
  read-confirmed by Tony per ADR-0018.
