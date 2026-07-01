# FOUNDATIONS

> **Canonical source of truth for this project.**
> Read this file at the start of every session — human, Claude (chat), and Claude Code alike.
> If anything in a conversation contradicts this file, this file wins until it is deliberately edited.
> Changes to settled decisions go through an ADR; this file is then updated to match.

---

## 1. What this tool is

A **1D convolution / deconvolution tool** with two intertwined purposes:

1. **A teaching demonstrator** — show what convolution and deconvolution *are*, using a
   spike-train input model (a list of delta-function times) rather than continuous functions.
2. **A ground-truth verification instrument for the calcium-imaging field** — let a lab load a
   paired recording (known spike times + measured calcium traces) and ask: *what kernel relates
   the spikes to the trace, and is there a clean one at all?*

The same mathematical relationship underlies everything:

```
output = input ⊗ kernel
```

The tool is organized as **three tabs**, each solving this relationship for a different unknown.

---

## 2. The three tabs

| Tab | Given | Solve for | Operation | Role |
|-----|-------|-----------|-----------|------|
| 1 | input, kernel | output | convolution | Teaching context |
| 2 | output, input | **kernel** | deconvolution | **FLAGSHIP** |
| 3 | output, kernel | input | deconvolution | Teaching / honest illustration |

### Tab 2 is the flagship — this is the primary use case

- The **spike train is known** (ground-truth recorded spike times — not hand-authored, not inferred).
- The **calcium trace is known** (measured dF/F₀).
- The **kernel is the unknown** we recover.
- This is a *better-posed* problem than spike inference: solving for a kernel given two known
  signals is more stable than recovering spikes from a trace.
- **Method:** the kernel is recovered by regularized least squares with explicit, user-adjustable
  regularization and a symmetric retained-lag kernel (see [ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)),
  and is always read against an independent STA validation partner (see
  [ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)).
  > **Recovery is being extended to three parallel methods ([ADR-0021](docs/adr/0021-kernel-recovery-three-parallel-methods.md), proposed).** The
  > existing regularized least squares (above) is the **free-vector** method; alongside it sit a
  > **constrained-parametric** double-exponential fit and a **shape-regularized** variant. All three
  > are retained — **the spread between them is diagnostic** (coupled → converge; decoupled → diverge).
  > Build order is incremental (free → parametric → shape-regularized); the design is canon now.

**The scientifically important job of Tab 2 is not just "recover the kernel" — it is to report
whether a clean kernel exists at all.** Research indicates spikes and calcium signal can be
*uncoupled*: there may be no single linear kernel that relates them. A poor fit is not a tool
failure — it is the scientifically interesting answer. The tool exists to let labs verify their
ground-truth recordings in a friendly environment.

### Tab 3 is kept but deliberately demoted

Spike inference (recover input spikes from a trace + kernel) is a genuinely hard problem with far
more sophisticated approaches that live in a **separate project**. Tab 3 stays so students and
researchers can *see what naive spike inference does* — precisely so they appreciate why it is hard
and why better methods exist. It is honest illustration, not a recommended workflow.

### Tab 1 is the conceptual on-ramp

Forward convolution. Stamp a copy of the kernel at each delta time, scaled by amplitude, sum the
overlaps. The clearest teaching view; also the natural place for a slide-and-multiply animation.

### "The kernel" plays three distinct roles

A recurring source of confusion is that "the kernel" is not one object — it appears in three
distinct roles across the tabs. This is durable structure worth stating explicitly:

1. **Tab 1 input kernel — *chosen*,** to demonstrate convolution. Drawn from the parameterized
   library (see [ADR-0003](docs/adr/0003-kernel-source.md)).
2. **Tab 3 input kernel — *chosen*,** for the naive spike-inference illustration. The
   calcium-shaped parameterized kernel (`tau_rise` / `tau_decay`) is the natural pick here, since
   Tab 3 is the calcium-flavored teaching tab.
3. **Tab 2 recovered kernel — a *solved-for output*, not an input.** It is judged against a
   plausibility model (fast rise + exponential decay) as one of the four goodness-of-fit checks
   (§3). ADR-0003 does **not** govern this kernel — it is recovered, not chosen.

### Three kernel *concepts*: chosen → idealized-recovered → recovered

The roles above answer *which tab uses the kernel*. A second, orthogonal axis answers *how the
kernel came to exist* — authored vs. measured — and it runs along a continuum with a deliberately
named midpoint. Keeping these three concepts distinct prevents the recurring conflation of a
teaching kernel with a measurement result:

1. **Chosen / teaching kernel** — *authored* by the user from a family + parameters (gaussian,
   exponential, boxcar, calcium; [ADR-0003](docs/adr/0003-kernel-source.md)). Mostly **causal**,
   origin at the spike. This is the Tab 1 / Tab 3 input kernel.
2. **Idealized recovered kernel** *(the bridge)* — a **chosen kernel standing in for a recovered
   one.** It is a clean, authored object (calcium or exponential) that is assigned the *role* of a
   recovered kernel, so the forward path can be exercised and validated against a known-good
   stand-in **before** facing a messy, real recovered kernel. It is the conceptual link between the
   two ends of the continuum.
3. **Recovered kernel** — *measured* from data by deconvolution (the commutativity trick,
   reference doc §3.1). **Symmetric about a center origin** (`zeroIndex = window_samples`, length
   `2*window_samples+1`), and it **retains negative-lag content** that encodes cross-cell coupling
   direction (§4, §13, [ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md),
   [ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)).

**The idealized recovered kernel is a teaching / validation *device*, not a separate code object.**
It is an ordinary chosen kernel (concept 1) that has simply been given the *role* of concept 3. The
distinction is **role first, with shape following** — nothing in the code needs a new kernel type to
support it; it is a chosen kernel used in a recovered kernel's place. (How a chosen kernel's
mostly-causal shape is reconciled with the symmetric, negative-lag layout of the recovered-kernel
role — padding, centering — is an implementation detail for whenever the validation path is built,
not a settled point here.)

