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

---

## 3. The flagship's core deliverable: "is there a kernel, or isn't there?"

Recovering a kernel **always returns something** — the question is whether it is meaningful.
The tool must surface a **goodness-of-fit triad** so the user can judge:

1. **Kernel plausibility** — does the recovered kernel look like a real indicator transient
   (fast rise, exponential decay), or like noise / ringing?
2. **Reconstruction residual** — convolve the known spikes with the recovered kernel, compare to
   the actual trace, report the residual.
3. **Stability** — does the kernel stay consistent (across regularization settings, across spikes),
   or does it swing wildly?

An **uncoupled** recording shows up as: implausible kernel shape + high residual + unstable estimate.
That triad *is* the "there isn't one" verdict.

---

## 4. The multi-ROI phenomenon (a genuine open research question)

The input CSV carries several calcium-trace columns. **The first column is the default/expected
targeted cell**, but this is only a default highlight — the tool must NOT hard-wire column 1 as
privileged beyond that.

Observed but unreported: **a recoverable kernel sometimes appears in a non-targeted ROI.** A cell
other than the expected one shows a clean spikes→trace relationship. Prevalence is unknown because
no one reports this approach.

**Design consequence:** kernel recovery runs against **every trace column** (not just column 1),
with the goodness-of-fit triad reported **per column**, laid side by side, column 1 highlighted as
the expected target. This turns "how common is more than one cell with a kernel?" from an unknown
into something the tool *measures every time a recording is loaded*. Labs running it generate
prevalence data collectively.

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

**Structural wrinkle to handle in the parser:** spike times are a *sparse event list* and live on a
different row count than the *dense* time + trace columns. Resolve the layout convention explicitly
(e.g. ragged columns with blanks below the short spike column) — confirm against real exported files.

**MATLAB origin:** source data currently lives in MATLAB structures; there is no CSV ready yet.
Plan to provide users a tiny MATLAB snippet (`writetable` / `csvwrite`) to produce the schema above.

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
- **Strict CSP from day one:** `connect-src 'none'; default-src 'self'` (via `<meta http-equiv>`
  so it works on any static host). Set it while the app is small; retrofitting is painful.
- **No persistent storage of user data** beyond explicit, user-controlled local file open / download.
- **Verification ritual:** after deploy, open dev tools → Network tab → reload → confirm only
  same-origin requests, nothing else.

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

Cross-cutting: optional **noise injection** (so deconvolution isn't deceptively easy), explicit
**edge handling** (linear vs circular convolution — pick a default, make it visible), and
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
5. **Linear vs circular convolution** as the default convention.
6. **CSV layout convention** for the sparse spike column vs dense trace columns (confirm against a
   real exported file once one exists).

---

## 11. How to use this file with Claude / Claude Code

- **Start every session by reading this file.** It is the shared ground truth that prevents drift.
- This file holds *settled foundations and the reasoning behind them*. It is not a task list.
- **ADRs** record individual decisions and changes; when an ADR changes a settled point here,
  update this file to match so the two never disagree.
- **NEXT_SESSION** (or similar) holds the immediate working state and the next actions.
- If a session's conversation drifts from what's written here, trust this file and re-anchor.
