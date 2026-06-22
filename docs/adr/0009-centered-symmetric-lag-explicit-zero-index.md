# 9. Centered symmetric lag with explicit zero-index

## Status

Accepted

## Context

Tab 1 and Tab 2 share one in-memory representation for every signal array (spike
density, kernel, STA, traces). They need a **single, unambiguous origin
convention** — the sample that corresponds to lag/time = 0 — because:

- Negative lags are **scientifically meaningful** in this tool: a recovered kernel
  spans negative *and* positive lag, and its position encodes coupling direction
  (`FOUNDATIONS.md` §4). The origin must survive the round trip into deconvolution
  and back out, not be discarded as "the part before zero."
- The validated lab pipeline (`MATLAB CODE/TDdeconvStack.m`,
  `aCa98_batch_APs.m`, `spikeTriggeredAverage.m`; see
  [docs/reference/matlab-deconv-pipeline.md](../reference/matlab-deconv-pipeline.md))
  never carries the origin as data. It **re-derives** the center at each use site
  via `center = round(k/2)` and reconstructs the lag axis with
  `kernel_time = linspace(-window, window, kernel_samples)`. Centering is achieved
  only by forcing a symmetric, odd-length slice
  (`center-window_samples : center+window_samples`).
- Re-deriving the center in JS at every call site is the **convention-breaks-quietly
  failure mode**: one off-by-one or one even/odd assumption that disagrees with the
  next, and the lag axis silently shifts with no error. This is precisely the class
  of bug the tool cannot afford, because a half-sample lag error is invisible on a
  plot but corrupts the coupling-direction read.

This decision settles the origin convention. It does **not** restate the algorithm
(that lives in the reference doc) nor the rasterization amplitude axes
([ADR-0001](0001-delta-rasterization.md)).

## Decision

Adopt an explicit in-memory **signal contract** (Option 1 — origin carried in the
data structure):

```
Signal = { samples: Float64Array, dt: number, zeroIndex: number }
```

- **`zeroIndex`** (0-based) is the sample at lag/time = 0. It is **carried
  explicitly and never re-inferred from the array center at a use site.** The
  origin lives in the data structure, not in arithmetic repeated across the
  codebase.
- This structure is a **new convention**, not itself a MATLAB convention — MATLAB
  has no explicit zero-index. The *rationale and the layout arithmetic* are sourced
  from `TDdeconvStack.m` and `spikeTriggeredAverage.m`; the decision to make the
  origin first-class data is ours, and exists specifically so the JS port does
  **not** recompute `round(k/2)` everywhere the way MATLAB does.
- **Kernels:** symmetric, length `2*window_samples+1`, `zeroIndex = window_samples`.
  Negative-lag content (the first half) is **retained**, consistent with the
  negative-lag-encodes-coupling-direction principle (`FOUNDATIONS.md` §4,
  [ADR-0004](0004-tab2-deconvolution-method.md)).
- **STA:** same origin convention. `zeroIndex = window_samples` (the spike sits at
  offset `pre_samples`), symmetric window `pre = post = window`, length
  `2*window_samples+1`, per-event baseline zeroing over `STAbasewin` of pre-spike
  trace. Kernel and STA **share the t = 0 reference** (different spans — `win = 5 s`
  vs `STAwin = 2 s` — but the same origin convention); that shared origin is what
  makes their cross-method agreement ([ADR-0005](0005-tab2-sta-validation-partner.md))
  comparable sample-for-sample about zero.

## Consequences

**The JS loader carries the origin in-structure** and reproduces three
pipeline-fidelity behaviors read off the source, so JS sample counts and lag
alignment match the reference files exactly:

1. **Binned-count required on the validation path.** `TDdeconvStack` builds
   `spike_density = hist(spikes, timing)` — spikes binned onto the fluorescence
   timebase, **count-valued**. Tab 1's unit-amplitude default
   ([ADR-0001](0001-delta-rasterization.md)) is a teaching choice; the path that
   validates against the reference `.mat` kernels **must** use binned-count to match
   what those kernels were computed from.
2. **Even-length trim — follow the executed code, not the comment.**
   `TDdeconvStack.m` runs `if mod(k,2); stack(:,:,k)=[]; timing(k)=[]; end`. In
   MATLAB `mod(k,2)` is truthy when **k is odd**, so this drops the final sample
   **when k is odd, leaving k even.** The `.m` comment ("if k is even, lose the last
   data point so we always have a center point") and the original task prompt
   ("drops the last sample when k is even") both state the **opposite** of what the
   code executes. We **mirror the executed code** (drop when k odd → even) for exact
   count-matching. Centering does **not** come from this trim: the kernel's center
   sample exists because the extraction slice is symmetric and odd-length
   (`2*window_samples+1`) regardless of `k`'s parity. The trim only affects the
   **phase alignment** of the binned spike density against the frame grid, not the
   existence of a center sample.
3. **STA and deconvolution use DIFFERENT effective spike sets** — reproduction-critical
   facts read verbatim from `spikeTriggeredAverage.m`:
   - **Overlap rejection.** `block = 0.5*window`; an event is accepted only if **both**
     neighbors are more than `block` away
     (`abs(time-events_AP(iEvent-1)) > block && abs(time-events_AP(iEvent+1)) > block`).
     Deconvolution bins **all** spikes; STA rejects overlapping ones. **Do not share a
     single spike set between the two methods.**
   - **Endpoint skip.** STA iterates `for iEvent = 2:nEvents-1` — the **first and last
     events are skipped.**
   - **Match tolerance.** Spike→sample matching uses a **0.1 s tolerance**
     (`tolerance = 0.1; find(abs(fluo_time-time) < tolerance, 1)`).

**The commutativity trick is unaffected and still applies:**
`deconvreg(pixel, spike_density)` passes the **trace** as the image and the **spikes**
as the PSF, so what comes back as the deconvolved "input" is the **kernel** (reference
doc §3.1). The explicit `zeroIndex` is simply where t = 0 lands in that returned kernel.

**Pros**

- Origin is impossible to lose: it travels with the data, not with convention.
- Negative-lag / coupling-direction information survives every transform.
- Kernel and STA are directly comparable about a shared, explicit zero.

**Cons**

- Every producer of a `Signal` must set `zeroIndex` correctly once — paid at
  construction instead of re-derived (cheaply) at each read. This is the point.

**Scope**

- Applies to all Tab 1 / Tab 2 signal arrays. Sourced from `TDdeconvStack.m`,
  `aCa98_batch_APs.m`, and `spikeTriggeredAverage.m`. Reflected in
  `FOUNDATIONS.md` §13. Cross-references: rasterization amplitude axes
  ([ADR-0001](0001-delta-rasterization.md)), retained-lag kernel
  ([ADR-0004](0004-tab2-deconvolution-method.md)), STA validation partner
  ([ADR-0005](0005-tab2-sta-validation-partner.md)), and the algorithm of record
  ([docs/reference/matlab-deconv-pipeline.md](../reference/matlab-deconv-pipeline.md)).
