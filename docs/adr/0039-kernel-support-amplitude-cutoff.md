# ADR-0039: Kernel support is cut on amplitude, not at a fixed σ/τ

## Status

Accepted
(Refines [ADR-0003](0003-kernel-source.md)'s parameterized kernel library. Changes only where each
builder's array *ends*; shape, peak-1 normalization, and the ADR-0009 `{samples, dt, zeroIndex}`
contract are untouched. No canon change — FOUNDATIONS never fixed the support rules.)

## Context

Every kernel builder in `src/lib/core/kernels.js` emitted a dense array over a support stated in the
shape's own parameter: Gaussian ±3σ, exponential 5τ, calcium 5·τ_decay. Outside that array the
kernel is zero, so **whatever value the last sample holds is a step discontinuity**.

A rule stated in σ or τ does not bound that step, because how far down the tail has fallen at 3σ or
5τ is a property of the shape, not of the parameter. Measured across the UI slider ranges:

| shape | old rule | step at the cut, as a fraction of peak |
| --- | --- | --- |
| Gaussian | ±3σ | 1.11% (parameter-independent) |
| exponential | 5τ | 0.67% (parameter-independent) |
| calcium | 5·τ_decay | **2.68% at the Tab 1 defaults**, up to **9.14%** as τ_rise → τ_decay |

The calcium case is the worst and the most visible: the Tab 1 default kernel (τ_rise 0.2 s,
τ_decay 0.4 s) ended at exactly 2.00 s still holding 2.7% of its peak, which reads on the kernel
plot as a corner where the decay should be settling smoothly into the baseline. Tony spotted it
there, which is what prompted this.

It is not only cosmetic. The calcium shape decays as the *difference* of two exponentials, and as
τ_rise approaches τ_decay it tends toward t·exp(−t/τ), whose tail at 5τ is an order of magnitude
fatter than a plain exponential's — hence the 9%. A step is broadband in frequency, so a kernel that
ends on one seeds ringing in the Tab 2 FFT deconvolution (ADR-0004/ADR-0006). At default settings
the residual sits below the noise floor, but nothing in the old rules kept it there.

## Decision

**Cut every shape's support where its tail has fallen below a fixed fraction of the kernel's peak.**
One constant, `TAIL_EPS = 1e-3`, replaces the three per-shape rules; the σ/τ factors become that
threshold *solved for t* rather than independent choices:

1. **Gaussian** — half-width `√(−2·ln ε)·σ ≈ 3.72σ`.
2. **Exponential** — `−ln(ε)·τ ≈ 6.91τ`.
3. **Calcium** — no closed form for a difference of exponentials, so the builder samples out to a
   cap and scans forward **from the peak index** for the first sample below `ε·peak`, keeping it as
   the array's last. Scanning from the peak and not from t=0 matters: the causal rise starts at
   k(0) = 0, which is below the threshold but is not the tail. The cap is `12·τ_decay`, chosen as
   margin over the slowest case there is — the τ_rise → τ_decay limit, which reaches `ε` at
   ≈ 10.2τ. The cap is a runaway guard, not the operating point: swept over the UI's parameter
   ranges at three sample rates (3600 combinations) it never binds once, and the deepest support
   actually used is ~11τ in a coarse-grid corner where τ_decay = dt.
4. **Every support rounds OUTWARD** (`Math.ceil`) to a whole sample, never to nearest. Rounding to
   nearest can land half a sample short, and for the steeply-falling Gaussian tail that alone
   doubled the step (0.22% against a 0.1% target at σ = 0.02, dt = 0.01). With outward rounding the
   bound is exact for all three shapes.
5. **Boxcar is deliberately excluded.** Its edges *are* the shape — a rectangle that tapered would
   no longer be the hand-verifiable "one unit spike ⊗ boxcar reproduces the boxcar" object that
   ADR-0003 keeps it in the library for.

Truncation was kept over the alternative of tapering the last few samples with a window. A taper
also removes the step, but it changes the kernel's values in a way the shape's formula does not
predict, and Tab 1's whole claim is that the plotted kernel *is* k(t). Extending the support keeps
every retained sample exactly on the analytic curve.

## Consequences

- **The bound now holds across every slider position**: worst-case step measured over the full
  parameter ranges at dt ∈ {0.005, 0.01, 0.05} is **0.1% of peak for all three shapes** (was 1.11% /
  0.67% / 9.14%). The Tab 1 default calcium kernel goes from 201 samples (2.00 s, 2.68% step) to
  **333 samples (3.32 s, 0.099% step)**, and the corner on the kernel plot is gone.
- **Kernels get longer; convolution does not get slower in any way that matters.** The longest
  reachable kernel is calcium at τ_decay = 2 s, dt = 0.005 → 2964 samples (14.8 s). `convolveLinear`
  is sparse stamp-and-sum (ADR-0006), so cost is *spikes × kernel length*, not signal length ×
  kernel length; at Tab 1's default 0.1 Hz Poisson train over 300 s that is ~30 stamps.
- **A long kernel can now exceed the ±window kernel plot.** This was already true (5·τ_decay at
  τ_decay = 2 already ran to 10 s against a ±5 s window) and the display path already handles it —
  `kernelDisplay` in `App.svelte` reads the array through a window and pads with zeros. The visible
  drop-off in that case is the *display* window, not the support.
- **The degenerate σ ≲ dt case is unchanged and still degenerate.** `Math.max(1, …)` floors the
  Gaussian half-width at one sample, so σ = 0.02 on a dt = 0.05 grid is a 3-sample kernel with a
  4.4% step. The grid cannot resolve that kernel at all; the floor is doing the right thing and the
  amplitude rule cannot help. Out of scope here, and no worse than before.
- **The ADR-0009 signal contract is untouched** — `zeroIndex` still 0 for causal shapes and the
  centre index for the Gaussian, `dt` unchanged, `times` still derived. Only `samples.length` moves.
- **Left alone deliberately: `TAIL_FACTOR = 5` in `deconvolve-parametric.js`.** That is a different
  cutoff serving a different purpose — the untruncated support of the *fitted* forward model used
  for the reconstruction and R² (ADR-0021 method 2, "Option B"), not the shape of a kernel anyone
  plots. Aligning the two to one ε is defensible and would make the story tidier, but it moves Tab 2
  fit numerics, which this change has no reason to touch. Flagged, not done.
- **Tests**: a `tailStep` invariant sweeps all three shapes across their full slider ranges and pins
  the bound, so a future support edit that reintroduces a step fails loudly. 237/237 core tests pass
  (233 before, +4 here), `machinery-check` OK, `template-acceptance` OK — the last matters because
  ADR-0038's template synthesizes its example recording from this same calcium builder.
- **Privacy posture untouched** (FOUNDATIONS §6): pure JS, no new dependency, no network.
- Relates to: [ADR-0003](0003-kernel-source.md) (the library whose builders these are),
  [ADR-0006](0006-linear-convolution.md) (the sparse convolution that makes longer kernels cheap),
  [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) (the contract the change preserves),
  [ADR-0032](0032-tab1-kernel-amplitude-control.md) (the peak-1 normalization the threshold is
  relative to), [ADR-0038](0038-input-template-working-example-recording.md) (the template built
  from the calcium builder).
