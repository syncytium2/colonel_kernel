# ADR-0029: Overlay-scale gains kernel/STA scale-target modes (extends ADR-0024)

## Status
Accepted — extends ADR-0024 (does not supersede; ADR-0024's twin-y rejection
stands and is reaffirmed below).

## Context
ADR-0024 settled the kernel/STA overlay amplitude policy: shared-y default,
normalized opt-in, twin-y permanently rejected (twin-y's two simultaneous axes
fake peak co-alignment — the "false-agreement hazard" that would corrupt the §3
check-4 cross-method-agreement read).

Real high-rate data (file-233 baseline: kernel peak amp ~0.0075, STA swing
~±0.05–0.08) exposed a gap the two existing modes don't cover: on shared-y the STA
dominates and crushes the kernel to a near-flat line; normalized (each curve to its
own peak) removes the amplitude relationship entirely. Neither lets the user read
the KERNEL on its own scale while keeping a single honest axis. The same gap runs
the other way (read STA on its scale).

## Decision
The Overlay-scale control becomes a single N-way mutually-exclusive choice. All
modes use ONE shared y-axis; they differ only in whose range defines it:

1. Shared-y (default) — axis spans all curves. (Unchanged ADR-0024 default.)
2. Normalized (opt-in) — each curve scaled to its own peak; shape-only, amplitude
   lives in the readout. (Unchanged ADR-0024 opt-in.)
3. Scale to kernels (new) — axis range set by the kernel curves; STA overflows /
   clips honestly.
4. Scale to STA (new) — axis range set by the STA curves; kernels sit small but on
   the same axis.

Modes 3–4 pool across regions by curve TYPE (the kernel curves collectively set the
kernel-scaled range; the STA curves collectively set the STA-scaled range),
consistent with how shared-y already pools across all curves. The choice is per
curve-type, not per region.

## Why this is NOT twin-y (ADR-0024 reaffirmed)
Twin-y was rejected because it gives kernel and STA SEPARATE simultaneous axes, so
both render full-height and appear to co-peak even at wildly different amplitudes —
a lie about cross-method agreement. Modes 3–4 keep a SINGLE shared axis and only
choose whose range sets it. When the STA overflows a kernel-scaled axis, that
overflow is the TRUTH ("these are different amplitudes"), not a hidden second axis
faking agreement. Single-axis-with-selectable-range is honest where twin-y lied.
Twin-y remains rejected; modes 3–4 are not a path back to it.

## Consequences
- The Overlay-scale UI control lists four mutually-exclusive options.
- §3 check-4 (cross-method agreement) is read from the readout numbers + peak lags,
  not from apparent visual co-height — so a kernel-scaled view with STA overflowing
  does not mislead the agreement read (the numbers are unaffected by display scale,
  per the display↔recovery separation).
- ADR-0024 stays Accepted; its README row marked "extended by ADR-0029."
