# 12. Timing vector is authoritative; dt is a derived fallback

## Status

Accepted

## Context

- Real fluorescence frame timing is **clock-quantized and jittery**: measured `dt`
  varies ~±10 µs around nominal (histogram ~0.099999–0.100001 s around 0.1 s), and
  the *mean* can differ from nominal enough to **accumulate multi-millisecond
  divergence** from the electrophysiology spike clock over hour-scale recordings.
- The signal contract ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md),
  `FOUNDATIONS.md` §13) carries `dt` as a scalar. Treating a single nominal `dt` as
  ground truth silently drifts spike alignment against the trace over long
  recordings — a machinery error, not a fit error (cf.
  [ADR-0011](0011-validation-gates-machinery-not-fit.md), `FOUNDATIONS.md` §3).

## Decision

- A signal MAY carry an **optional `times` vector** that is **authoritative when
  present.** `dt` is a **derived convenience** (`mean(diff(times))`) and is **never
  trusted over `times`** when both exist.
- **Constructed uniform signals** (kernels, lag axes) may **omit `times`** — for
  them `dt` + `zeroIndex` + length is exact, and `times` would be redundant.
- **Fallback (nominal `dt`, no `times` — the common deconv-tab case, where users
  often discard the original timing):** the tool **accepts and warns** that
  uniform-`dt` reconstruction can diverge from the spike clock over long recordings,
  and advises supplying the original timing vector.

## Consequences

- This **refines** the §13 contract: `times` optional + authoritative; `dt`
  derived/fallback. No change to `samples` / `zeroIndex`.
- Loaded calcium signals (which have a real time column) carry `times`; authored
  and constructed signals need not.
- The warning makes the divergence risk **visible at ingest**, not a silent drift
  discovered later.
- **v2 (future, do not build):** when a real `times` vector is present,
  detect/display the `dt` spread so users see their own clock-jitter signature
  (full histogram analysis deferred to v2).

## Cross-references

- [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) / `FOUNDATIONS.md`
  §13 — the `{samples, dt, zeroIndex}` contract this refines.
- [ADR-0011](0011-validation-gates-machinery-not-fit.md) / `FOUNDATIONS.md` §3 —
  alignment drift is a machinery concern, gated, not a fit concern.
- `docs/reference/matlab-deconv-pipeline.md` §3.1 — `delta_t = mean(diff(timing))`,
  the MATLAB convention this generalizes (times-first, dt-derived).
