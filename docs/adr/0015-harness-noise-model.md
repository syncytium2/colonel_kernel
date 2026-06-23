# ADR-0015: Noise model — v1 AWGN, user-adjustable 0–10× cohort-typical σ; richer model deferred to v2

## Status

Accepted
(v1 scope. The white-Gaussian shape and σ rest on the ROI-1 characterization plus a
39-recording reconnaissance; the richer per-region / distributional / shot-noise model is
explicitly deferred — see Decision part 3. Revisit after all three tabs are built.)

## Context

The noise model has **two consumers**, both of which need the same `noise` term defined:

- the **machinery-check harness** ([ADR-0014](0014-machinery-check-metric.md), `NEXT_SESSION.md`),
  which validates kernel recovery against a synthetic oracle
  `spike ⊗ planted-kernel + noise → recover → compare to planted`; and
- the **app's user-facing noise-injection control** — already foreseen in `FOUNDATIONS.md` §7
  ("optional noise injection, so deconvolution isn't deceptively easy") with its control scope
  already settled in §11.2 ("global-but-default-off — noise injection").

The question is how faithful that model must be for **v1**, and how the level is set.

Two evidence sources:

1. **ROI-1 characterization** (`APs_v1_20241004_80.mat`, ROI 1). High-pass residual (2 s
   rolling-median removed, quiet samples): additive white Gaussian, **σ ≈ 0.0035–0.004 dF/F₀**,
   autocorr ≈ 0, skew ≈ 0.03, excess kurt ≈ 0.19, SNR ≈ 60 against a ~0.24 transient; a weak
   second-order **shot term** (~12 % at high signal).

2. **Reconnaissance across all 39 recordings** (read-only; scripts + report in gitignored
   `darkroom/`, summarized here so the finding is durable in-repo). 2074 ROI×region residual
   series, same method as ROI-1. Findings:
   - **White-Gaussian holds on quiescent (`baseline`) regions:** median autocorr lag-1 ≈ −0.03,
     skew ≈ 0, excess kurt ≈ 0.2 — matching ROI-1. 243 zero-flag clean-active ROIs across many
     recordings (the method reproduces the ROI-1 numbers exactly as an anchor).
   - **σ landscape:** clean-active σ median ≈ **0.0024**, IQR 0.0022–0.0027, full 0.0017–0.0037.
     ROI-1's σ ≈ 0.0034 sits at the **high end**, not the centre. Mild per-recording clustering
     (median σ 0.0019–0.0037 across recordings).
   - **Whiteness is region-type dependent (main new finding):** `baseline` regions are white
     (acf1 ≈ −0.03); **drug / depolarization regions are not** — senktide (agonist) acf1 ≈ +0.05,
     high K⁺ / HiK (depolarization) acf1 ≈ +0.13…+0.18.
   - **Interpretation — not a changed noise floor:** in drug regions acf1 moves far more than σ
     (acf1 −0.03 → +0.18 while σ only 0.0024 → 0.0032). That signature is leftover *signal* in the
     residual — intermediate-timescale drug dynamics the 2 s high-pass cannot fully remove, a
     relative quiescence threshold that is lax when the dynamic range is huge, and network/neuropil
     background under dense firing — **not** a genuinely different measurement-noise process. The
     true white floor (photon shot, sensor read noise) is set by the imaging, not the biology.
   - **High-frequency regime:** 238/2074 series yield no quiet samples (spike rate ~6× higher);
     correctly excluded.

The recon confirms the original ROI-1 white-Gaussian call **generalizes — but only on quiescent
regions** — and surfaces structure (region dependence, a σ distribution, the shot term) richer
than a v1 machinery check needs.

## Decision

Three parts.

