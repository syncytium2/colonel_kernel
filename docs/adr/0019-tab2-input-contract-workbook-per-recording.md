# ADR-0019: Tab 2 input contract — one xlsx workbook per recording, regions in-app

## Status

**Accepted** — for the **core contract**: the three-sheet workbook, the **zero-based shared origin**
(t = 0 at experiment onset for trace, spikes, and region bounds), **regions-as-in-app definitions**,
and the **spike-bracketed default region**. Acceptance is driven by the contract being **frozen at
`CONTRACT VERSION 1.0`** in the shared `team_colonel_kernel` bus, with the MATLAB team building its
exporter against v1.0.

**This does not close the "Open items" below.** The open tails — CSV-path region-metadata container,
skipped/empty-region manifest, recording-level metadata, and the soft spike-sufficiency threshold —
remain genuinely undecided *within* this now-Accepted ADR; acceptance covers the core contract, not
those.

This **replaces the file *layout* of [ADR-0016](0016-csv-input-layout.md)** (the single-rectangle
`time` / `spikes` / `roi1..roiN` CSV). ADR-0016 stays **Accepted**: its **offline-converter /
no-egress posture** (decode `.mat` offline, never in-browser; gitignored output, FOUNDATIONS §6)
is **inherited unchanged**. What changes is (a) the container and (b) the **granularity** — 0016
was **per-region**; 0019 is **per-recording** (one workbook holds the whole recording and all its
regions).

Sequencing is load-bearing: **this ADR → app xlsx-reader / `loadCsv` change → MATLAB re-export.**
The re-export must target the frozen sheet spec below and must **not** run before the app can read
xlsx. This ADR is canon only; it implements nothing.

**Clock convention (resolved in this draft).** The time axis is **zero-based**: ephys and calcium
imaging both start at **t = 0 at experiment onset**, sharing one origin. `trace.time`, the `spikes`
sheet, and the `metadata` `start_s`/`end_s` all live on this single zero-based axis. This **corrects
the initial absolute-clock wording** of the draft (which assumed a recording starting at, e.g.,
~65 s); nothing was built against the absolute assumption, so it is amended in place rather than
superseded. The repaired MATLAB archive's `timing` is already zero-based, so no re-source is needed.

## Context

The prior layout (ADR-0016) packed the spike list into a CSV column **bounded by the frame count**
(`mat2csv.py` ragged layout). That assumed `nSpikes ≤ nFrames`; when violated it **silently
truncated** — file-250 `senktide` (3830 spikes, 1348 frames) lost 64.8% of its spikes, destroying
kernel recovery. The same layout overloaded one rule ("any non-`time`/`spikes` column is an ROI"),
leaving no home for metadata. This ADR fixes the *format* that allowed both.

Two reframings drive the new contract:

1. **The input format is the app's field-facing contract.** Real users won't have `.mat` files;
   the MATLAB re-export is merely *case zero* of producing conformant input.
2. **A recording is one object, not a pile of per-region files.** Splitting regions at export time
   (the old behavior) caused a file explosion, discarded the cross-region relationship (same cell,
   same ROIs, different drug window), and baked trimming irreversibly into each file. Keeping the
   recording **whole and untrimmed**, with **regions as in-app definitions**, preserves all of it.

On format choice: general interchange guidance prefers CSV and warns that xlsx **type-coerces** and
can corrupt numbers. That risk is about **hand-edited / ad-hoc** spreadsheets; a **programmatically
written** workbook (MATLAB writer, app reader, numbers written as numbers) does not incur it, and a
single multi-sheet workbook is the right shape for "one recording = trace + spikes + region
definitions." So xlsx is adopted as **primary**, with CSV retained as a **field-user fallback**.

## Decision

### 1. xlsx is the primary format — one workbook per recording

