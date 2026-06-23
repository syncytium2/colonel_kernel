# ADR-0017: Circular-deconv zero-padding needs no fix; detrend disposition is by anchor

## Status

Accepted.

Refines [ADR-0004](0004-tab2-deconvolution-method.md) (the regularization convention
is unchanged). Relates to FOUNDATIONS §3 (four-leg goodness-of-fit; machinery is
gated, fit is reported), §4 (negative-lag structure — coupling vs artifact is a
human call), [ADR-0011](0011-validation-gates-machinery-not-fit.md), and
[ADR-0014](0014-machinery-check-metric.md).

## Context

`NEXT_SESSION.md` parked a hypothesis surfaced by the eyeball test: because
`deconvolveCircular` requires a power-of-two length, a real trace (length N) is
zero-padded up to Npad; when the trace ends at a nonzero level, the step from that
end-level down to 0 looked like it might inject a low-frequency "bowl" / acausal
pedestal into recovered kernels (visible in `fig_real_kernels.png`, inflating the
acausal ratio). The note flagged this as wanting an ADR — possibly a detrend or
windowing fix — **before the Tab 2 UI presents recovered kernels on real data.**

It is resolved by four experiments, each eyeball-confirmed per the
graphical-confirmation standing rule (figures in gitignored `darkroom/`, not
promoted to `docs/img/` — the real-data figures derive from unpublished recordings,
and the synthetic oracle figure is kept with that set rather than split off):

- **Synthetic oracle** (`darkroom/fig_pad_isolation_oracle.png`) — a planted calcium
  kernel whose true acausal pedestal is **0 by construction**, so *every* sample of
  negative-lag content in a recovered kernel is pure recovery error. This isolates
  each effect against a known-zero baseline. Treatments: **A** periodic / no
  boundary step (baseline); **B** real-length with a nonzero end-level then
  zero-padded (only the pad step differs from A); **C** B + endpoint-anchored
  linspace detrend; **D** B + mean-subtract + Hann window; **E** B + quiet-anchored
  low-order curve fit; **F** B + robust-DC (median of quiet samples).
- **Real ROI 1** (`darkroom/fig_ef_real_roi1.png`, file 80, the decoupled targeted
  cell) — confirms behavior on the cell that actually matters, including whether the
  quiet mask swallows the ~790 s calcium-without-spikes contaminant.
- The earlier `darkroom/fig_padding_artifact_80.png` (raw vs linspace-detrend on real
  ROI 1) is the figure that first showed the bowl surviving a detrend, motivating the
  oracle isolation.

All recoveries use the unchanged ADR-0004 core path: `loadCsv` → binned-count
rasterize (FOUNDATIONS §13) → `deconvolveCircular` @ λ = 2e-3 → `kernelDiagnostics`.

## Decision

**Headline: no padding fix.** The oracle isolates the pad step's true contribution.
Even a **1.035 dF/F₀** end-step — 27× the real-data end-level of 0.039 — raises the
recovered-kernel acausal ratio by only **B − A = 0.0013**, comfortably under the 0.02
oracle gate. `deconvolveCircular`'s power-of-two zero-pad stays exactly as it is.

The detrend question splits three ways, **by what the correction is anchored on:**

1. **Endpoint-anchored detrend (C) and windowing (D) — EXCLUDED as harmful**, with a
   concrete mechanism in each case:
   - **C** anchors a ramp on the trace endpoints; when the trace is truncated
     mid-transient, one endpoint is a *transient peak*, so the ramp subtracts a
     spurious low-frequency signal that the FFT then attributes to the kernel
     (**C − A = 0.0155**, an order of magnitude worse than the pad step it was meant
     to fix).
   - **D**'s Hann taper attenuates real signal, crushing the recovered peak from
     0.24 to **0.10** (**D − A = 0.0541**). It corrupts amplitude, not just the
     pedestal.

2. **Quiet-anchored baseline removal (E quiet-fit curve, F robust-DC) —
   PERMITTED-BUT-NOT-PRESCRIBED, for display only, never in the recovery path.**
   Harmless on the oracle (**E − A = 0.0016**, **F − A = 0.0026**), and on real ROI 1
   it leaves the bowl intact (raw 0.301 → E 0.321 / F 0.302). It **requires both mask
   gates: spike-freeness AND low local variance.** Spike-freeness alone is
   insufficient — on real ROI 1 the ~790 s calcium-without-spikes contaminant *is*
   spike-free, so a spike-only mask would select it as "baseline." The variance gate
   is what excludes it: only **9%** of the contaminant window (its sharp,
   high-variance body) survives the mask, and the resulting robust-DC level (0.0027)
   sits at true baseline, uninflated by the 0.247 transient.

**Two quantities must be kept distinct and never blurred:**

- **Padding's isolated contribution: ≤ 0.0013** (oracle B − A).
- **Real ROI 1's raw acausal ratio ≈ 0.30** is almost entirely *genuine decoupling*
  — the correct FOUNDATIONS §3 verdict on this cell — plus **Laplacian-prior
  low-frequency blindness** (§4, human-judged per ADR-0014). It is **not** padding,
  and it is **not** removed by E/F.

## Consequences

- **The Tab 2 UI presents raw recovered kernels; there is no detrend or window in the
  recovery path.** A high acausal ratio on real data is the decoupling verdict
  working as intended (§3), not a numerical bug — which reinforces keeping
  regularization visible (FOUNDATIONS §7) and the read human-judged (ADR-0014). The
  parked artifact concern is closed; presenting recovered kernels on real data is no
  longer blocked.
- **If baseline handling is ever wanted for display**, the only safe form is
  quiet-anchored with *both* gates — never endpoint-anchored, never windowed — and it
  is a display transform, not a recovery step.
- **Out of scope:** the Laplacian prior's low-frequency blindness — the dominant term
  in the real-data bowl — is a regularization-convention question tracked as a
  separate open strand / future ADR. **This ADR resolves padding only and is not a
  remedy for the real-data bowl.**

## Caveats

Conditions under which the conclusion holds, stated plainly (not as hedges):

- The oracle's "quiet" *provably* means baseline; real-data "quiet" is *inferred*.
  The real-data confirmation is one ROI, one file.
- The variance gate works **because the 790 s contaminant is a sharp transient.** A
  broad, slow, spike-free calcium swell would be both spike-free *and* low-variance,
  could pass both gates, and be absorbed into the baseline estimate — and that
  absorption is itself a §3 decoupling signature. Quiet-anchored safety is bounded to
  sharp contaminants; this is the failure mode to watch if baseline handling ever
  ships.
- The oracle measures "padding does not corrupt a **recoverable** kernel." On
  decoupled data there is no kernel to corrupt, so the padding question is moot there.
  Do not over-claim the oracle result onto the real-decoupled regime — the two
  experiments answer different questions and are cited together for exactly that
  reason.
