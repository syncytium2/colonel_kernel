# ADR-0013: Binned-count pre-first-bin regime

## Status

Accepted

## Context

The binned-count rasterizer reproduces MATLAB `hist(spikes, timing)` exactly
(centers-based midpoint edges, `[L, R)` tie-break, symmetric upper pre-filter).
This raises a question for spikes that fall below the first bin's lower edge
(time < first bin center, `timing(1)`): MATLAB `hist` accumulates all such
values into bin 0. Whether that is correct depends on which master the
rasterizer is serving:

- **Teaching** wants hist-faithfulness and visibility — the bin-0 accumulation
  is real `hist` behavior and dropping it silently would hide loaded data.
- **Validation** wants pipeline-faithfulness — and in the reference pipeline,
  pre-first-bin spikes cannot occur *by construction*. The driver builds a
  ~1 s pre-spike buffer window (`first_spike − buffer`), so the first bin edge
  always sits below the earliest spike. There is no active filter dropping
  them; the windowing makes them impossible.

The tool's v1 has no region-setting feature, so it loads the `times` vector
as-is and `t0 = times[0]` is the user-supplied window start (≈ `btiming(1)`),
not the recording origin. Pre-first-bin spikes are therefore *possible* in v1
input where they would be impossible in the reference.

Same cell, opposite correct answers — so this is a caller-selected policy,
not a fixed rule.

## Decision

Add a caller-selected option `preFirstBin: 'keep' | 'drop'` to the binned-count
path, plumbed through `rasterize(...)`'s opts object (parallel to the existing
`amplitudeMode`), defaulting to `'keep'`.

- `'keep'` (default, teaching): pre-first-bin spikes accumulate in bin 0,
  matching MATLAB `hist`. Never drops loaded data silently.
- `'drop'` (validation opt-in): pre-first-bin spikes are excluded and counted
  in a `dropped` tally for caller visibility.

The strict upper pre-filter is unchanged by this decision.

The name targets the structural region the policy governs — spikes below the
*first bin's* lower edge — not a temporal relation. "Before" was rejected: it
implies a temporal anchor (before what event?) that collapses to "before the
first bin center" anyway, and the v2 boundary isn't an event but a constructed
window edge (`first_spike − buffer`). A string enum was chosen over a boolean
(`dropBelowFirst`) because the documented v2 successor is a real third state:
when the buffered window lands, `'buffer'` becomes a plausible third value that
the enum absorbs without a breaking signature change.

## Consequences

- The `'drop'` flag is a **v1 stand-in for the v2 buffered window**. In v1 we
  cannot build the pre-spike buffer (no region-setting yet), so the flag drops
  pre-first-bin spikes explicitly instead. In v2, the buffered window does the
  job properly by construction and the flag becomes redundant on the validation
  path — likely superseded by `preFirstBin: 'buffer'` or removed.
- Default-keep means the teaching path needs no opt-in and never loses data.
- Validation callers must opt into `'drop'` explicitly and can read the
  `dropped` count to confirm what was excluded.
- Relates to [ADR-0011](0011-validation-gates-machinery-not-fit.md)
  (validation-gates-machinery): dropping pre-first-bin spikes is a
  pipeline-fidelity choice, not a quality gate.