The MATLAB re-export emits **one `.xlsx` workbook per recording** (no per-region file explosion).
The recording is exported **whole and untrimmed** — the **complete recording, t = 0 → end** — and
regions are **not** split into files; the workbook carries region **markers** only. Reading xlsx is
therefore on the **v1 critical path** — the app must read xlsx to load real data — so a local xlsx
parser (e.g. SheetJS) is a **v1 dependency, self-hosted/bundled** per FOUNDATIONS §6 (no CDN). Used
**read-only**.

### 2. The workbook — three sheets

Sheet names are matched **case-insensitively and trimmed**. **`trace` and `spikes` are required**
(hard error if either is absent); **`metadata` is optional**.

- **`trace` sheet** — `time, roi1 … roiN`, the **whole continuous recording** in **zero-based
  recording time (seconds)** — t = 0 at experiment onset, the one shared origin for trace, spikes,
  and region bounds (see Status / clock convention) — one row per frame. `time` is **strictly
  increasing**; **`dt` is derived** from it
  ([ADR-0012](0012-timing-vector-authoritative-dt-derived.md)), never stored. NaN permitted in ROI
  columns (empty cell; see §5 fidelity invariant). The **first trace column positionally is the
  targeted cell**, regardless of its header name (FOUNDATIONS §4; remaining columns are all
  examined).
- **`spikes` sheet** — a single column **with the header `spikes`** (the header is **required** on
  the xlsx path), the **whole spike train**, **any length, independent of the frame count**, on the
  **same zero-based timebase (seconds) as the trace `time`**. **One spike train per recording in v1.**
- **`metadata` sheet (optional)** — **region definitions** (schema in §3), plus reserved room for
  future fields. `dt` is **not** stored here (derived).

### 3. Metadata sheet — region-definition schema (writer and reader both depend on this)

**Table layout.** Row 1 is a header; one row per region thereafter. Header cells matched
**case-insensitively, trimmed**:

| column     | required | type   | meaning |
|------------|----------|--------|---------|
| `region`   | yes      | text   | region/epoch label (e.g. `baseline`, `senktide`). Unique within the workbook. |
| `start_s`  | yes      | number | region start, **zero-based recording-time seconds** (same axis as trace `time`). |
| `end_s`    | yes      | number | region end, zero-based recording-time seconds. Must satisfy `start_s < end_s`. |

**Region invariants (machinery-gated on load):**
- **Regions are disjoint and non-overlapping.** **Overlap is a HARD ERROR on load** — the writer
  must never produce overlapping regions.
- **Gaps between regions are permitted and expected** (untreated stretches between drug windows).
- Regions are **ordered by `start_s`** (the reader sorts; out-of-order rows are not an error, but
  overlap after sorting is).

**Reader rules:**
- **Unknown extra columns are ignored** (forward-compatible — future per-region fields can be
  appended without breaking older readers).
- A row with a blank/non-finite `start_s`/`end_s`, or `start_s ≥ end_s`, is **skipped with a
  warning** (representation, not machinery).
- A region window outside the trace's `time` range is **clamped to the trace and warned**.
- **If the `metadata` sheet is absent or has no valid rows — i.e. no in-app region definition —
  the app analyzes a single implicit default region over the full calcium signal, bracketed to the
  spikes:** `[first_AP − 1.0 s … last_AP + 1.0 s]`, using the same app-side buffer of §4
  (dt-derived, `round(1.0 / dt)` samples). The default region is bracketed to its spikes exactly as
  a named region is (§4) — it is **not** the full untrimmed trace; this keeps long no-spike head/tail
  stretches out of the deconvolution ([ADR-0017](0017-circular-deconv-zero-padding-no-fix.md)). The
  degenerate 0/1-spike case is handled by §7.

**Reserved (documented, ignored by the v1 reader if present):** `buffer_s` (per-region analysis
buffer override, in **seconds**; see §4), `note`, `exclude`. **Recording-level** metadata
(targeted-ROI override, recording id, nominal frame rate, operator notes) is **NOT in v1** — see
OPEN.

