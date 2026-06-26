# ADR-0028: Regional-only kernels; Mode toggle removed; zoom-driven region selection

## Status
Accepted — supersedes ADR-0027 §3 (the two-mode Whole/Region model and prev/next
navigation).

## Context
ADR-0027 §3 gave Tab 2 two view modes (Whole / Region toggle) and prev/next region
navigation, and kept a whole-recording kernel as the §4 "is there any kernel at
all" instrument. Practice showed the whole-recording kernel is not informative when
the recording spans more than the baseline region: it averages across heterogeneous
treatment epochs, and the result is neither the baseline kernel nor any treatment
kernel — it is a contaminated blend that answers no scientific question. Only
REGIONAL kernels/STA carry meaning (see FOUNDATIONS §3 principle added alongside
this ADR).

This collapses Whole-vs-Region from a *recovery* distinction into a *display/zoom*
distinction: there was only ever one valuable recovery (regional), viewed at two
zoom states. The Mode toggle therefore duplicated what the existing click grammar
(double-click-to-region, click-reset, drag-zoom) already expresses.

## Decision

1. **Whole-recording kernel is never rendered.** When a recording contains more
   than the baseline region, its whole-signal kernel is uninformative (FOUNDATIONS
   §3) and is not computed for display. The kernel band shows REGIONAL kernels/STA
   only, each in its region hue (ADR-0027 color identity retained).

2. **Mode toggle removed.** No Whole/Region control. Region selection is
   zoom-driven via the existing click grammar:
   - Default view = full recording, all regions shaded AND labeled in-band; kernel
     band shows all regions, none highlighted (all equal — no "current" at full
     zoom).
   - Double-click a region = zoom recon/raster to it; that region becomes current
     (bold in band, others dimmed — the ADR-0027 non-color highlight).
   - Single-click = reset to full. Drag = manual zoom. (Click grammar unchanged.)

3. **Prev/next navigation removed.** Region stepping is pure-click (double-click
   the region). 

4. **Kernel-band Current/All toggle retained.** It expresses the one choice zoom
   cannot make for you: the current (zoomed) region's kernel ALONE vs. against all
   regions for cross-epoch comparison. Inherits ADR-0024 amplitude policy.

5. **Single-region (baseline-only) recordings.** With one region, "all regions" =
   that one region; its kernel IS the regional kernel and is shown normally. The
   no-whole-kernel rule bites only when >1 region exists (i.e. when averaging would
   cross epochs).

## Consequences
- The ADR-0027 "Whole+Current shows the whole purple kernel" state is removed by
  construction — that kernel is no longer rendered when regions exceed baseline.
- ADR-0027 §1/§2 (sub-window recovery is first-class; view-zoom stays view-only)
  are UNCHANGED. Only §3's two-mode UI is superseded.
- FOUNDATIONS §4/§11.4 and the §3 principle below to be reconciled in the same
  canon pass.
- Layout follows (in-band region labels; collapsible Settings/§3 folds; tab title
  folded into the rail) — code, not canon.