> **Resolved — open family toggle ([ADR-0010](docs/adr/0010-idealized-recovered-kernel-open-family-toggle.md)).**
> There is **no single canonical** idealized-recovered family. *Any* chosen-kernel family
> (gaussian, exponential, boxcar, calcium, or one added later) can be assigned the stand-in role via
> a **user-selectable, open toggle**. The difference between a minimal stand-in (exponential) and a
> richer one (calcium) is itself the lesson — same data, varied model — and keeping the toggle open
> deliberately preserves unphysiological stand-ins (notably **boxcar**) as *probes* that expose
> forward-path / alignment artifacts a smooth kernel would mask. The forward path must therefore
> accept **any** family in this role; none is special-cased.

### Future direction: spike-inference companion app (out of scope)

**Purpose boundary.** Colonel Kernel solves `output = input ⊗ kernel` with **both `output`
and `input` known** — ground-truth paired recordings where the calcium trace *and* the spike
times are in hand. The unknown is **the kernel**, or whether a clean one exists at all. This is
the **deconvolution-native, ground-truth-verification stance**: the tool interrogates whether
spike–calcium coupling exists, surfaces *decoupling*, and **refuses to assume the kernel**. That
skeptic stance is the tool's scientific contribution — the decoupling-incidence finding (§3) and
the non-targeted-ROI kernel phenomenon (§4).

**The companion direction.** Spike **inference** — solving for the *spikes* given **only** the
calcium trace and an *assumed* generative model — is the inverse problem in the **opposite
direction**, and is a **named future companion app, explicitly out of scope here.** The field's
three method families already run in the lab's MATLAB: **CASCADE** (supervised deep learning,
trained on ground truth), **MLspike** (model-based Bayesian MAP inference over a biophysical
generative model with drifting baseline and indicator nonlinearities), and **OASIS** (fast convex
AR-model sparse inference). A companion app could apply Colonel Kernel's *own* philosophy to the
inference direction — **run all three in parallel, show the spread as the diagnostic,
human-judged** — rather than trusting any single method. (This is the "separate project" the Tab 3
demotion above gestures at, named.)

**Why the separation is principled, not incidental.** The two apps embody **opposite epistemic
stances.** Colonel Kernel is a **skeptic**: it *has* ground-truth spikes and tests whether coupling
holds. Spike-inference tools are **believers**: they *assume* the generative coupling model and
infer spikes through it. Merging them would **blur exactly the assumption Colonel Kernel exists to
interrogate.** Keeping inference in a separate app keeps each tool honest about what it assumes.
This is the canonical answer to *"why isn't OASIS / MLspike / CASCADE a button in this tool"* — it
is **not an omission, it is the boundary.**

**Relation to the parametric foil ([ADR-0021](docs/adr/0021-kernel-recovery-three-parallel-methods.md),
method 2).** The double-exponential parametric fit in ADR-0021 is **not spike inference** and **not
a deconvolution** — it is a deliberately minimal **linear reference shape (a "foil")** that the
deconvolution methods are *read against*, structurally analogous to STA's cross-method role
([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)). It is **intentionally simpler than
MLspike's biophysical model**: MLspike models baseline drift as a nuisance term and includes
indicator nonlinearity / saturation; the foil **omits both by design.** Two caveats follow and are
recorded here:

1. **The foil is linear**, so a column that *departs* from it may be **nonlinearly coupled rather
   than decoupled** — deviation from the foil is **not by itself evidence of decoupling.**
2. The field's state of the art treats **baseline drift as something to *model*, not zero** — the
   standing caution behind ADR-0021's shape-regularized **baseline-flatness** term. **Resolved by
   [ADR-0023](docs/adr/0023-method3-baseline-strategy.md) (Accepted):** method 3 adopts **both** a
   baseline-flatness penalty **and** a minimal low-order **drift nuisance basis**, combined in one
   objective — figure-gated to recover a known τ_decay without the basis stealing decay, with the
   basis held deliberately minimal (the load-bearing conservative dial). The basis is a
   kernel-protection device, **not** a trustworthy drift measurement (its recovered drift over-claims
   ~3.9×); a baseline-nuisance variant that needs a real drift estimate stays a future item.

---

## 3. The flagship's core deliverable: "is there a kernel, or isn't there?"

Recovering a kernel **always returns something** — the question is whether it is meaningful.
The tool must surface **four checks** so the user can judge:

1. **Kernel plausibility** — does the recovered kernel look like a real indicator transient
   (fast rise, exponential decay), or like noise / ringing?
2. **Reconstruction residual** — convolve the known spikes with the recovered kernel, compare to
   the actual trace, report the residual.
3. **Stability** — does the kernel stay consistent (across regularization settings, across spikes),
   or does it swing wildly?
4. **Cross-method agreement** — the deconvolved kernel ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md))
   is read against an independent **spike-triggered average (STA)**. Agreement is a primary
   "is there a real kernel?" signal. Because STA and deconvolution have *different* failure modes
   (STA breaks at high spike frequency; deconvolution holds), their agreement must be read alongside
   the **spike rate** (see [ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md) for the
   three-regime interpretation).

**Spike rate is surfaced as displayed context** in the flagship readout: it tells the user whether
STA/deconv disagreement is benign (high-frequency regime, where STA is expected to degrade) or
alarming (possible uncoupling).

An **uncoupled** recording shows up as: implausible kernel shape + high residual + unstable estimate
+ STA/deconv disagreement that the spike rate does *not* explain. Those four checks *are* the
"there isn't one" verdict.

### A whole-signal kernel across multiple regions is NOT informative

When a recording spans more than the baseline region — i.e. it contains treatment
epochs — a kernel recovered over the WHOLE signal is uninformative. It averages
across heterogeneous epochs whose coupling may differ (or appear/disappear) by
design of the experiment, producing a blend that is neither the baseline kernel nor
any treatment kernel. It answers no scientific question.

