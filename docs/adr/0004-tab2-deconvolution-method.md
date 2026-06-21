# 4. Tab 2 deconvolution method — regularized least squares ported from deconvreg

## Status

Accepted

## Context

- Tab 2 (the flagship) recovers a **kernel** given known spikes and a known calcium trace
  (`FOUNDATIONS.md` §2). The proven lab method is `TDdeconvStack`, which calls MATLAB's
  `deconvreg` — see [docs/reference/matlab-deconv-pipeline.md](../reference/matlab-deconv-pipeline.md)
  for the verbatim source and full annotations.
- `deconvreg` is **constrained least squares with a default Laplacian smoothness prior**. Naive
  spectral division (`FFT(output) / FFT(kernel)`) is unusable — it amplifies noise catastrophically
  — which is why a regularized solver is required.
- In the lab method the regularization is applied **silently** (`deconvreg` is called with no
  explicit parameter), so the smoothness prior shapes every recovered kernel without the user
  seeing it. For the "is there a clean kernel?" question this matters: how hard you regularize
  directly affects whether a borderline recording looks coupled.
- The method relies on **convolution commutativity**: passing spikes as the "PSF" and the trace as
  the "image" returns the kernel as the deconvolved result (see reference §3.1).
- Spikes enter as event **times** and are binned to the frame grid internally (see
  [ADR-0001](0001-delta-rasterization.md), binned-count). The kernel window is **symmetric**
  (±`win`), spanning negative and positive lag.

## Decision

- Tab 2 recovers the kernel via **regularized least squares** (Tikhonov / constrained least
  squares, the `deconvreg` family), reimplemented in JS. This is the flagship deconvolution path.
  **Naive spectral division is NOT used** for the real recovery — it may still appear in the
  *teaching* tabs as a "watch it fail" demonstration (`FOUNDATIONS.md` §7).
- **Regularization strength is made explicit and user-adjustable** (a visible slider), **not**
  auto-hidden as in `deconvreg`. Surfacing the smoothness-vs-fidelity tradeoff is a deliberate
  improvement over the MATLAB workflow.
- The recovered kernel keeps the **full symmetric ±`win` window** — negative-lag content is
  **retained, not zeroed**. Rationale: the kernel's lag structure is scientifically meaningful. The
  reference spike train need not belong to the cell whose trace is deconvolved (e.g. cell A's
  spikes vs cell B's trace under coupling), so lead/lag/delay structure — including energy at
  negative lag — encodes the temporal relationship between the spike train and each ROI. This is
  central to the multi-ROI coupling question (`FOUNDATIONS.md` §4). Zeroing negative lags would
  discard exactly that information.
- The display **marks the zero-lag line clearly** so a user can see at a glance whether a recovered
  kernel sits at zero lag, leads, or lags.
- Port these implementation details from the reference:
  - **odd-length kernel** with a true center sample;
  - `window_samples = round(win / delta_t)`;
  - the **length guard** — require `k > 2*window_samples`, else report "region too short" with a
    friendly message;
  - **buffer padding** (~10 samples) before the first / after the last spike so kernel edges aren't
    data-starved.
- **Per-ROI execution:** run the recovery once per trace column — the per-pixel loop of the MATLAB
  stack becomes a per-ROI-column loop (`FOUNDATIONS.md` §4).

## Consequences

**Pros**

- Reuses a **validated method**.
- **Explicit regularization** lets users see — and is required for honestly answering — the
  smoothness-vs-fidelity tradeoff.
- **Retained negative lag** turns kernel position into a coupling-direction readout, enriching the
  multi-ROI investigation from "is there a kernel?" to "is there a kernel, *and what is the
  lead/lag relationship?*"

**Cons / caution**

- The smoothness prior can make a borderline-uncoupled recording's kernel look **more plausible
  than the raw data supports**. Hence regularization must stay **visible**, and the goodness-of-fit
  readout (`FOUNDATIONS.md` §3) must accompany every kernel.

**Scope**

- This ADR governs **only Tab 2's recovered kernel**. It does not govern the *chosen* kernels of
  Tabs 1/3 ([ADR-0003](0003-kernel-source.md)), and the **STA cross-method validation partner is a
  separate decision** (next ADR).
