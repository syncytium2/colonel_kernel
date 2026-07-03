# ADR-0032: Tab 1 kernel amplitude control — a user-set peak-height (dF/F₀) axis

## Status

Accepted
(Follow-up to [ADR-0031](0031-tab1-forward-noise-injection.md). Realizes the "separate, user-set
amplitude axis" that ADR-0031's Consequences already named; no canon change. A one-line pointer is
added to FOUNDATIONS §11.2 beside the noise-tool reference.)

## Context

[ADR-0031](0031-tab1-forward-noise-injection.md) wired the ADR-0015 measurement-noise model onto the
Tab 1 forward-convolution output, with σ calibrated in physiological dF/F₀ (1× ≈ 0.0024 dF/F₀). Its
Consequences section flagged the mismatch this creates against the peak-1 teaching kernel: with the
kernel normalized to **peak 1**, the clean-output peak is ~1 dF/F₀, so even the slider's 10× maximum
(σ ≈ 0.024) leaves **SNR ≈ 42** — the noise overlay sits invisibly on the clean line. ADR-0031 named
the fix explicitly: *"the teaching kernel's amplitude is a separate, user-set axis"* and *"lowering
the kernel amplitude makes the corruption visible."* That axis existed only in prose — there was no
control. This ADR adds it.

The kernel builders (`src/lib/core/kernels.js`) emit a canonical **peak-1 shape** for every library
entry (Gaussian, exponential, boxcar, calcium). Peak height is a single scalar multiplying that
shape — universal to all shapes, unlike the shape-specific params (σ, τ, length).

## Decision

1. **Amplitude scales the peak-1 shape in `buildKernel`.** `buildKernel(id, params, dt, amplitude =
   1)` gains a fourth argument that multiplies the builder's samples. This is the **one** place
   kernel height is set, so the convolution output, the kernel plot, and the SNR readout all inherit
   the same scale, and the teaching identity holds unchanged: a unit spike ⊗ kernel still *reproduces*
   the (now scaled) kernel samples at the spike. **Default 1** — every existing caller and the peak-1
   core tests (`buildKernel('calcium', …)` → peak 1) are byte-identical. Peak-1 remains the shape
   normalization; amplitude is a scale layered on top, not a replacement.

2. **One universal control, not a per-kernel param.** A single `kernelAmp` app-state feeds
   `buildKernel`, surfaced as a **peak (dF/F₀)** slider (0.01 → 1, step 0.01) beside the shape
   params. It is deliberately **not** added to each entry's `params` schema: peak height is common to
   all shapes, and a shared control **survives a kernel-shape switch** (per-kernel params reset to
   defaults on switch via `defaultParams`), which the amplitude should not.

3. **UI default 0.1 dF/F₀** — a physiologically plausible transient peak that opens Tab 1 in a regime
   where the calibrated noise *matters*: at peak 0.1, 1× σ gives SNR ≈ 42 and 10× gives SNR ≈ **4**,
   so dragging the noise slider visibly degrades the trace. (The `buildKernel` default stays 1 for
   callers/tests; only the Tab 1 UI opens at 0.1.) Noise still defaults **off** (§11.2), so the
   learner's first view is clean — the amplitude default sets the *height*, not whether noise is on.

## Consequences

- **Realizes, does not change, canon.** The "separate amplitude axis" was already stated in
  ADR-0031; this makes it a control. A one-line pointer is added to FOUNDATIONS §11.2 beside the
  noise-tool reference.
- **The noise tool is now useful by default.** Its whole pedagogical point — watch measurement noise
  corrupt a synthesized trace — was inert while the signal dwarfed physiological σ by ~400×. Peak and
  σ now live on the same dF/F₀ axis at a comparable scale.
- **Core unchanged in spirit, minimal in letter.** One optional argument, default-1, guarded so the
  scaling loop runs only when amplitude ≠ 1. 202/202 core tests pass unchanged.
- **Privacy posture untouched** (FOUNDATIONS §6): pure JS, no new dependency, no network.
- Relates to: [ADR-0031](0031-tab1-forward-noise-injection.md) (the noise tool this makes usable),
  [ADR-0015](0015-harness-noise-model.md) (the dF/F₀ σ calibration the peak is now scaled against),
  [ADR-0001](0001-delta-rasterization.md) (unit **input**-amplitude default — a distinct axis from
  this kernel-peak scale),
  [ADR-0003](0003-kernel-source.md) (the peak-1 parameterized kernel library this scales).