Only REGIONAL kernels/STA are informative: each is recovered over a span where the
experimental condition is fixed, so its kernel (or its absence) is a meaningful
read of coupling under that condition. Cross-region comparison — does the kernel
change across epochs? — is the scientific payoff; the contaminated whole-signal
average actively obscures it.

Corollary: the tool does not render a whole-signal kernel when a recording contains
more than one region ([ADR-0028](docs/adr/0028-regional-only-kernels-zoom-driven-selection.md)).
A single-region (baseline-only) recording is the boundary case where the whole kernel and the
regional kernel coincide — there, it is shown normally.

This sharpens, and partly supersedes, the earlier framing of a whole-recording
kernel as the §4 "is there any kernel at all" instrument: that role survives ONLY
for single-region recordings. For multi-region recordings the question "is there a
kernel?" is asked and answered per region, never globally.

### Validation gates machinery, not fit

**The spike train and the calcium signal are, in many ground-truth recordings, discrepant —
spikes and calcium can be *uncoupled*. This is the project's core scientific premise, not an
artifact to correct** (§1, §2). It has a direct, easily-violated consequence for how every
validation in this tool — starting with the Tab 1 forward-reconstruction check — must be built.

A forward reconstruction check (binned-count(spikes) ⊗ kernel ≈ ROI trace; the **residual** leg,
check 2 above) **must not be gated on a high goodness-of-fit threshold.** For an uncoupled ROI a
*low* reconstruction quality (low R² / high residual) is the **correct, scientifically meaningful
result** — exactly the "there isn't one" verdict — not an implementation failure. Gating
acceptance on fit would throw away the signal the tool exists to surface.

Validation therefore splits into **two things that must never be conflated:**

1. **Machinery correctness — *gated*, pass/fail.** The convolution arithmetic, origin/`zeroIndex`
   alignment (§13, [ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md)),
   binned-count matching `hist(spikes, timing)`, and output length / finiteness. This **must hold
   regardless of coupling**, and is verified on **known-coupled or synthetic data where the
   expected output is known** — never judged by how well a real, possibly-uncoupled ROI is
   reproduced.
2. **Fit quality — *measured and reported*, never a global gate.** The R² / residual of
   reconstruction against the real ROI trace is a **per-ROI reported quantity**, not an acceptance
   criterion. The **spread** of fit across ROIs — high on coupled cells, low on uncoupled ones — is
   *itself the scientific signal* (the per-column readout of §4). A uniformly low fit is data about
   the recording, not a failing test.

In short: **machinery is gated; fit is reported.** A correct forward path that faithfully
reconstructs a *coupled* ROI and faithfully *fails* to reconstruct an *uncoupled* one is working
exactly as intended.

**Upstream of both: zero spikes is a policy skip, not a fit report
([ADR-0022](docs/adr/0022-no-ap-silent-recording-policy.md)).** The machinery-gated / fit-reported
split above governs regions that **have spikes**. A region with **zero APs** is upstream of fit
entirely — there is no input to convolve, so recovery is *undefined*, not poorly-fit. Such regions
are **skipped by policy** (flagged on read, batch-skipped, single-file → "no APs in this recording —
deconvolution not possible"), and are **excluded from the decoupling-incidence denominator** (§4) —
never scored as "no clean kernel." A silent recording is not evidence of decoupling; it is the
absence of the input the question is even asked of. This is common, not a corner case: **33 fully
silent + 22 partially silent** across the 72-file batch.

**How the readout states all this: mechanical facts, never a success/failure verdict
([ADR-0025](docs/adr/0025-tab2-indicator-column-railed-fit-display.md)).** The machinery-gated /
fit-reported split has a direct UI consequence — the Tab 2 readout reports **computed mechanical
facts** (a parametric τ pinned to its bound; a kernel whose max sample sits at the window edge, so its
peak-lag number is not a transient peak) through a **neutral indicator column**, and **never
pronounces "this fit failed" or "there is no kernel."** That judgment is the human's (ADR-0011 /
ADR-0014). Even the convenience of **default-hiding railed-parametric output stays reader-reversible**
("show anyways"); the **free-vector method never receives an automated failure flag at all**, because
asserting decon failure *is* the coupling verdict the tool exists to leave to the human. Facts for the
eye; verdicts to the human.

**Empirical confirmation — ROI 1 is a real-data positive control.**
On `APs_v1_20241004_80.mat`, ROI 1 yields a recoverable kernel: the lab `deconvreg`
produces a clean transient with its peak at +0.6 s, and our regularized recovery
reproduces that +0.6 s peak λ-stably across the full sweep (λ = 0.002–3). The two
methods **agree at the +0.6 s peak** — Pearson correlation **+0.84 over the ±1 s window
around it** — while the **whole-window** correlation is **−0.74**, because the recovered
kernel rides a **slow baseline that tilts opposite to the lab kernel's**. That −0.74 is a
baseline-dominated statistic, **not peak disagreement**; the baseline tilt is a real,
**still-unsolved** regularization-side artifact of the recovery (Laplacian low-frequency
blindness — §4; tracked in `NEXT_SESSION.md`), not evidence against the kernel, and not a
sign inversion. By the four checks above this reads as *there is a kernel* — ROI 1 is the
real-data coupling control that complements the synthetic oracle, carried with the caveat
that its **global** fit is imperfect for a reason still being characterized.

The same ROI also exhibits **localized decoupling episodes**: a large calcium
transient (~780–800 s, ~0.24 dF/F₀) with no matching spike burst (calcium without
APs), and a stretch across ~400–700 s where spiking continues while the calcium
response shrinks (APs without proportional calcium — non-constant gain). Both facts
hold simultaneously: the episodes are real and are exactly what the tool exists to
*measure*, and they do **not** negate the recoverable kernel. A coupled cell with
localized breaks produces a real kernel plus a less-than-perfect global fit — which is
precisely the machinery-gated / fit-reported split above, not a "no kernel" verdict.
Reading the episodes (or the baseline-dominated −0.74) as erasing the kernel is the
category error this section now guards against: low global fit is reported, never used
to deny a kernel that recovery and STA jointly confirm at +0.6 s.

