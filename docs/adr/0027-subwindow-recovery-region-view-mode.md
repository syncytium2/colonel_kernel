# ADR-0027: Sub-window recovery is first-class; region view mode

## Status
Accepted

## Context
The NEXT_SESSION HORIZON note fenced all sub-window recovery as "future V2,
do not recompute on a window." That note conflated two different operations
and the over-broad fence caused confusion in practice.

Two operations were collapsed that must be kept distinct:
- **View-zoom** — inspecting a feature in an already-computed result.
- **Sub-window recovery** — recovering a kernel over a chosen AP/Ca²⁺ span.

The second is not deferrable machinery; it is central to the §4 thesis.
The whole-recording kernel is an average over coupled AND decoupled stretches —
contaminated when coupling is partial. A kernel recovered over a cleanly-coupled
span reveals the classic AP→Ca²⁺ model that the contaminated average masks.
The §3 ROI-1 record already names the decoupled stretches (~790 s
calcium-without-APs; 400–700 s reduced gain) — extracting the kernel away from
them is the affirmative side of the partial biconditional, not a future feature.

## Decision

### 1. Corrected boundary (supersedes the HORIZON note)
- **View-zoom remains view-only.** Dragging to inspect NEVER recomputes the
  kernel/STA/§3. This honesty line holds unchanged.
- **Sub-window recovery is a first-class scientific operation.** The kernel is a
  property of the AP/Ca²⁺ span it is recovered over. Recovering on a chosen span
  is intended, not a defect against any boundary.

Two flavors, same machinery (bracket spikes to span, run recovery), different why:
- **Region selection** — protocol epochs from metadata (ADR-0019). Recovery is
  region-local.
- **Coupling-window selection** — a span chosen because coupling looks clean, to
  reveal the uncontaminated kernel.

### 2. Whole-recording vs window relationship
- The whole-recording kernel stays a genuine all-APs recovery — the §4
  "is there any kernel across everything" instrument. It does NOT silently become
  a concatenation of regions.
- Whole-recording and window kernels are **co-equal in legitimacy**. When coupling
  is partial the whole-recording kernel is the contaminated average; the gap
  between it and a clean-window kernel **is itself the decoupling measurement** —
  signal, not one being right. Consistent with machinery-gated/fit-reported (§3)
  and facts-not-verdicts (ADR-0025): show both and the gap; the human reads
  contamination.

### 3. Region view mode
- **Two view modes.** Whole-recording (default): full trace, regions drawn as
  overlay markers, one whole-recording kernel/STA. Region mode: one region shown
  at a time, recon + raster windowed to that region, prev/next navigation. In
  region mode the §3 numbers and kernel/STA are region-local (recomputed per region).
- **Kernel-band toggle, independent of view mode.** All-regions overlay (every
  region's kernel + STA drawn together, current region highlighted) vs.
  current-region only. The overlay inherits ADR-0024 amplitude policy (shared-y
  default, normalized opt-in, twin-y rejected). The band may show all-regions
  while recon/raster show a single region.

### 4. Spike sufficiency
Per-window spike sufficiency is **reported, not gated** (consistent with ADR-0019).
A short clean span may hold few spikes — report it; never silently fit or refuse.

## Consequences
- Region mode runs whatever recovery methods exist (1 & 2 today) windowed per
  region. Method 3 (ADR-0023) drops in later with no change to mode machinery.
- The HORIZON note in NEXT_SESSION is replaced by this ADR's boundary.
- FOUNDATIONS §4 / §11.4 to be updated to match (window recovery is intended).