**(1) v1 noise model = additive white Gaussian (AWGN), level user-adjustable via a slider from
0 to 10× cohort-typical σ.** The empirical anchor is **cohort-typical σ ≈ 0.0024 dF/F₀** (recon
clean-active median; IQR 0.0022–0.0027) — the slider's **1× reference unit**. Slider range
**0 (clean) → 10× (σ ≈ 0.024 dF/F₀)**; **default = 0 / off**, per the already-settled control scope
(`FOUNDATIONS.md` §11.2). One calibrated control serves both consumers: the user-facing
noise-injection feature, and the machinery-check harness, which plants AWGN at a level expressed in
the same cohort-typical units and can **sweep** the slider range to probe recovery stability vs
noise (the Stability leg, §3 check 3). The ROI-1 σ ≈ 0.0035 is no longer a baked-in choice — it is
simply ≈1.5× on this slider, so the "conservative machinery test" is just running the slider a notch
above 1×. No per-recording or per-ROI σ in v1; the slider is a single global level.

**(2) The σ and the white-Gaussian shape are taken from quiescent (`baseline`-type) regions only.**
This is the one recon caveat v1 honours, because it is free to: baseline regions are where the
residual is closest to true measurement noise. The harness does not characterize its noise from
drug/depolarization regions.

**(3) The richer model is deferred to v2, revisited after all three tabs are built.** Explicitly
out of v1 scope, recorded here so the analysis is not lost (none blocks v1):
   - region-type-conditioned noise (modelling the autocorrelation of drug/depolarization regions);
   - σ as a distribution / stress-set (low–typical–high) or per-recording σ;
   - the signal-dependent (shot) noise term (~12 % at high signal);
   - the contamination test that would formally separate "leftover signal" from "changed noise
     floor" — tighten the quiescence criterion in drug regions and confirm acf1 falls toward 0.

## Consequences

- **The harness can be built now** (`NEXT_SESSION.md` item 2 unblocks): plant a physiological
  kernel (sharp onset at lag 0, peak +0.6 s, τ ≈ 2.7 s per the ROI-1 read), add AWGN at a chosen
  slider level (cohort-typical units), recover, compare per
  [ADR-0014](0014-machinery-check-metric.md) (causal-lobe / peak-lag + τ + amplitude, human-judged).
- **The slider doubles as a teaching and a stability instrument.** Sweeping it from 0 upward shows,
  live, where recovery degrades — the §3 Stability leg made interactive, and the §7 "don't make
  deconvolution deceptively easy" intent realized. Default 0/off keeps the clean case the first
  thing a learner sees (§11.2).
- The cohort-typical anchor (0.0024) and the 0–10× range are **empirically grounded** by the recon,
  not guessed; 10× ≈ 0.024 dF/F₀ is ~10 % of a typical ~0.24 transient (SNR ≈ 10 at the top of the
  range — noticeably hard, not absurd).
- The region-type finding and σ landscape are preserved as durable rationale **here**, even though
  the underlying recon artifacts (`darkroom/noise_recon.md`, figures, JSON) are gitignored and may
  be regenerated or discarded.
- **Realizes (does not change) settled FOUNDATIONS points:** §7 (noise injection as a cross-cutting
  feature) and §11.2 (its global, default-off scope) already anticipate this control; this ADR adds
  the AWGN shape and the 0–10× cohort-typical calibration. No FOUNDATIONS contradiction to
  reconcile; a one-line cross-reference from §7/§11.2 to this ADR is optional polish. Relates to:
  [ADR-0014](0014-machinery-check-metric.md) (metric the recovered kernel is judged by),
  [ADR-0011](0011-validation-gates-machinery-not-fit.md) (machinery gated / fit reported),
  [ADR-0004](0004-tab2-deconvolution-method.md) (deconvolution method under test),
  `FOUNDATIONS.md` §3 (synthetic oracle + Stability leg), §7 (noise injection), §11.2 (control scope).
- **UI detail left open** (per §11.4, disclosure layout is designed when each tab is built): whether
  the slider is linear or log in σ, and its tick labels (e.g. "1× typical", "ROI-1 ≈ 1.5×"). Not a
  decision blocker.