The synthetic oracle remains the **machinery** oracle, for the distinct reason that
ROI 1's *true* kernel is unknown — you cannot grade recovery error against a real cell
whose ground-truth kernel you do not have. That is a statement about ground-truth
availability, not about whether ROI 1 is coupled. (See
[ADR-0011](docs/adr/0011-validation-gates-machinery-not-fit.md) and
[ADR-0017](docs/adr/0017-circular-deconv-zero-padding-no-fix.md); the synthetic-oracle
choice for the machinery check follows from ground-truth availability, not from any
claim that real ROIs lack kernels — `NEXT_SESSION.md`.)

**Method-2 (constrained-parametric) corroboration on the positive control — figure
confirmed (ADR-0018).** The parametric recovery
([ADR-0021](docs/adr/0021-kernel-recovery-three-parallel-methods.md) method 2 — a causal
double-exponential fit) is now implemented, and its file-80 ROI-1 read is **confirmed by
Tony's eye** ([ADR-0018](docs/adr/0018-figure-gate-policy.md)). Three points join the
positive-control record:

- **Decay τ becomes a real number — the "n/a (tilt)" symptom is dissolved.** On this same
  ROI the free-vector method (§3 above) could not fit a decay constant under the baseline
  tilt (`tauDecayS = NaN`, shown as "n/a (tilt)"); the parametric method recovers
  **τ_decay ≈ 2.89 s** (with τ_rise ≈ 0.23 s). This is **because the parametric kernel
  zeroes its baseline by construction** (no additive offset term — there is no free
  baseline to tilt), **not** because the tilt was removed from the data. The free-vector
  bowl is unchanged and still raw (ADR-0017); the parametric method simply cannot express
  it, so τ is always defined.
- **Three-method peak agreement.** Peak lag: **free-vector +0.60 s, parametric +0.63 s,
  STA +0.80 s.** The parametric peak sits on the free-vector peak; STA's slightly later
  peak is **expected STA behavior, not disagreement** (the three-regime read of
  [ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)). Peak amplitudes also agree:
  the parametric kernel peak (**≈ 0.0101**) lands beside the free-vector baseline-relative
  amplitude (**+0.0096**). A third recovery method now joins recovery + STA at the +0.6 s
  feature.
- **The machinery-gated / fit-reported split holds, unchanged.** The parametric
  reconstruction R² on file-80 ROI-1 is **negative (≈ −0.06)** — dominated by the real
  ~790 s calcium-without-spikes event and the 400–700 s reduced-gain stretch (the same
  localized decoupling episodes above). Per [ADR-0011](docs/adr/0011-validation-gates-machinery-not-fit.md)
  this is the **correct "low global fit, real kernel" read**, not a no-kernel verdict: a
  clean +0.63 s transient with a finite τ is recovered *and* the global fit is poor for a
  reason the tool exists to measure. (The parametric method's loud failure mode on
  decoupled columns — [ADR-0021](docs/adr/0021-kernel-recovery-three-parallel-methods.md)
  — is a feature, not a defect.)

---

## 4. The multi-ROI phenomenon (a genuine open research question)

The input CSV carries several calcium-trace columns. **The first column is the default/expected
targeted cell**, but this is only a default highlight — the tool must NOT hard-wire column 1 as
privileged beyond that.

Observed but unreported: **a recoverable kernel sometimes appears in a non-targeted ROI.** A cell
other than the expected one shows a clean spikes→trace relationship. Prevalence is unknown because
no one reports this approach.

**Design consequence:** kernel recovery runs against **every trace column** (not just column 1),
with the four goodness-of-fit checks reported **per column**, laid side by side, column 1 highlighted
as the expected target. This turns "how common is more than one cell with a kernel?" from an unknown
into something the tool *measures every time a recording is loaded*. Labs running it generate
prevalence data collectively.

The retained negative-lag kernel structure ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md))
turns the multi-ROI question from "is there a kernel?" into "is there a kernel, *and what is the
lead/lag relationship?*" — kernel position encodes coupling direction, a companion to the prevalence
question above.

**Refinement: negative-lag energy is not monolithic.** It can be genuine cross-cell lead/lag
structure (the meaningful case above), **or** a regularization artifact. In the ROI-1 comparison,
the lab `deconvreg` kernel's acausal pedestal (≈ −0.006) is the artifact case — a
regularization-convention effect (circular FFT + silent Laplacian), **not** coupling. Distinguishing
real lead/lag from regularization artifact is a **human judgment**, which is exactly why
regularization must stay visible (§7) and why the machinery-check comparison is human-judged rather
than gated on a correlation that would blend the two
([ADR-0014](docs/adr/0014-machinery-check-metric.md)).

### Multiple-comparisons caution (design for it now, implement later)

Testing many ROIs against one spike train means **some will fit well by chance**. If labs use this
to decide "this second cell is real," the tool must help separate genuine coupling from luck.

- **v1:** leave room in the results UI for a null/distribution view.
- **v1.1 refinement (not a v1 blocker):** show the fit-score *distribution* across all ROIs so a
  real one stands out against the pack; and/or a **shuffled-spikes null** (recover a kernel against
  time-shifted / scrambled spike times to see what "no real relationship" scores look like).

---

## 5. Input data format

**CSV first.** Fancier ingestion (e.g. reading MATLAB `.mat` directly in-browser) is a deliberate
later addition, not part of v1.

Minimal ground-truth schema:

- **One column: spike times** — a sparse event list (one entry per spike). Shorter than the trace
  columns.
- **One column: time** — the sample timebase, one row per frame (dense, regular grid).
- **One or more columns: dF/F₀ traces** — one column per ROI/cell. **First trace column = default
  targeted cell.** Remaining columns are other cells (controls/context, and candidates for the
  multi-ROI phenomenon above).

