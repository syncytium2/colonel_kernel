# Colonel Kernel — technical overview

**A standalone summary of how the tool is built and why.** Written for readers coming from
outside the project — reviewers, collaborators, hiring managers — who want the engineering
and numerical substance without reading `FOUNDATIONS.md` or 38 decision records first.

Snapshot: **2026-07-31**. Live at <https://kernel.tonydefazio.com>.
`FOUNDATIONS.md` remains the source of truth; where this doc and it disagree, it wins.

---

## What the tool does

Given a calcium-imaging recording **where the spike times are already known** — from paired
electrophysiology, or any source the user trusts — it recovers the *kernel*: the fluorescence
transient produced by a single action potential. Or it reports, with diagnostics, that no
single kernel describes the recording.

That second outcome is the design driver. In real recordings the spike→calcium relationship
holds only sometimes, and a tool that always returns a confident kernel hides exactly the
cases worth investigating. See "Reporting, not verdicts" below.

It does **not** detect spikes, and does no image processing — no ROI extraction, motion
correction or segmentation. It is not a spike-inference package.

---

## Architecture

**Svelte 5** (runes: `$state` / `$derived` / `$effect`) on **Vite 8**, compiled to fully
static output and served as Cloudflare Workers static assets.

**No backend, and no server-side computation of any kind.** Every FFT, convolution and fit
runs in the visitor's browser. This is a privacy requirement, not a deployment convenience:
the users are researchers holding unpublished recordings, and the architecture is what makes
"your data does not leave your machine" a structural fact rather than a policy promise.

Four runtime dependencies, all bundled locally — no CDN at runtime, no web fonts, no
analytics, no error reporting:

| dependency | role |
|---|---|
| `fft.js` | FFT behind the frequency-domain deconvolution |
| `uPlot` | all plotting — canvas, no SVG DOM per point |
| `papaparse` | CSV ingestion |
| `SheetJS` | `.xlsx` workbook reading, lazily loaded |

Convolution is hand-written. Fonts are the system stack only.

---

## The numerical core

Kernel recovery is **regularized least squares in the frequency domain** — Tikhonov with a
Laplacian smoothness prior — reimplemented from a MATLAB `deconvreg` pipeline
([ADR-0004](adr/0004-tab2-deconvolution-method.md)).

The move that makes it work is a commutativity argument: treat the calcium **trace** as the
"image" and the binned **spike density** as the "point spread function," so the deconvolved
result *is* the kernel. Per frequency bin:

```
             conj(S(k)) · Y(k)
H(k) = ─────────────────────────────────
       |S(k)|² + λ·(2 − 2·cos(2πk/N))²
```

`Y` is the trace spectrum, `S` the spike-density spectrum. The `(2 − 2cos ω)²` term is the
power spectrum of the discrete Laplacian `[−1, 2, −1]` — it penalises curvature, biasing the
solution toward smooth kernels rather than fitting noise.

Implementation notes that matter:

- **λ is an explicit, user-visible control, not a silent default.** The recovered kernel
  genuinely depends on it, so hiding it would hide the uncertainty it represents. The app
  sweeps λ across decades and reports whether peak lag and amplitude are *stable* across the
  sweep — an unstable answer is reported as unstable.
- **Signals are zero-padded to a power of two** for the FFT; recovery is circular, matching
  the reference pipeline.
- **Negative lags are retained deliberately.** The kernel is extracted as a symmetric ±window
  around zero lag ([ADR-0009](adr/0009-centered-symmetric-lag-explicit-zero-index.md)).
  Energy appearing *before* the spike is physically impossible, so its presence is a built-in
  diagnostic that the fit has gone wrong — an acausal ratio above 1 says so numerically.

### Three recovery methods, plus a model-free cross-check

Recovery runs **three independent methods** over the same data
([ADR-0021](adr/0021-kernel-recovery-three-parallel-methods.md)), against a fourth estimate
that assumes no model at all:

1. **Free-vector** — the regularized deconvolution above, unconstrained in shape.
2. **Parametric** — a constrained double-exponential fit; fails loudly when it cannot fit.
3. **Shape-regularized** — adds baseline-flatness and acausal-energy penalties plus a
   low-order drift basis, to stop the kernel absorbing slow drift
   ([ADR-0023](adr/0023-method3-baseline-strategy.md)).
4. **Spike-triggered average** — model-free, as an independent cross-check
   ([ADR-0005](adr/0005-tab2-sta-validation-partner.md)).

