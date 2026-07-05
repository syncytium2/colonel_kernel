# ADR-0035: Region protocol windowing — solution delay, duration floor/cap, per-type rule

## Status

Accepted
(2026-07-05. Adds the region analysis-window arithmetic the app had been missing. **Supersedes the
"raw `[start_s, end_s]`, no `solution_delay`, no skip" windowing of [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) §4** — the raw markers stay the contract's emitted values, but the app now
*derives* a per-region analysis window from them before spike-bracketing. Requires a shared-bus
contract clarification to **v1.1** (names are semantic; the app owns this windowing). The three
numbers are user-adjustable in Tab 2, defaulting to the values below.)

## Context

A calcium recording is segmented into experimental **regions** (baseline, then one or more solution
switches: drug treatments, high-K⁺, wash). The producer (MATLAB `interface2`) emits the **raw**
region markers `[start_s, end_s]` on the `metadata` sheet with **no offsets** — the frozen bus
contract v1.0 said *"raw `exp.start_end × 60`; no `solution_delay`; app does all windowing; include
short regions (no skip)."* The app ([`windowRegion`](../../src/lib/core/load-xlsx.js)) implemented
exactly that: select spikes in the raw bracket, then trim to ±1 s around the first/last AP.

That omission produced a real defect: **APs leak into post-switch windows** ("APs in TTX"). When the
perfusion switches solutions there is a physical **wash-in delay** (~2 min) before the new solution
reaches the cell; APs in that head are still under the *previous* condition. The raw bracket counts
them in the new region. Two divergent MATLAB rules existed for this (`aCa98_batch_APs.m`:
+2 min delay, no cap, 5-min hard skip; `if2_region_windows.m`: +2 min delay, 20-min cap, 12-min
floor-as-flag, high-K⁺ raw exception) — neither on the shared bus, so the app had no single rule to
follow. Deciding it once, durably, is this ADR (plus the bus v1.1 mirror).

Measured on golden file 98: the `sb222200` treatment window `[20m..45m]` carried **4905 APs**, of
which **382 fell in the first 2 min** — the wash-in leak. Under this ADR the window becomes
`[22m..42m]` and those 382 are excluded.

## Decision

The **app derives the analysis window per region TYPE**, classified from the region **name**, from the
raw markers, **before** the existing ±1 s spike-bracket. Types and rules:

| Type | Identified by (normalized name) | Analysis window |
|------|--------------------------------|-----------------|
| **baseline** | contains `baseline` | **last `MAX`** of the period, anchored at the END: `[end − MAX, end]` (floored at raw start) — the baseline nearest the transition |
| **treatment** | anything else (e.g. `sb222200`, `senktide`, `wash`) | wash-in delayed start, then up to `MAX`: `[start + DELAY, min(end, start + DELAY + MAX)]` |
| **hiK** | contains `hik` / `highk` (matches "HiK", "high K", "high K+") | the **entire period, raw** — high-K⁺ acts fast; no delay, no cap |
| **full** | the synthetic `(full recording)` / `whole` default region | raw passthrough (Tab 1 handoff, CSV path, file-80 equivalence stay byte-identical) |

**Defaults (user-adjustable):** `DELAY = 2 min`, `MIN = 12 min` (duration floor), `MAX = 20 min` (cap).
Exported from the core as `SOLUTION_DELAY_S = 120`, `REGION_MIN_S = 720`, `REGION_MAX_S = 1200`; Tab 2
exposes them as three minute-valued number fields in the Advanced fold (shown only when a recording
has metadata regions), passed into `windowRegion(recording, region, { protocol, solutionDelayS,
regionMinS, regionMaxS })`.

**Never silently drop a region (FOUNDATIONS report-don't-throw posture, cf. [ADR-0022](0022-tab2-no-ap-policy.md)
/ ADR-0019 §7):**
- A baseline or treatment whose effective duration is below `MIN` is **flagged** (a warning on the
  RegionView) but **kept and analyzed**.
- Only a treatment whose raw period is **shorter than `DELAY`** comes back `analyzable:false` (no
  window survives the delay), with a reason — reported, not thrown.

**Opt-in.** `windowRegion`'s `protocol` flag defaults to **false** (raw markers, prior behavior); Tab 2's
two real named-region calls pass `protocol:true`. Synthetic/test regions and the CSV/handoff full-recording
path are unaffected.

The ±1 s spike-bracket is unchanged (`buffer = 10 samples = 1 s`, MATLAB `aCa98_batch_APs.m:33`; the app's
`DEFAULT_BUFFER_S = 1.0` already matched). It applies **on top of** the protocol window, for kernel/STA.

## Consequences

- The leak is closed for the shipped app; treatment kernels/STA are computed on cells under the intended
  condition, and the physiologist can tune `DELAY`/`MIN`/`MAX` per rig without a rebuild.
- **No golden re-emit** — classification reads the existing `name` column; the bus change is a *clarification*
  (region names are semantic; the app applies windowing), stamped **v1.1**, not a structural break.
- Region **name** now carries meaning. A misnamed region (e.g. a treatment named to match the hiK pattern)
  gets the wrong rule. Mitigation: the reserved keywords are narrow (`baseline`, `hik`/`highk`); everything
  else is a treatment. The RegionView surfaces the resolved `type` for display so a misclassification is visible.
- Supersedes ADR-0019 §4's windowing sentence only; the rest of the input contract (sheets, clock origin,
  raw markers, overhang per [ADR-0020](0020-region-end-marker-overhang.md)) is intact.
- Verified: `test:core` 217/217 (+15); build clean; real-data probe on goldens 98 + 250
  (`darkroom/proto_window_probe.mjs`, gitignored) confirms name classification and the 382-AP leak trim.
