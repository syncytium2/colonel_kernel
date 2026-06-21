# 1. Delta rasterization: snap + unit-amplitude defaults

## Status

Accepted

## Context

Inputs in this tool are modeled as spike trains — a list of delta-function times (see `FOUNDATIONS.md` §1). To convolve, deconvolve, or plot them, those continuous spike times must be placed onto the discrete sample grid defined by the recording's time column. Spike times rarely land exactly on a grid point, so we must choose how to place them.

Two options:

1. **Snap to nearest sample.** Each spike becomes a single delta at the closest grid index. Simple and literal; introduces a quantization error of up to half a sample interval per spike.
2. **Anti-alias.** Distribute each spike's weight across the adjacent samples (e.g. linear interpolation between the two straddling grid points) to preserve sub-sample timing. Avoids quantization artifacts that can confuse deconvolution, at the cost of producing fractional, less literal spike trains.

There is also an **amplitude / collision** axis, separate from the timing-placement axis above. At the coarse sampling rates typical of calcium imaging (~10 Hz, i.e. 100 ms bins), multiple fast spikes can fall into a single bin. This forces a choice about what value a bin carries: a single unit event, or the count of spikes that landed in it. Placement (snap vs. anti-alias) and amplitude/collision behavior are two independent knobs of the same rasterization step.

This is open question §10.1 in `FOUNDATIONS.md`.

## Decision

**Snap to nearest sample for v1.** Implement it behind a single swappable interface — `rasterize(spikeTimes, grid, method)` — so anti-aliasing can be toggled in later without touching call sites. `method` defaults to `"snap"`; `"antialias"` is reserved for the later addition.

**Amplitude model:** **unit amplitude is the default** — each spike contributes weight 1. **Binned-count mode is a required toggle** for real calcium data: at coarse sampling rates a bin holding three spikes carries the value 3 (three identical unit events), which is the honest representation. Both are modes of the *same* `rasterize(spikeTimes, grid, method)` function, sitting on the amplitude/collision axis alongside the snap/anti-alias method axis: `"unit"` keeps/clamps each bin to weight 1 (and should log any dropped collisions), `"binned-count"` accumulates the per-bin spike count. **Arbitrary per-spike weighting is explicitly excluded** for the Tab 2 kernel-recovery workflow.

## Consequences

**Pros**

- Clean, literal spike trains — the clearest behavior for the teaching tabs (a spike is exactly one delta at one sample).
- Worst-case timing error is half a frame. When the rasterization grid matches the recording's frame rate, this is below the calcium kernel timescale, so it does not meaningfully affect kernel recovery (the flagship use case).
- Simplest possible implementation; nothing to tune.

- **Unit amplitude preserves kernel identifiability** — it is the core assumption behind Tab 2. Forcing every spike to weight 1 makes the *kernel* explain the trace, which keeps the "is there a clean kernel?" test meaningful.
- **Binned-count stays identifiable**, because a per-bin count is an *objective* quantity (how many spikes fell in the bin), not a soft fit parameter. It does not loosen the model the way free weights would.

**Cons**

- Sub-sample timing is lost until the anti-alias toggle is added. For deconvolution, snapping can introduce quantization artifacts that a future anti-aliased mode would avoid.

**Mitigation**

- Rasterization lives behind a single `rasterize(spikeTimes, grid, method)` function, so adding an anti-alias method — or the binned-count amplitude mode — is a drop-in change, with no migration of callers required.
- **Arbitrary per-spike weighting is excluded from Tab 2** deliberately: free weights could absorb model misfit, masking genuinely uncoupled recordings and defeating the flagship's core deliverable. Unit and binned-count are the only sanctioned amplitude modes there.

See `FOUNDATIONS.md` §10 (open question 1).