**The spread between them is the scientific output.** When they agree there is a real kernel;
when they disagree, the disagreement is itself the finding, and the tool surfaces it rather
than picking a winner.

### Reporting, not verdicts

A standing rule ([ADR-0011](adr/0011-validation-gates-machinery-not-fit.md),
[ADR-0018](adr/0018-figure-gate-policy.md),
[ADR-0025](adr/0025-tab2-indicator-column-railed-fit-display.md)): **the machine reports
mechanical facts; the human reads the figure and makes the call.** Validation gates
*machinery* — did the arithmetic run on well-formed input — never *fit quality*. There is no
"kernel found ✓" badge, because no reliable automatic criterion exists and asserting one
would make the scientific judgement the tool exists to inform.

Degenerate cases are reported, not thrown: a silent region with no action potentials comes
back labelled as a policy skip, not an error and not a bad fit.

---

## Verification

**217 tests over the numerical core, in plain Node with no test framework.** The core is pure
functions with no DOM dependency, which is what makes that possible — and is the reason the
science is separable from the UI.

Beyond unit tests:

- **Acceptance runs** round-trip real `.xlsx` and `.csv` files through the *production*
  loaders rather than mocks, then recover a kernel and check it against known values.
- **A ground-truth loop.** Tab 1 synthesizes a trace from a kernel you chose; Tab 2 recovers
  it. The instrument can be checked against a known answer — which is the whole reason the
  teaching tab and the analysis tab live in one application.
- **Headless browser checks** drive the built artifact for layout geometry, interaction and
  third-party request auditing, measuring the live DOM rather than trusting CSS.

---

## Build and deploy engineering

**The CSP is injected at build time** by a Vite plugin, into the built HTML only
([ADR-0008](adr/0008-csp-build-time-injection.md)). The dev server stays relaxed so HMR
works; the shipped artifact carries `connect-src 'none'; default-src 'self'` and is locked
down on any static host. The policy is strong enough that a same-origin `fetch()` from the
page is refused — verified by having one blocked.

**The build refuses to run in a shallow clone.** `git log --max-parents=0` returns `HEAD` in a
truncated graph, which once baked a wrong provenance date into production. The failure mode is
now impossible rather than documented.

**Deployment is one scripted runbook** (`npm run deploy`), not a sequence of remembered
commands. It gates on preconditions (full clone, correct branch, clean tree), runs the tests,
verifies the CSP in both the built HTML *and* the live response, confirms the baked build
metadata, polls past Cloudflare's edge cache until both URLs serve the new bundle hash, checks
that the host has not injected an analytics beacon, and records what went live to a tracked
file. `--dry-run` does everything except upload.

That beacon check exists because the host **did** inject one — Cloudflare Web Analytics
appeared in the HTML at the edge for over a week, user-agent gated so a plain `curl` saw clean
markup. The CSP blocked it and nothing left, but "we added no third-party code" turned out to
be insufficient. The in-repo fix sets `no-transform` on the HTML routes, so the host cannot
rewrite a response it is not permitted to transform.

**Code splitting** keeps first paint small: SheetJS (487 kB) loads only when a workbook is
actually opened.

| | |
|---|---|
| entry bundle | 272.30 kB (95.28 kB gzipped) |
| lazy `.xlsx` chunk | 487.31 kB |
| core tests | 217 |
| decision records | 38 |
| commits | 235, since 2026-06-21 |

---

## Process

Every design decision is written up as a short **architecture decision record** — context,
decision, consequences — so the reasoning survives the code and a later reader can tell a
deliberate choice from an accident.

Document deliverables run through an **adversarial review process** before shipping. On this
project it has caught real errors, including a documented input rule that was flatly wrong
about how the parser actually behaves, and a stated engineering justification that inverted
under one `grep`.

---

## Honest limits

- **Not peer reviewed**, and not versioned for release.
- **Tab 3 (spike inference) is deliberately limited.** It demonstrates why the inverse problem
  is hard; it is not an attempt to solve it. Dedicated packages — CASCADE, MLspike, OASIS —
  exist for that, and the tool says so.
- **Results are largely on-screen.** Workbooks carrying a region table get a per-recording
  summary report; there is no numeric export of the recovered kernel yet.
- **Desktop only in practice.** The plots need a mouse; spike placement binds mouse events
  with no touch or keyboard path.
- The **multi-ROI decoupling phenomenon** the tool exists to investigate is an open research
  question, not a settled result.
