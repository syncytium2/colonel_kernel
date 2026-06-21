# 1. Delta rasterization: snap to nearest sample

## Status

Accepted

## Context

Inputs in this tool are modeled as spike trains — a list of delta-function times (see `FOUNDATIONS.md` §1). To convolve, deconvolve, or plot them, those continuous spike times must be placed onto the discrete sample grid defined by the recording's time column. Spike times rarely land exactly on a grid point, so we must choose how to place them.

Two options:

1. **Snap to nearest sample.** Each spike becomes a single delta at the closest grid index. Simple and literal; introduces a quantization error of up to half a sample interval per spike.
2. **Anti-alias.** Distribute each spike's weight across the adjacent samples (e.g. linear interpolation between the two straddling grid points) to preserve sub-sample timing. Avoids quantization artifacts that can confuse deconvolution, at the cost of producing fractional, less literal spike trains.

This is open question §10.1 in `FOUNDATIONS.md`.

## Decision

**Snap to nearest sample for v1.** Implement it behind a single swappable interface — `rasterize(spikeTimes, grid, method)` — so anti-aliasing can be toggled in later without touching call sites. `method` defaults to `"snap"`; `"antialias"` is reserved for the later addition.

## Consequences

**Pros**

- Clean, literal spike trains — the clearest behavior for the teaching tabs (a spike is exactly one delta at one sample).
- Worst-case timing error is half a frame. When the rasterization grid matches the recording's frame rate, this is below the calcium kernel timescale, so it does not meaningfully affect kernel recovery (the flagship use case).
- Simplest possible implementation; nothing to tune.

**Cons**

- Sub-sample timing is lost until the anti-alias toggle is added. For deconvolution, snapping can introduce quantization artifacts that a future anti-aliased mode would avoid.

**Mitigation**

- Rasterization lives behind a single `rasterize(spikeTimes, grid, method)` function, so adding an anti-alias method is a drop-in change — no migration of callers required.

See `FOUNDATIONS.md` §10 (open question 1).