**Structural wrinkle — SETTLED ([ADR-0016](docs/adr/0016-csv-input-layout.md)).** Spike times are a
*sparse event list* on a different row count than the *dense* time + trace columns. The layout
convention is now fixed: **one CSV per region**, columns `time`, `spikes`, `roi1..roiN`, with the
short `spikes` column **left blank below the last spike** (ragged). `roi1` is the default targeted
cell (§4); non-finite trace samples are the literal `NaN`; the pre-trim `timing` is emitted verbatim
(the app applies the `mod(k,2)` trim, §13). Confirmed against real exported files.

> **Layout replaced by [ADR-0019](docs/adr/0019-tab2-input-contract-workbook-per-recording.md)
> (proposed).** The ragged single-CSV layout silently truncated when `nSpikes > nFrames` (file-250
> senktide, −64.8%). The contract moves to **one xlsx workbook per recording** — a `trace` sheet
> (`time, roi1..roiN`, the whole untrimmed recording in zero-based recording time (one
> shared t=0 origin at experiment onset)), an
> independent-length `spikes` sheet, and an optional `metadata` sheet of **region definitions**
> (disjoint; overlap is a hard error). Regions are set in-app and bracketed to their spikes **at
> analysis time** with a **symmetric `round(1.0/dt)`-sample buffer on both ends** (trimming and the
> spike buffer move from export to app; the MATLAB +1-sample tail is not reproduced — canon, ADR-0019
> §4), enabling **cross-region kernel comparison**; per-region spike sufficiency is **reported, not
> gated**. CSV (paired trace +
> spikes files) is retained as a field-user fallback with padding banned. ADR-0016 stays Accepted —
> its offline-converter / no-egress posture is inherited; only the layout and granularity
> (per-region → per-recording) change.

> **Region-end markers are emitted raw — they may overhang the recording
> ([ADR-0020](docs/adr/0020-region-end-markers-raw-no-clamp.md)).** Finite region-end
> markers are written source-faithfully (`exp_timing × 60`) and are **not** clamped to the trace's
> `tEnd`; a marker may legitimately point past the recording's end (protocol planned longer than the
> recording ran), so consumers **must not assume `end_s ≤ tEnd`**. Open-ended `inf` ends fall back to
> `max(timing)` — a representability exception, not a clamp. The app windows analysis to spikes
> regardless, so the overhang is cosmetic for analysis.

**MATLAB origin:** source data lives in MATLAB v7.3 (HDF5) structures (`k_sta_store`). A CSV path now
exists: **`scripts/mat2csv.py`** — a tracked, *offline* converter that reads the processed
`APs_v1_*.mat` outputs and writes the schema above (output gitignored, §6). This keeps `.mat`
decoding out of the browser (CSV-first; no in-browser `.mat`, no egress) while giving users real CSV
without hand-writing it. A `writetable` / `csvwrite` snippet remains a fine alternative for users
working from MATLAB.

**Export:** the deconvolution side must export results (recovered kernel(s), per-ROI fit scores,
inferred spikes where relevant) back out as CSV. The teaching side does not need this.

---

## 6. Privacy & safety posture

Driver is **general principle (c)** — no sensitive-data mandate, no institutional security review
required. But the clean approach has a real payoff: researchers' unpublished trace data **never
leaves their machine**, because the tool does all computation client-side with no network egress.

Commitments that make the claim *real* (browser-enforced, auditable):

- **No backend.** All math (convolution, FFT, deconvolution) runs client-side.
- **No third-party requests.** Bundle fonts, libraries, WASM locally. No CDNs, no Google Fonts,
  no analytics, no error-reporting SaaS.
- **Strict CSP from day one:** `connect-src 'none'; default-src 'self'`, via a `<meta http-equiv>`
  tag so it works on any static host. **Injected into the built `index.html` at build time**
  (Vite plugin, see [ADR-0008](docs/adr/0008-csp-build-time-injection.md)) — the source
  `index.html` carries no CSP so the dev server (HMR) works, while the shipped artifact is fully
  locked down. Set it while the app is small; retrofitting is painful.
- **No persistent storage of user data** beyond explicit, user-controlled local file open / download.
- **Verification ritual:** after deploy, open dev tools → Network tab → reload → confirm only
  same-origin requests, nothing else. Run this against the **built/deployed** artifact
  (`npm run preview` or production), not the dev server, which is intentionally unrestricted
  ([ADR-0008](docs/adr/0008-csp-build-time-injection.md)).

---

## 7. Tech stack (settled)

| Layer | Choice | Notes |
|-------|--------|-------|
| Build | **Vite** | Bundles to static files; simple PWA path; self-hosts everything |
| UI | **Svelte** | Reactivity fits the live-update interactivity; compiles to small vanilla JS, so no privacy/size penalty |
| Convolution | **Hand-written** | Clearest for teaching; trivial for sparse spike trains |
| FFT / deconvolution | **fft.js** | Pure JS, tiny, dependency-free |
| CSV parsing | **papaparse** | Tiny, self-hostable |
| Plotting | **uPlot** | Fast, ~40KB, self-hosts; for standard line/stem plots |
| Convolution animation | **hand-drawn Canvas** | For slide-and-multiply in Tab 1, where charting libs fall short |
| Offline (optional) | **vite-plugin-pwa** | Install-and-run-offline |
| Fonts | system font stack | Zero downloads |

Deconvolution methods to expose (pedagogically + practically):
- **Naive spectral division** — include it so users can see it fail (best teaching moment).
- **Regularized inverse (Wiener / Tikhonov)** — regularization parameter as a slider.
- **Iterative (Richardson–Lucy / Landweber)** — show convergence.

Cross-cutting: optional **noise injection** (so deconvolution isn't deceptively easy; AWGN on a
user slider 0–10× cohort-typical σ, calibrated in [ADR-0015](docs/adr/0015-harness-noise-model.md)),
explicit **edge handling** (linear vs circular convolution — pick a default, make it visible), and
**ground-truth overlay** (recovered vs true, with an error metric).

---

## 8. Delivery

- **New repository**, clean break from `interface2` and the `lme/R` repos (different language,
  domain, and deployment — no shared lineage).
