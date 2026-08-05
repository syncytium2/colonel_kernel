# ADR-0042: Tab 1 opens with noise on; the kernel band gets a key beside it

## Status

Accepted
(**Amends canon.** FOUNDATIONS §7 and §11.2 both recorded noise injection as *default-off*; §11.2's
bullet is retitled "Global, and ON by default" and both now point here. The Tab 2 half is
display-only. Supersedes [ADR-0031](0031-tab1-forward-noise-injection.md) §3's default-0 choice;
the rest of ADR-0031 — where noise is injected, how it is drawn, the seeded reseed — stands.)

## Context

**The clean default was arguing against the tool.** FOUNDATIONS §7 names noise injection
*"so deconvolution isn't deceptively easy"*, and then §11.2 set it to 0. Tab 1 therefore opened on
a perfect noiseless trace, and because the Tab 1 → Tab 2 handoff (ADR-0034) carries whatever Tab 1
has, Tab 2's default recovery ran on noiseless data too. Its headline numbers came out
**retained-kernel R² 1.0000, acausal ratio 0.0000** — a result no recording will ever produce, on
the tab whose whole job is judging whether a recovery can be believed. The first thing a visitor
saw was the easy case presented as the normal one.

**The kernel band's key was there but unfindable.** The kernel + STA square draws up to four curve
kinds — recovered kernel, STA, the Tab 1 source kernel, and in multi-region mode one hue per
region. A legend existed, but ADR-0033 had moved it *out of the square* and into the summary
panel's "kernel overlay" block, where in practice it sits below the fold: Tony's report was simply
that the inset has no key. It had also **drifted** — it still painted its kernel swatch
`#7b2ff7`, the literal the series stopped using when ADR-0041 moved kernels onto
`--series-you` — and its STA swatch was always solid even though the curve is dashed whenever a
region hue is in play.

## Decision

1. **Tab 1 opens at noise level 3×** cohort-typical σ (σ ≈ 0.0072 dF/F₀ — SNR ≈ 14 against the
   default 0.1 dF/F₀ kernel peak). Chosen by looking at it: the baseline is visibly grainy and
   every transient still reads unambiguously. 1× is invisible at this peak and 10× (SNR ≈ 4)
   buries the small events. **The clean case stays one drag away** and remains the right thing to
   show when the point is the convolution identity itself, so nothing is lost — only the default
   moves.
2. **The swatch key moves out of the summary panel and under the kernel square**; the *numbers*
   (peak lag / amp / STA peak) and the railed-output toggle stay in the summary, per ADR-0026's
   "numbers; figures are the instrument". A key has to be adjacent to the figure it explains.
3. **The key is derived from the same branch conditions and the same colors as the series** it
   describes, rather than written out beside them. That is what let the old one drift, and it is
   why the new key correctly reports the STA as **solid** when there is no region hue and
   **dashed** when there is — the series does exactly that, and the key now reads it from the
   same place.
4. **Dashed swatches are drawn as dashes.** The legend's `<i>` is a 3px bar, so a dashed curve
   gets a repeating gradient in its own color instead of a solid chip labelled "(dashed)".

## Consequences

- **Tab 2's default demo now looks like real data.** Retained-kernel R² 1.0000 → **0.8920**,
  acausal ratio 0.0000 → **0.0134**, and the recovered kernel visibly carries the ringing that
  regularized deconvolution produces from a noisy trace. This is the honest picture, and it is the
  picture ADR-0021's three-method framing and the §3 checks exist to interrogate. Anyone who wants
  the noiseless ground-truth loop back sets the slider to 0 in Tab 1 and re-enters Tab 2.
- **Turning noise on exposed a latent text bug**, which is the interesting part of the change:
  Tab 1's summary read "Synthesized dF/F₀ trace**with** measurement noise" — Svelte trims the
  leading space of an `{#if}` block, and the string had never been seen because the branch was
  unreachable at the default. Swept the codebase for the same pattern and fixed the other
  instance ("raw spike times**(**33 spikes)"); a third was removed with the legend move. A
  default that hides a branch also hides that branch's bugs.
- **No core change and no test change** — 237/237, machinery-check and template-acceptance pass.
  The defaults live in component state; the acceptance scripts drive core directly and were
  unaffected, which is why they could not have caught the R² = 1.0000 tell either.
- **Canon now says what the app does.** §7's cross-cutting clause and §11.2's control-scope bullet
  were the two places the old default was written down; both are updated, so FOUNDATIONS and the
  app do not disagree.
- **Not changed:** the noise model itself (`noise.js`, ADR-0015 v1 AWGN), where noise is injected
  (still the forward output), the seeded reseed, and the SNR readout — all ADR-0031, all intact.
- Relates to: [ADR-0031](0031-tab1-forward-noise-injection.md) (the tool whose default this
  flips), [ADR-0015](0015-harness-noise-model.md) (the σ calibration the 3× is measured in),
  [ADR-0032](0032-tab1-kernel-amplitude-control.md) (the 0.1 peak the SNR is computed against),
  [ADR-0034](0034-tab1-tab2-handoff.md) (the handoff that carries the noise into Tab 2),
  [ADR-0041](0041-plot-series-palette-one-color-per-quantity.md) (the token the old legend had
  drifted from), [ADR-0033](0033-shared-plot-shell-square-kernel.md) (which had moved the legend
  out of the square), [ADR-0026](0026-tab2-layout-left-rail-three-plot-bands.md) ("numbers;
  figures are the instrument", which keeps the readouts in the summary).
