# ADR-0016: CSV input layout — per-region schema, produced by `scripts/mat2csv.py`

> Layout replaced by [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md); offline-converter / no-egress posture retained.

## Status

Accepted
(Closes the open §10 item 6. The column set and ragged convention are settled; the
exact header/format particulars are a v1 convention that may evolve via a superseding
ADR if the loader later needs embedded metadata.)

## Context

`FOUNDATIONS.md` §5 set out the minimal ground-truth CSV schema but deliberately
left the **layout convention open** — §10 item 6: *"CSV layout convention for the
sparse spike column vs dense trace columns (confirm against a real exported file
once one exists)."* No CSV existed, because the source data lives in MATLAB v7.3
(HDF5) structures (`k_sta_store`).

Two things now make the question answerable:

- The noise reconnaissance produced HDF5 navigation validated against the reference
  fixtures, promoted into a tracked offline converter
  (`scripts/mat2csv.py`) that emits real CSVs from the `APs_v1_*.mat` files. **A real
  exported file now exists** — the precondition §10 item 6 named.
- The boundary is already fixed (reference doc §1): the app's scope is **one region's
  worth** of `traces + time + spikes`; segmentation, gating, and lab-format decoding
  stay upstream. So the CSV is per-region.

The app stays CSV-first with no in-browser `.mat` parser and no network egress
(§5, §6); `.mat` decoding is offline, in the converter.

## Decision

The CSV input layout is **one file per region**, with columns:

- **`time`** — dense frame timebase (seconds), one row per frame. Authoritative when
  present ([ADR-0012](0012-timing-vector-authoritative-dt-derived.md)); `dt` is
  derived from it.
- **`spikes`** — sparse action-potential event times (seconds), one entry per spike.
  **Shorter** than the dense columns; rows below the last spike are **left blank** —
  the "ragged columns with blanks below the short spike column" convention §5
  anticipated.
- **`roi1..roiN`** — dF/F₀ traces, dense, one column per ROI. **`roi1` is the default
  targeted cell** (FOUNDATIONS §4); the rest are context / multi-ROI candidates.

Format particulars:

- Values are written round-trippably; **non-finite trace samples are the literal
  `NaN`**.
- The stored **pre-trim `btiming` is emitted verbatim**; the app applies the
  `mod(k,2)` even-length trim itself ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md),
  FOUNDATIONS §13), so the converter must not pre-trim.
- Produced by **`scripts/mat2csv.py`** (tracked); its **output is gitignored**
  (`exports/`) — researchers' data is never committed (§6).

## Consequences

- **Closes `FOUNDATIONS.md` §10 item 6.** The CSV layout is no longer open; it is this
  schema, confirmed against real exported files.
- The app's (not-yet-built) **CSV loader targets this schema**: `papaparse` → the
  `{ samples, dt, zeroIndex, times }` signal contract
  ([ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) /
  [ADR-0012](0012-timing-vector-authoritative-dt-derived.md)), `roi*` columns → one
  Signal per ROI, the `spikes` column → the event list that feeds binned-count
  rasterization ([ADR-0001](0001-delta-rasterization.md)).
- The converter realizes the §5 **bridge**. It complements, not replaces, the
  hand-written `writetable`/`csvwrite` snippet §5 mentions — that remains fine for a
  user working from MATLAB; `mat2csv.py` serves the processed `APs_v1_*.mat` outputs
  directly and offline.
- Naming/format are **v1 conventions**. If the loader later needs embedded metadata
  (units, nominal `dt`, region name), a superseding ADR adds it rather than editing
  this one.
- Relates to: reference doc §1 (the region boundary), FOUNDATIONS §4 (`roi1` default),
  §5 (schema), §6 (offline / no egress), §13 (pre-trim timing),
  [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) /
  [ADR-0012](0012-timing-vector-authoritative-dt-derived.md) (the contract the loader
  builds), [ADR-0001](0001-delta-rasterization.md) (binned-count from `spikes`).
