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
- **Real ROI 1's raw acausal ratio ≈ 0.30** sits *beneath a recovered kernel*, not
  in place of one: ROI 1 carries an explicit λ-stable +0.6 s causal peak (the
  FOUNDATIONS §3 real-data positive control, agreeing with the lab `deconvreg`
  peak — +0.84 over the ±1 s window; the whole-window −0.74 is baseline-dominated,
  not peak disagreement). The negative-lag bowl is dominated by **Laplacian-prior
  low-frequency blindness** (§4, human-judged per ADR-0014), with a localized
  calcium-without-spikes contaminant (~790 s) as a second term. It is **not**
  padding (≤ 0.0013, above) and **not** removed by E/F. The bowl is a feature of the
  negative-lag tail, not evidence against the recovered kernel.

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
- The oracle measures "padding does not corrupt a **recoverable** kernel," and ROI 1
  — the real-data positive control — confirms a recoverable kernel survives the real
  pipeline. The padding result does **not** extend to a *fully uncoupled* ROI, where
  there is no kernel to corrupt and the padding question is moot. Do not over-claim
  the oracle result onto that fully-uncoupled regime — the two experiments answer
  different questions and are cited together for exactly that reason.

---

## Correction (2026-08-13, revised 2026-08-16) — "contaminant" is the wrong word, and "~780–800 s" is the wrong bracket

Six places above (lines 38, 71, 73, 86, 112, 116) call the ~790 s episode on file-80 ROI-1 a
**"calcium-without-spikes contaminant."** Two things are wrong with that, in different ways:
the **word** (a naming error, §2 below) and the **bracket** (a measurement error, §1). The
phrase "calcium without spikes" is itself **accurate for the transient** — that part was
right all along. The **decisions in this ADR do not change**; every treatment exclusion and
permission above stands.

> **This correction was itself wrong on first writing (2026-08-13) and is revised here.** It
> originally recast the episode as a "~10× gain anomaly," on the strength of a window-level
> aggregate. Plotting the trace refuted that. The bad claim and its repair are both kept
> below rather than quietly overwritten, because the mechanism that produced it is the point.

### 1. The measurement: the bracket merged two events

Recomputed from `exports/APs_v1_20241004_80__region1.csv`, and **plotted** —
`darkroom/colonel_kernel/2026-08-13_kernel-cleaning/fig_790s_episode.png`. Two events sit
back to back inside the old ~780–800 s window:

| | 777.7–786.3 s — the AP burst | 786.7–800 s — the transient |
|---|---|---|
| APs | **10** (777.66 … 786.25) | **none** |
| local AP rate | **1.16 Hz** vs region mean 0.117 Hz | — |
| ROI-1 peak | **0.037 dF/F₀** | **0.247 dF/F₀ at 792.71 s** |
| vs a comparable 7-AP bout (712–722 s, peak 0.023) | **proportionate — normal gain** | ~10× a normal response, with no APs to attribute it to |
| timing | — | onset **+0.46 s**, crest **+6.46 s** after the last AP (kernel peak lag **+0.6 s**) |

So the window is not spike-free, but **the transient is** — there is not one AP between
786.25 s and 800 s. The APs that precede it got an ordinary, proportionate response; the
transient is a separate event. What was wrong in the original wording was the **bracket**,
which credited the transient's amplitude to a burst that had already ended.

**The failure mode, stated so it is not repeated:** a window-level aggregate —
peak-in-window over APs-in-window — cannot tell whether the peak and the spikes belong to the
same *event*. Both the AP count and the arithmetic were checked and both were correct, and
the conclusion was still false. **Event-level claims may not be made from window-level
statistics**; only the picture separates them. That is what the graphical-confirmation
standing rule at the top of this ADR is for, and it was skipped here.

**Still open:** the +0.46 s onset sits near this record's +0.6 s kernel peak lag, so the
transient may be *evoked* by the last AP rather than independent of it — in which case its
kinetics and amplitude are grossly anomalous (a six-second rise against a 0.6 s kernel,
0.247 where the same burst had just produced 0.037). Either reading is decoupling; which one
is a human call (ADR-0011, ADR-0014).

### 2. The name: "contaminant" answers a question this tool exists to leave open

Calcium that is not explained by the targeted cell's APs is **physiology, not dirt.** It is
the phenomenon `colonel_kernel` was built to surface (FOUNDATIONS §3/§4), and the app's own
simulation already names it correctly: `premise-sim.js` calls these events **"AP-independent
calcium"** and labels them **"the violation"** — i.e. the finding, deliberately modelled.