**Writer note (MATLAB):** the existing `region(i).t_start` / `.t_end` are in **minutes**
(`aCa98_batch_APs.m`); the writer must convert to **seconds** on the trace's zero-based axis
(experiment onset = 0). The
writer emits the **complete recording and region markers only** — it applies **no trimming and no
buffer** (see §4).

### 4. Regions are in-app; bracketing moves to analysis time

- The app reads region definitions from the `metadata` sheet **or lets the user set/edit them
  in-app** (region name, start, end).
- **All windowing and bracketing is performed in-app at analysis time** — the writer never trims or
  buffers. For each region the app: (1) selects spikes in `[start_s, end_s]`, then (2) brackets the
  trace to `[first_spike − buffer … last_spike + buffer]`.
- **The buffer is an app-side analysis parameter, not an export parameter.** Default **1.0 s**,
  converted per recording to **`round(1.0 / dt)` samples**. A reserved `metadata` column `buffer_s`
  permits a per-region override **in seconds**. **The writer never applies a buffer.**
- **Trimming moves from export-time (old MATLAB) to analysis-time (app).** This is how the
  **no-spike-tail / circular-deconv** concern ([ADR-0017](0017-circular-deconv-zero-padding-no-fix.md))
  is handled **per region** — each region is bracketed tightly to its own spikes, so silent acausal
  tails from long no-spike stretches don't enter the deconvolution.
- The app analyzes **per region** and supports **cross-region kernel comparison** — same cell, same
  ROIs, different time windows (e.g. baseline vs senktide kernels overlaid). **This is a v1 scope
  expansion** beyond the queued per-ROI re-fan (see Consequences).

### 5. xlsx numeric fidelity — invariant

**Numeric cells (never text- or date-formatted); NaN is the empty cell.** Honored by both readers
and writers. Two enforcement mechanisms, both noted:
- **Field / new users:** fidelity is enforced by a **provided template workbook** with columns
  pre-typed numeric. This template is a **separate v1 deliverable — reserved / TBD** in this ADR.
- **MATLAB re-export:** no template — the **writer code must emit numeric cells and empty-cell
  NaN**. A code-level requirement to be **confirmed in the re-export prompt and verified in the
  generated writer** (see Consequences / sequencing).

### 6. CSV path — secondary, field-user fallback

CSV remains **tolerated** for users without xlsx: a **trace CSV** (`time, roi1…roiN`) + a
**spikes CSV** (`spikes`), **two files, lengths decoupled, padding still banned**. Pairing is by the
UI (assign which file is trace, which is spikes); a **headerless** one-column spikes CSV is
**tolerated only on the CSV / UI-pairing path** (the xlsx `spikes` sheet still requires its header).
The CSV path has **no metadata sheet**, so CSV-path region metadata falls to the OPEN container
(below) — which **does not block v1**, because the re-export of Tony's own data is **xlsx** and
carries regions in its `metadata` sheet.

### 7. Per-region spike sufficiency — report, do not gate

Consistent with [ADR-0011](0011-validation-gates-machinery-not-fit.md) /
[ADR-0014](0014-machinery-check-metric.md) (diagnostic readouts over verdicts):

- The app **reports per region**: spike **count** and spike **rate (Hz)** over the region window.
- Regions below a **soft** threshold are **flagged low-confidence but still analyzed and
  displayed — never skipped**.
- **Hard error only on the degenerate case** (0 or 1 spike, bracketing undefined): surface
  "region has too few spikes to analyze (N)".
- The legacy MATLAB `min_events = 10` is **deliberately not ported** as a gate — it was *declared
  but never enforced* (the actually-executed gate was `nAPs > 1`), and gating contradicts the
  reporting philosophy.
- The **soft low-confidence threshold value** (Hz or count) is **OPEN** — reserved, not hard-coded.

## Known boundaries (deliberate v1 assumptions)

- **Padding is explicitly banned.** Equalizing row counts — trace vs spikes, or across spike
  trains — is the shape of the truncation bug and must never be reintroduced.