- Scaffold with `npm create vite@latest` → Svelte → then `git init` on top.
- Add deps afterward: `fft.js`, `uplot`, `papaparse`.
- **Hosting:** domain is on **Porkbun**. Two paths:
  - **Path A (simplest):** Porkbun Static Hosting — GitHub integration, free SSL, domain already
    there, ~$3/mo annual. One vendor, push-to-deploy.
  - **Path B (free):** keep Porkbun domain, point DNS at GitHub Pages / Cloudflare Pages.
- **License:** MIT if/when public (matches prior-art spirit). Public repo also makes the no-egress
  claim auditable; fine to start private and flip later.
- **Vite `base` gotcha:** if served from a subpath, set `base` or asset links break.

---

## 9. Prior art (context, not competition)

The specific combination here was not found in existing tools:

- **phiresky/convolution-demo** — closest 1D forward-convolution demo; client-side; MIT-spirit
  lecture tool (Karlsruhe). Forward-only, continuous functions, no spike-train, no deconvolution.
  Worth a look for *interaction-design* ideas.
- **CNN Explainer** (Georgia Tech / Oregon State) — Svelte + D3, fully in-browser, no backend.
  Validates the chosen stack and architecture for this category. (2D / deep-learning domain.)
- Other convolution visualizers are image/CNN-focused (different domain).
- Deconvolution tooling that exists is heavyweight research/analysis software (e.g. iSignal,
  NMR DEEP Picker), not a friendly interactive teaching/verification tool.

**The gap is real:** spike-train input + deconvolution as a first-class interactive operation +
the symmetric three-tab framing + ground-truth kernel verification for calcium imaging.

---

## 10. Open questions still to resolve

These do not block scaffolding, but should be settled deliberately:

1. **Delta rasterization — SETTLED.**
   - **Decision:** snap spike times to the nearest sample for v1, **toggleable** — anti-aliasing
     (distributing weight across adjacent samples for sub-sample precision) is a planned future
     toggle, not discarded.
   - **Reasoning:** snapping keeps the spike-train concept clean and literal for teaching;
     worst-case timing error is half a frame — below the calcium kernel timescale — when the
     sample grid matches the recording's frame rate.
   - **Amplitude model:** **unit amplitude is the default** (each spike = weight 1). This is the
     core assumption for Tab 2 kernel recovery — it forces the kernel to explain the trace and
     keeps the "is there a clean kernel?" test meaningful.
   - **Required toggle — binned count:** needed for real calcium data. At a 10 Hz sampling rate
     (100 ms bins) a cell can fire multiple times per bin, so the honest representation is the
     per-bin spike *count* (a bin value of 3 = three identical unit events). This does NOT break
     Tab 2 identifiability the way free/arbitrary weighting would, because the count is objective,
     not a soft fit parameter. (Arbitrary per-spike weighting is therefore excluded from Tab 2.)
   - **Implementation:** build rasterization behind a single swappable function
     (e.g. `rasterize(spikeTimes, grid, method)`). Placement and amplitude are two axes of that
     one function: `"snap"`/`"antialias"` choose timing placement, while `"unit"` clamps/keeps
     weight 1 (and should log any dropped collisions) and `"binned-count"` accumulates spikes
     per bin.
   - See [ADR-0001](docs/adr/0001-delta-rasterization.md).