Nor is "physiology" even the only live reading. Absence of APs *in the loose-patch targeted
cell* is not absence of cause: a neighbouring cell, neuropil bleed into the ROI, or motion can
all put calcium in that trace. Which of these it is, is exactly the human call this project
insists on (ADR-0011, ADR-0014, §4). **"Contaminant" pre-answers it — in the one direction
the tool is built to refuse.**

### Why the slip was easy, and the general rule

Inside this ADR's frame the word was locally defensible: the experiment is about estimating a
baseline, and for a *baseline estimator* such an event genuinely is a problem — it corrupts the
estimate. The error is attaching the estimator's difficulty to the biology. Nothing in the
animal is being contaminated; a statistical procedure is being misled.

**The test, generally: would the word still make sense if the estimator did not exist?**
"Transient," "AP-independent event," "gain anomaly" all survive that test. "Contaminant" does
not — it exists only relative to a method, so applying it to the phenomenon silently promotes a
method's inconvenience into a claim about nature. This project has the standing habit of
keeping human verdicts and machine screens in separate columns (`fit_ok` vs `screen_decent` in
the kernels export). This is the same discipline applied to vocabulary.

The ADR half-knew already. Its own caveat says a spike-free swell "could pass both gates, and
be absorbed into the baseline estimate — **and that absorption is itself a §3 decoupling
signature.**" That sentence treats such an event as signal. The word "contaminant," six lines
away, treats it as noise. When one document says both, the wording is what is wrong.

### What the corrected reasoning changes — less than the first draft claimed

**The quiet-mask argument in the Decision above stands exactly as written, and the 2026-08-13
draft was wrong to disturb it.** That argument says spike-freeness alone is insufficient
because the ~790 s event *is* spike-free and a spike-only mask would select it as "baseline."
With the transient correctly bracketed at 786.7–800 s and carrying **no APs at all**, that is
simply true. The draft replaced this with a claim that the operative problem was a
spike-*distant tail* of an AP-driven response — a consequence of the merged bracket, and
withdrawn.

One genuine addition survives, as an **additional** mechanism rather than a replacement:

> **Calcium events also outlast the spikes that cause them.** An ordinary evoked event whose
> decay exceeds the proximity window leaves a spike-distant tail that a spike-only mask will
> call baseline — recovered τ on these recordings runs 0.48–1.49 s against a ±1 s gate. This
> is a real hazard for quiet-masking in general. It is **not** what the ~790 s episode is.

Both mechanisms point the same way about what the variance gate is doing: not "excluding
contamination," but **declining to absorb the phenomenon into the thing the phenomenon is
measured against.** The residual risk in the Caveats reads accordingly — not "leftover noise
in the baseline" but **"you may have subtracted the finding."**

### Supporting evidence added since

An oracle run on 2026-08-13
(`darkroom/colonel_kernel/2026-08-13_kernel-cleaning/fig_kernel_cleaning_oracle.mjs`, synthetic, planted
kernel of known amplitude) measured post-recovery baseline removal — the operation the
haruspex team proposed for the shipped `fv` waveforms. On a **decoupled** ROI with no kernel
planted and true amplitude zero, baseline-shifted readouts reported up to **40% of a real
kernel's amplitude**. Any baseline operation strong enough to flatten a pedestal is strong
enough to manufacture a kernel where there is none, or to absorb a real AP-independent event.
That is the quantitative form of this correction, and the reason no automatic kernel-cleaning
step ships in the app.

### Conflict raised and RESOLVED: FOUNDATIONS §3 carried the same bracket

FOUNDATIONS §3 described the episode as "a large calcium transient (**~780–800 s**, ~0.24
dF/F₀) with no matching spike burst (calcium without APs)". Its *characterization* was right;
its **window** was not, and the loose window is what let a ~10× gain anomaly be derived from
it. Per CLAUDE.md the conflict was flagged rather than silently diverged from, and FOUNDATIONS
— which is canonical — was then **deliberately edited to match, in the same change that
resolved this flag**: the transient re-bracketed to ~786.7–800 s, the preceding AP burst named
as a separate event with a proportionate 0.037 response, and the open question recorded (a
+0.46 s onset against a +0.6 s kernel lag leaves "evoked with anomalous kinetics" live
alongside "AP-independent").

The two documents now agree. If a future reader finds them disagreeing again, FOUNDATIONS wins
on the settled point and this section holds the recomputed numbers and the figure behind it.
