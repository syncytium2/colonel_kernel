# ADR-0046: Tab 1's challenge becomes "Stamp the kernel" — the forward problem, played forward

## Status

Accepted
(Replaces the "Fit the trace" challenge; `FitTheTrace.svelte` is deleted. Tab 1's Learn view is
untouched, as is the core — the challenge composes shipped primitives only.)

## Context

Every challenge should invert its own tab, and two of the three did. Tab 2 recovers a kernel from
known spikes, and Beat the Colonel has you shape a kernel with the spikes given. Tab 3 infers
spikes from a known kernel, and Guess the spikes has you place spikes with the kernel given.

**Tab 1 is the forward tab** — input ⊗ kernel → output — but *Fit the trace* hid **both** the
spikes and the kernel and scored recovery by R². That is Tab 2's job and Tab 3's job at once, on
the one tab that is not about recovery. Its own header comment called it "the forward problem,
played by hand," which is precisely what it was not.

Worse, it **duplicated a mode already shipped**: Guess the spikes' Advanced mode is described in
its source as *"the kernel is ALSO unknown; you tune it AND place the spikes"* — the same task, on
the tab where it belongs, scored more richly (spike-match F1 plus a race against the machine).

Tony raised it, chose the replacement, and specified the mode split.

## Decision

**"Stamp the kernel": both the spikes and the kernel are given, and you build the output.**

1. **The interaction is the algorithm.** `convolve.js` describes itself as *"stamp and sum: for
   each occupied input sample, add a scaled copy of the kernel at that offset"* (ADR-0044). You
   click to drop a kernel copy at each spike; your stamps are rasterized and convolved with the
   **same given kernel**, so the assembled trace is a real convolution of your own placements —
   never a mock-up. Any gap is a placement error, never the arithmetic.
2. **Normal shows the target; Advanced hides it until you commit.** Matching versus prediction,
   the same Normal/Advanced shape Guess the spikes already uses.
3. **The round is engineered, not sampled.** A Poisson draw over 30 s is mostly isolated spikes,
   which makes the exercise a clicking chore that never shows superposition. Groups are placed
   deliberately — four singles, one **pair**, one **triplet**, members within a kernel decay of
   each other — so summed peaks differ visibly by group size (measured: 0.10 single, 0.18 pair,
   0.25 triplet) and stamping only one of a burst is immediately wrong in the trace.
4. **The pass threshold comes from the measured score distribution, not from feel.** On a
   representative round: all nine stamped exactly = 1.000, one stamp a single sample off = 0.990,
   three off = 0.970 — but **missing a spike = 0.907**, and one spurious extra = 0.907. The
   threshold is **0.97**, the gap between those two populations. The first draft used 0.9, which
   would have celebrated a missed spike — exactly the mistake the challenge exists to expose.
5. **The output band's y-axis is pinned** to `[-0.03, 3.5 × kernel peak]`. Two reasons: with no
   stamps the series is all zeros and uPlot auto-ranges to 0–100, which reads as a broken plot;
   and in Advanced an axis that grew to fit the hidden target would hand over the burst peak,
   which is the very quantity being predicted. The bound derives from constants, so it is
   identical in every round and leaks nothing.

## Consequences

- **Tab 1 finally has a challenge in its own direction**, and no challenge duplicates another.
- **Verified by driving the real UI**, not by reasoning: clicking all nine spikes scores
  **R² 1.000** with the "Exact" verdict in both modes; stamping the triplet once scores **0.655**
  and the target visibly separates from the player's trace at that burst (0.25 vs 0.10).
- **A harness bug worth remembering.** The first drive scored 0.932 with all nine placed, because
  the click mapping assumed the axis spanned 0–30 s when the data ends at **29.9** (300 samples at
  0.1 s). The app was right and the test was wrong — and the score's sensitivity to a one-sample
  drift is what surfaced it.
- **Reuses everything**: `rasterize`, `buildKernel`, `convolveOnGrid`, `rSquared`, the editable
  `Plot`, `Shell`, `Celebration`. No core change; 240/240, machinery and template acceptance pass.
- **Given spikes point up, your stamps point down** — direction carries *whose*, so a stamp
  sitting on its spike never occludes it, and identity is not left to color alone (ADR-0041).
- **Not carried over:** Fit the trace's kernel sliders. Shaping a kernel is Beat the Colonel's job
  (ADR-0021 method 2's hand-played analogue); here the kernel is given because the forward problem
  gives it.
- Relates to: [ADR-0044](0044-convolution-scatter-form.md) (the stamp-and-sum formulation this
  makes interactive), [ADR-0041](0041-plot-series-palette-one-color-per-quantity.md) (the series
  tokens), [ADR-0043](0043-tab3-overlay-true-and-recovered-input.md) /
  [ADR-0045](0045-close-axis-tax-and-csp-style-attrs.md) (the axis-tax rule its bands follow),
  [ADR-0033](0033-shared-plot-shell-square-kernel.md) (the shell it fills).

## Still open

The **slide-and-multiply animation** deferred in NEXT_SESSION is *related but not discharged*.
This challenge makes the learner perform stamp-and-sum; it does not animate the kernel sliding
across the signal. Whether the animation is still wanted now that the operation is playable is a
question for Tony.