2. **Input deltas:** unit-amplitude or weighted?
3. **Sample rate / window length:** fixed, or user-defined? (For CSV ingestion, these come from the
   data's time column.)
4. **Kernel source for the teaching side:** library (Gaussian, exponential, boxcar, custom), drawn,
   or typed? (Note: the calcium use case wants a *parameterized model* kernel — rise/decay τ — when
   forward-modeling, but Tab 2's whole point is to *recover* the kernel, not assume it.)
5. **Linear vs circular convolution — SETTLED.** **Linear** convolution (zero-padded) is the
   convention everywhere; circular is kept only as a teaching illustration of "what FFT does
   naively, and why we zero-pad to avoid it." See [ADR-0006](docs/adr/0006-linear-convolution.md).
6. **CSV layout convention — SETTLED.** The sparse spike column vs dense trace columns is resolved:
   one CSV per region (`time`, `spikes`, `roi1..roiN`, ragged spikes), confirmed against real
   exported files produced by `scripts/mat2csv.py`. See [ADR-0016](docs/adr/0016-csv-input-layout.md).

> **Status of this list:** with rasterization (1, via ADR-0001) and linear-vs-circular (5, via
> ADR-0006) now settled — and the kernel-source and sample-rate questions resolved by ADR-0003 and
> ADR-0002 respectively — the **original four open questions are closed**. The remaining live items
> are the *later-surfaced* ones: the deconvolution numerical route ([ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)),
> and the kernel global/tab-local detail plus the per-tab disclosure layout (§11.4). Item 6 (CSV
> layout) is now **also settled** ([ADR-0016](docs/adr/0016-csv-input-layout.md)) — a real exported
> file exists via `scripts/mat2csv.py`.

---

## 11. Controls, state scope, and progressive disclosure

These are **durable organizing principles** for the UI and app state — the structure that
should hold regardless of the specific controls each tab ends up with. They are distinct from
the concrete decision in [ADR-0002](docs/adr/0002-global-timebase.md) (which settles the
*timebase* specifically); this section is the wider frame that decision sits inside.

### 11.1 Two-audience tiered UI / progressive disclosure

The tool serves both a **learner** and a **researcher**. The control surface must not overwhelm
the learner — the tool's value is *clarity*. Organize controls in tiers:

- **Surface by default** — the few things a learner touches: place spikes, shape the kernel, see
  the output.
- **One layer down (Advanced / collapsible)** — knobs that matter but have sane defaults: sample
  rate, window length, rasterization method, amplitude mode, edge handling.
- **Contextual** — deconvolution and ROI controls appear **only** on the tabs that use them
  (Tabs 2/3), never on Tab 1. The biggest lever against clutter is simply *not showing a control
  on a tab that can't use it*.

An explicit **simple/advanced mode** is a possible implementation of this tiering.

### 11.2 Control-scope model (global vs. tab-local)

Every control has a **deliberate scope**, decided up front so users never wonder "why is this knob
here?" or "does it affect the other tab?":

- **Global** — the timebase (sample rate / window length), see [ADR-0002](docs/adr/0002-global-timebase.md).
  The **kernel is likely global too** (so it can be carried between tabs) — *TBD when built.*
- **Tab-local** — deconvolution method, regularization, ROI selection: only meaningful in Tabs 2/3.
  The **kernel/STA overlay amplitude-axis mode** (shared-y default vs. normalized-overlay opt-in;
  twin-y rejected) is also tab-local and display-only — a Tab 2 readout control
  ([ADR-0024](docs/adr/0024-kernel-sta-overlay-display-mode.md)). So is the Tab 2 **indicator column
  of mechanical facts** (τ-railed, peak-at-boundary — neutral, never pass/fail) and the
  **"show anyways" toggle** that reverses the default-hide of railed-parametric output
  ([ADR-0025](docs/adr/0025-tab2-indicator-column-railed-fit-display.md)).
- **Global-but-default-off** — noise injection (AWGN, slider 0–10× cohort-typical σ, default 0/off;
  [ADR-0015](docs/adr/0015-harness-noise-model.md)).

### 11.3 Cross-tab flow

The intended UX is **one signal flowing through the tabs**: author spikes + kernel in Tab 1, carry
the same signal into Tabs 2/3. This is precisely *why* the timebase is global
([ADR-0002](docs/adr/0002-global-timebase.md)) — a per-tab timebase would silently resample or
break a signal as it moves between tabs.

### 11.4 Still open (do not treat as settled)

- **Per-tab disclosure layout** — exactly which controls are surfaced vs. collapsed on each tab.
  To be designed when each tab is built. **Tab 2 is now settled
  ([ADR-0026](docs/adr/0026-tab2-layout-left-rail-three-plot-bands.md)):** a workflow-staged left
  rail (~300px) holds all controls + the four §3 checks (file management auto-collapses post-load;
  λ/noise in a default-collapsed "Advanced" fold, §11.1), with the right column given to three
  co-equal-height plot bands (reconstruction / first-class spike raster / kernel+STA overlay).
  **Region selection within Tab 2 is *zoom-driven*, not a mode
  ([ADR-0028](docs/adr/0028-regional-only-kernels-zoom-driven-selection.md), superseding
  [ADR-0027](docs/adr/0027-subwindow-recovery-region-view-mode.md) §3):** regions are shaded and
  labeled in-band on the recording-time bands and selected by **double-click-to-region** (zoom in →
  that region becomes current; single-click resets; drag = manual zoom) — there is **no Whole/Region
  mode toggle and no prev/next navigation**. The kernel band shows **regional kernels/STA only** (a
  whole-signal kernel across >1 region is not rendered, §3), each in its region hue, with a retained
  **Current/All overlay toggle** (current region alone vs. cross-epoch comparison; ADR-0024 amplitude
  policy). Sub-window recovery itself is first-class and view-zoom stays view-only (ADR-0027 §1/§2,
  unchanged). Tabs 1 and 3 remain to be designed when built.
- **Kernel scope** — partly resolved. Because the kernel is a *chosen* object in Tabs 1 and 3 but
  a *recovered* object in Tab 2 (see "The kernel plays three distinct roles", §2), a single global
  kernel across all tabs does not cleanly hold. **Likely model:** the *chosen* kernel is shared
  between Tabs 1 and 3; Tab 2's kernel is its own recovered result, optionally comparable against
  the chosen kernel as ground truth. The precise sharing remains **TBD**.

### 11.5 Axis co-registration (shared timebase → aligned axes)

A durable **plotting invariant**, settled in
[ADR-0030](docs/adr/0030-shared-timebase-axis-co-registration-invariant.md) (generalizing the Tab 2
case from [ADR-0026](docs/adr/0026-tab2-layout-left-rail-three-plot-bands.md)):

- **x-axes for related time-base data MUST align.** Plots that share a timebase — Tab 1's spike
  train + `input ⊗ kernel` output, Tab 2's reconstruction + spike raster — must co-register
  *pixel-for-pixel*, not merely share an x-*range*. That means an identical x-range **and** identical
  plot-area geometry (equal left gutter, equal right padding), so a feature at time *t* sits at the
  same x in every band and the eye drops straight down from a spike to its response. Stacked/adjacent
  shared-time bands also carry a **shared hover crosshair**: one dashed time-line linked across bands
  by data-x, with per-series value-dots (line = *where in time*, dot = *the value there*).
- **A different timebase deliberately does NOT co-register.** The kernel/STA band is an operator on
  **lag**, not a signal on recording-time (§2), so it keeps its own symmetric ±win lag axis
  ([ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md)) and shares no cursor with
  the recording-time bands. Aligning axes of different meaning would mislead.
- **y-axes SHOULD be identical whenever possible/reasonable — the human decides.** Prefer a shared
  y-range across related plots when it makes magnitudes comparable *by construction* (e.g. kernels/STA
  across regions, [ADR-0024](docs/adr/0024-kernel-sta-overlay-display-mode.md),
  [ADR-0029](docs/adr/0029-overlay-scale-kernel-sta-targets.md)). This is a **preference, not an
  absolute**: where a shared scale would flatten detail, a per-plot scale is right. The call is the
  human's per the figure-gate ([ADR-0018](docs/adr/0018-figure-gate-policy.md)), never an enforced
  rule.

---

## 12. How to use this file with Claude / Claude Code

- **Start every session by reading this file.** It is the shared ground truth that prevents drift.
- This file holds *settled foundations and the reasoning behind them*. It is not a task list.
- **ADRs** record individual decisions and changes; when an ADR changes a settled point here,
  update this file to match so the two never disagree.
- **NEXT_SESSION** (or similar) holds the immediate working state and the next actions.
- If a session's conversation drifts from what's written here, trust this file and re-anchor.

---

## 13. Signal representation (the in-memory contract)

Every Tab 1 / Tab 2 signal array — spike density, kernel, STA waveform, trace —
uses one in-memory contract, settled in
[ADR-0009](docs/adr/0009-centered-symmetric-lag-explicit-zero-index.md) and sourced
from the validated MATLAB pipeline (`MATLAB CODE/TDdeconvStack.m`,
`aCa98_batch_APs.m`, `spikeTriggeredAverage.m`; algorithm of record in
[docs/reference/matlab-deconv-pipeline.md](docs/reference/matlab-deconv-pipeline.md)):

```
Signal = { samples: Float64Array, dt: number, zeroIndex: number }
```

- **`zeroIndex`** (0-based) is the sample at **lag/time = 0**. It is carried
  **explicitly** and is **never re-inferred from the array center at a use site.**
- **Optional authoritative `times` ([ADR-0012](docs/adr/0012-timing-vector-authoritative-dt-derived.md)).**
  A signal MAY carry a `times` vector that is **authoritative when present**; `dt` is then a
  **derived convenience** (`mean(diff(times))`) and is **never trusted over `times`**. Real
  fluorescence timing is clock-quantized and jittery (dt ~±10 µs around nominal), so a single
  nominal `dt` silently drifts spike alignment over long recordings — a machinery error (§3). Loaded
  calcium signals carry `times`; constructed uniform signals (kernels, lag axes) may omit it (`dt` +
  `zeroIndex` + length is exact). When only a nominal `dt` is supplied, the tool **accepts and
  warns** that uniform-`dt` reconstruction can diverge from the spike clock.
- **Rationale.** The MATLAB code achieves centering only by forcing an odd-length,
  symmetric slice and **recomputing** the center wherever it is needed
  (`center = round(k/2)`; slice `center-window_samples : center+window_samples`;
  `kernel_time = linspace(-window, window, kernel_samples)`). Re-deriving the center
  in JS at every call site is the **convention-breaks-quietly failure mode** — a
  half-sample lag error is invisible on a plot but corrupts the coupling-direction
  read. So the origin lives in the **data structure**, not in arithmetic repeated
  across the codebase. The `{samples, dt, zeroIndex}` structure is a *new* convention
  (MATLAB has no explicit zero-index); the layout arithmetic and the reasoning are
  what come from the MATLAB.

### Kernel and STA share the t = 0 reference

- **Kernel** — symmetric, length `2*window_samples+1`, `zeroIndex = window_samples`.
  Negative-lag content (the first half) is **retained**, consistent with
  negative-lag-encodes-coupling-direction (§4, [ADR-0004](docs/adr/0004-tab2-deconvolution-method.md)).
- **STA** — same origin convention: `zeroIndex = window_samples` (the spike sits at
  offset `pre_samples`), symmetric window `pre = post = window`, length
  `2*window_samples+1`, with per-event baseline zeroing over a `STAbasewin = 0.5 s`
  pre-spike window subtracted from each event before averaging.
- Kernel and STA have **different spans** (`win = 5 s` vs `STAwin = 2 s`) but the
  **same origin convention** — both place t = 0 at `zeroIndex`. **This shared origin
  is what makes their cross-method agreement comparable**
  ([ADR-0005](docs/adr/0005-tab2-sta-validation-partner.md)), sample-for-sample about
  zero.

### Pipeline-fidelity facts (JS loader must reproduce these exactly)

So JS sample counts and lag alignment match the reference `.mat` files:

1. **Rasterization on the validation path is binned-count, not unit.**
   `TDdeconvStack` computes `spike_density = hist(spikes, timing)` — spikes binned
   onto the fluorescence timebase, **count-valued**. Tab 1's unit-amplitude default
   ([ADR-0001](docs/adr/0001-delta-rasterization.md)) is a **teaching choice**; the
   path that validates against the reference kernels **must use binned-count** to
   match the data those kernels were computed from.
   > Binned-count pre-first-bin spikes are governed by caller-selected
   > `preFirstBin: 'keep'|'drop'` (default **keep**, hist-faithful; **drop** is the
   > validation opt-in). See [ADR-0013](docs/adr/0013-binned-count-pre-first-bin-regime.md).
   > The drop path is a v1 stand-in for the v2 buffered window.
   > **Confirmed empirically:** in `APs_v1_20241004_80.mat` ROI 1, the region window
   > begins ~1 s before the first spike (11 baseline samples = the `buffer=10` pre-spike
   > pad), and **0 spikes fall below the first bin center** — the ADR-0013 "pre-first-bin
   > spikes impossible by construction" premise holds against real data, not just by argument.
2. **Even-length trim — follow the executed code, not the comment.**
   `TDdeconvStack.m` runs `if mod(k,2); stack(:,:,k)=[]; timing(k)=[]; end`. In MATLAB
   `mod(k,2)` is truthy when **k is odd**, so this drops the last sample **when k is
   odd, leaving k even.** The source comment ("if k is even…") states the opposite of
   what the code executes; **we follow the code** for exact count-matching. Centering
   does **not** depend on this trim — the kernel's center sample exists because the
   extraction slice is symmetric and odd-length (`2*window_samples+1`) regardless of
   `k`'s parity. The trim only shifts the **phase alignment** of the binned spike
   density against the frame grid.
3. **STA and deconvolution use *different* effective spike sets** (verbatim from
   `spikeTriggeredAverage.m`) — **do not share one spike set between methods:**
   - **Overlap rejection:** `block = 0.5*window`; an event is kept only if **both**
     neighbors are farther than `block` away. Deconvolution bins **all** spikes; STA
     drops overlapping ones.
   - **Endpoint skip:** STA iterates `for iEvent = 2:nEvents-1` — first and last
     events are **skipped**.
   - **Match tolerance:** spike→sample matching uses a **0.1 s** tolerance.

> The **commutativity trick** is unaffected: `deconvreg(pixel, spike_density)` passes
> the trace as the image and the spikes as the PSF, so the recovered "input" *is* the
> kernel (reference doc §3.1). `zeroIndex` simply marks where t = 0 lands in that
> returned kernel.