- **Single spike train per recording.** Simultaneous multi-AP recordings are **out of scope for
  v1**; the future shape is **long-format** (`train_id, spike_time`) or **one sheet per train** —
  never padded wide columns. **Reserved, not built.**
- **Trim bounds are self-describing.** Because the `trace` sheet carries the recording's **zero-based
  time axis** (one shared origin for trace, spikes, and region bounds), any window (region or
  spike-bracket) is fully described by its `time` values — **no separate trim-bounds field is
  needed**, and the legacy implicit export-time trim is eliminated.

## Open items (do NOT resolve here; none block the re-export)

- **OPEN — CSV-path region-metadata container.** JSON sidecar vs UI-entry-only. The **xlsx path is
  settled** (`metadata` sheet). Does **not** block v1 (Tony's input is xlsx).
- **OPEN — skipped/empty regions: manifest vs silent absence.** With whole-recording export the
  data is all present (regions are in-app), but whether to **record** which regions were
  intended/skipped is undecided. The re-export is the moment to decide; **flagged, not resolved.**
- **OPEN — recording-level metadata** (targeted-ROI override, recording id, nominal frame rate,
  operator notes): **deferred to v1.1, reserved not built.** The region table is the only metadata
  in v1.
- **OPEN — soft spike-sufficiency threshold value** (Hz or count) for the low-confidence flag (§7).

## Consequences

- **SheetJS (or equivalent) is v1 critical-path, not optional tolerance** — the app cannot load real
  data without it. Must be **self-hosted/bundled** (FOUNDATIONS §6) and adds **bundle weight**;
  used read-only.
- **A numeric-fidelity template workbook is a separate v1 deliverable** (§5), reserved/TBD here.
- **The MATLAB writer must emit numeric cells + empty-cell NaN** (§5) — a code-level requirement to
  be confirmed in the re-export prompt and verified in the generated writer.
- **App scope grows materially:** a **region-setting/editing UI**, **per-region bracketing at
  analysis time**, and a **cross-region comparison view** — all beyond the currently-queued
  "re-fan to N ROI columns." **Deadline implication, stated plainly:** this is a larger v1 than the
  re-fan alone; sequence/scope it deliberately.
- **Sequencing (hard):** ADR → app xlsx-reader / `loadCsv` change → MATLAB re-export. The re-export
  must target the **frozen sheet spec** above and must **not** run before the app reads xlsx.
- **Backward incompatibility:** existing single-rectangle CSVs in `exports/` will no longer load
  (clean break; gitignored and regenerable, not migrated).
- **Metadata overload resolved:** the `trace` sheet is data-only; region definitions live in their
  own sheet — no column is silently coerced into a fake ROI.
- **Truncation class eliminated by construction:** spike length is decoupled from frame count and
  padding is banned, so `nSpikes > nFrames` is a non-event.
- **Inherited from ADR-0016:** `.mat` is still decoded **offline** (the MATLAB writer), never
  in-browser; converter output stays gitignored (FOUNDATIONS §6).

## References

- Replaces the layout of [ADR-0016](0016-csv-input-layout.md) (which remains Accepted; granularity
  shifts per-region → per-recording).
- [ADR-0012](0012-timing-vector-authoritative-dt-derived.md) — `time` authoritative, `dt` derived.
- [ADR-0011](0011-validation-gates-machinery-not-fit.md), [ADR-0014](0014-machinery-check-metric.md)
  — report, don't gate (the spike-sufficiency policy, §7).
- [ADR-0004](0004-tab2-deconvolution-method.md), [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md)
  — the per-region bracketing addresses the circular-deconv / no-spike-tail concern.
- FOUNDATIONS §4 (multi-ROI / cross-region), §5 (input format), §6 (privacy — governs the bundled
  xlsx parser).
- `docs/notes/80-sta-misalignment.md` and the file-250 truncation finding (motivating evidence).
