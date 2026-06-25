# ADR-0020: Region-end markers emitted raw — no clamping of finite overhang

## Status

Accepted — ratifies existing, verified exporter behavior (the finite-overhang investigation below
confirmed uniform raw emission across all three v1.0 goldens); nothing is pending review.

Refines [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) (the `metadata`-sheet
region-definition schema). Relates to FOUNDATIONS §5 (input data format) and §4 (regions). The
report-don't-gate and in-app-windowing philosophy of ADR-0019 is unchanged.

## Context

[ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) establishes that the `metadata` sheet
carries region definitions as time markers (`start_s` / `end_s`) on the trace's shared zero-based
axis. A question arose from the three v1.0 golden workbooks: **do region-end markers that exceed the
recording's `tEnd` get emitted raw, or clamped to `tEnd`?**

- A suspected inconsistency was flagged across the goldens — `…_20241121a_98`'s `high K+` end
  `3300` > `tEnd 3128.811` emitted raw, vs `…_20260121_250`'s `HiK` *apparently* clamped — and was
  **investigated and disproven.** The MATLAB exporter **uniformly emits raw `db4 exp_timing × 60`**
  for every **finite** region end. `…_250` only *appeared* clamped because its finite db4 value
  (~3068.911) **coincidentally matched** the recording length; no clamp and no substitution fired on
  any golden.
- A separate `isinf → max(timing)` fallback exists in the exporter for the **un-representable
  open-ended (`inf`)** case only. It **did not trigger** on any golden.

So **raw is the current, uniform behavior.** Clamping finite overhangs would be a **new rule**, not a
fix for a real split — there was no split.

## Decision

- **Finite region-end markers are emitted raw** (`db4 exp_timing × 60`), **even when they overhang
  `tEnd`. No clamping.**
  - Rationale: **source-faithful** — it preserves protocol-planned timing as recorded (`…_98`'s
    `high K+` was genuinely planned to run past the recording's end). The app **windows analysis to
    spikes** regardless (ADR-0019 §4), so marker values are **cosmetic for analysis** and there is no
    functional reason to mutate them.
- **Un-representable `inf` / open-ended ends fall back to `max(timing)`** — a **documented
  representability exception, not a clamp policy**, because `inf` cannot be written into the sheet.
- **No clamping of finite overhangs is introduced.**

## Consequences

- **Ratifies current exporter behavior** — the MATLAB side re-emits nothing.
- A marker may **legitimately point past `tEnd`**; downstream consumers (the xlsx reader, the
  region-setting/editing UI, analysis-time windowing) **must not assume `end_s ≤ tEnd`.**
- The two cases stay distinct and both documented: **finite → raw** (no substitution) vs
  **`inf` → `max(timing)`** (the only value substitution). Do not conflate the inf fallback with a
  clamp.
- Consistent with [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) §4: regions bracket
  to spikes at analysis time, so an overhanging marker never enlarges the analyzed window.

## References

- Refines [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) (metadata region schema).
- FOUNDATIONS §5 (input data format / region markers), §4 (regions).
- Evidence: the three v1.0 goldens and the overhang note in `golden/README.md` (the shared
  `team_colonel_kernel` bus).
