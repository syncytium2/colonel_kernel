# ADR-0031: Tab 1 measurement-noise tool — AWGN on the forward-convolution output

## Status

Accepted
(v1. Realizes a settled FOUNDATIONS point — §7 noise injection, §11.2 its global/default-off
scope — and applies the [ADR-0015](0015-harness-noise-model.md) calibration to the app's
user-facing consumer. No canon change; a one-line cross-reference is added to §7 and §11.2.)

## Context

`FOUNDATIONS.md` §7 already names optional noise injection as a cross-cutting feature ("so
deconvolution isn't deceptively easy"), and §11.2 already fixes its control scope as
**global-but-default-off**. [ADR-0015](0015-harness-noise-model.md) then calibrated that noise as
**additive white Gaussian (AWGN)** on a **0–10× cohort-typical σ** slider, with **1× ≈ 0.0024
dF/F₀** (the recon clean-active baseline-region median across 39 recordings). ADR-0015 explicitly
names **two consumers** of the one calibrated model: the machinery-check harness (built) and "the
app's user-facing noise-injection control" (not yet built). Tab 1 is now that second consumer.

The reusable noise model already lives in `src/lib/core/noise.js` (exported through the core
barrel): `SIGMA_COHORT_TYPICAL = 0.0024`, `NOISE_LEVEL_MAX = 10`, `sigmaForLevel(level)`,
`addAWGN(samples, sigma, rand)`, and the seeded `mulberry32(seed)` PRNG. Nothing new needs to be
modelled — this ADR only decides **where** the noise is injected in Tab 1, **how** it is shown, and
**what** controls sit around it.

## Decision

1. **Inject AWGN on the forward-convolution OUTPUT.** The noise is added to `output.samples`
   (`input ⊗ kernel`), modelling **measurement noise on the synthesized dF/F₀ trace**. σ is in
   dF/F₀ units, matching [ADR-0015](0015-harness-noise-model.md). This is the physically honest
   place: measurement noise corrupts the recorded fluorescence, not the spike train (input-side /
   spike noise stays out of scope — ADR-0015 v2).

2. **Overlay clean + noisy in the existing output band.** The clean output stays teal
   (`#2a9d8f`); the noisy realization is drawn faint over it in the **same** band, on the **same**
   y-scale, sharing the same `xs` (via `Plot.svelte`'s `ys2`/`color2` overlay path). No new plot
   component. The faint tone is a muted slate-teal (`--noise-trace`, a precomputed 40%-teal/60%-text
   mix per theme so it is canvas-safe and legible in both light and dark). When noise is **off**
   (level 0) the overlay is `null` — the output band is byte-for-byte what it was before this ADR.

3. **Controls = the ADR-0015 slider + SNR readout + reseed.** A **0–10× cohort-typical σ** slider
   (`step 0.1`, **default 0/off** per §11.2), a live **σ readout** in dF/F₀, a live **SNR readout**
   (peak-of-clean-output / σ), and a **seeded Reseed button** (disabled at level 0) that draws a new
   realization. The realization is **seeded** (`mulberry32(noiseSeed)`), so moving an unrelated
   control never reshuffles the noise — only a reseed or a level change draws a new draw. Because
   noise injection is the pedagogical point of this tool, the control is **surfaced by default**
   (a top-level `.field`), not hidden in the Advanced fold (§11.1).

4. **No change to `noise.js`.** The v1 AWGN model and the baseline-region σ stand unchanged;
   region-conditioned autocorrelation and the signal-dependent shot term remain **v2-deferred**
   per [ADR-0015](0015-harness-noise-model.md) part 3. This ADR is pure wiring + presentation over
   the already-calibrated model.

## Consequences

- **Realizes (does not change) settled FOUNDATIONS points:** §7 (noise injection) and §11.2 (its
  global, default-off scope). The optional cross-reference ADR-0015 mentioned is now concrete —
  a one-line pointer to this ADR is added to §7 and §11.2.
- **SNR is defined as peak-of-clean-output / σ**, so raising the kernel amplitude visibly raises
  SNR — honest and teachable. A corollary worth stating: with Tab 1's unit-amplitude teaching
  defaults ([ADR-0001](0001-delta-rasterization.md)) the summed output peak can be ~2, so at 1× the
  measured baseline σ (0.0024) the noise is genuinely tiny (SNR in the hundreds) and the overlay
  sits almost on the clean line. That is the correct physics, not a defect — the readout says so
  numerically, and cranking the slider (or lowering the kernel amplitude) makes the corruption
  visible. The σ is calibrated to physiological dF/F₀; the teaching kernel's amplitude is a
  separate, user-set axis.
- **Overlay disturbs nothing.** It shares `xs` with the clean line, so the coupled parent-owned
  zoom, the shared hover crosshair, and the pixel-for-pixel co-registration with the spike band
  ([ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md)) are untouched. uPlot fixes
  its series count at init, so the output band is wrapped in a `{#key}` that remounts it only when
  the overlay toggles across level 0 (reseeds and in-range level changes flow through `setData`
  without a remount); co-registration survives the remount because it is prop-driven.
- **Privacy posture untouched** (FOUNDATIONS §6): pure JS, no new dependency, no network, no CDN.
- Relates to: [ADR-0015](0015-harness-noise-model.md) (the calibrated model this consumes),
  [ADR-0006](0006-linear-convolution.md) (the convolution the noise sits on),
  [ADR-0001](0001-delta-rasterization.md) (unit-amplitude teaching default that sets the SNR scale),
  [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md) (the Tab 1 coupled zoom /
  co-registration the overlay must not disturb).
