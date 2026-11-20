# Export request to interface2: every slice with human-confirmed spikes (2026-11-20)

> **STATUS 2026-11-20: ON HOLD; nothing exported.** Per interface2, relaying Tony, most of these
> slices are waiting on the final tracking and extraction run, and nothing is exported before it
> lands. Only three have finished tracking and been reviewed clean: 411, 434 and 465. All three
> are zero-spike slices (list B), so exporting them would add no kernels. 415 is not ready: Tony
> set it aside on 2026-11-03 to review its tracking. Re-file this request against the final run
> once Tony says it is in.

> **DRAFT, 2026-11-20, from 065 kernel. Not murderboarded.** This is a request under the
> existing file format, [lab-recording-contract.md](lab-recording-contract.md) version 2. It
> does not change that format. It says **which** recordings to write, and adds four optional
> provenance fields that a version-2 reader ignores. **This is not the final run.** The set will
> be exported again once more cells are confirmed.

## The selection rule (Tony, 2026-11-20)

Request **only** detections that a person confirmed in the cerebro app, which detects spikes
from the PatchMaster `.dat` files the way the lab's Igor analysis did. On disk, a file
qualifies when all of these hold:

1. It is the **highest revision** of its cell in `<Dropbox>/data/spikes/`.
2. `review.reviewed === true` and `review.by` is set.
3. `source.kind === "patchmaster"`. Files made from Igor experiments record no review
   (`review.reviewed` is `null`), so none of them qualify.
4. The cell has not been replaced in cerebro's `docs/pairing/superseded.json`. For example,
   `20260130c` is replaced by `20260130bs3`.
5. `timeZero.imaging[]` names exactly one imaging slice.

Do not substitute an unreviewed revision or an Igor-made file for any cell, even when a
confirmed one is missing. A slice whose cell does not qualify is left out, not filled in.

**Source of the list:** 065 cerebro, read only at 2026-11-20 ~14:45 local. 53 cells qualify;
51 of them are paired with a slice. Separately, 065 kernel counted 54 newest revisions with
`reviewed: true`, which is 53 after `20260130c` is dropped. **interface2 re-applies the rule
at export time** and reports any difference from the tables below. A cell confirmed after
this list was made is fine to include if it passes the rule.

## Which slices

### Already exported (8): do not re-export

418, 423, 427, 431, 439, 452, 455, 458. These are the version-2 files in `rawF_kernel_test/`,
and Tony said no re-export. Every one of them passes the rule.

### Request now (41)

**A. Confirmed cells with at least one spike (21).** Export these first.

| slice | cell (file) | spikes | gaps (n, s) | note |
|---|---|---|---|---|
| 20240813b42 | 20240813b.r4 | 7058 | 0, 0 | |
| 20240814a47 | 20240814a.r3 | 3834 | 0, 0 | series 1–3 left out; t = 0 is series 4 |
| 20240814b49 | 20240814b.r4 | 8078 | 0, 0 | |
| 20240827a55 | 20240827a.r4 | 1346 | 1, 27.2 | |
| 20240827b57 | 20240827b.r4 | 375 | 3, 51.2 | 1025 rejected and 15 added by hand |
| 20240930_65 | 20240930a.r1 | 3 | 3, 33.9 | |
| 20241122b_110 | 20241122b.r4 | 2031 | 2, 60.7 | |
| 20250827_196 | 20250827a.r3 | 964 | 1, 37.9 | |
| 20260115_240 | 20260115a.r3 | 4986 | 4, 151.9 | |
| 20260121_250 | 20260121a.r4 | 3894 | 1, 17.6 | |
| 20260121_252 | 20260121b.r5 | 10950 | 2, 52.9 | |
| 20260130_272 | 20260130bs3.r2 | 927 | 1, 11.9 | |
| 20260226_287 | 20260226c.r4 | 40 | 1, 25.0 | |
| 20260303_290 | 20260303a.r4 | 2145 | 1, 13.0 | |
| 20260303_301 | 20260303c.r4 | 637 | 1, 11.9 | |
| 20260304_307 | 20260304c.r4 | 1056 | 0, 0 | |
| 20260629_309 | 20260629a.r1 | 453 | 2, 16.6 | |
| 20260630_316 | 20260630a.r1 | 4 | 2, 30.2 | |
| 20260630_325 | 20260630c.r1 | 2868 | 0, 0 | |
| 20260701_328 | 20260701a.r1 | 62 | 2, 60.0 | |
| 20260701_331 | 20260701b.r1 | 5517 | 1, 5.7 | |

**B. Confirmed cells with zero spikes (20).** These yield no kernel. They are confirmed
recordings in which the patched cell fired no spike that was kept, so they show whatever
calcium the ROIs carry with no AP from that cell beneath it. Export them after A.
`spikes` is present with `n: 0`, never `null`
([contract v2](lab-recording-contract.md), point 5).

20240930_69, 20241002_72, 20241212_131, 20260115_243, 20260120_248, 20260122_256,
20260130_270, 20260225_275, 20260225_280, 20260226_282, 20260629_312, 20260629_314,
20260702_334, 20260702_338, 20260706_341, 20260814_404, 20260917_411, 20260917_415,
20261020_434, 20261027_465.

### Held for Tony (2)

- **20261023_448** (47 spikes): Tony hard-excluded 448 from the male cohort.
- **20261027_468** (2 spikes): Tony called 468 "not usable".

Both pass the rule. Export them only if Tony says so.

### Not paired, so not requested (2)

- 20260225b: the pairing to 20260225_277 is unsettled, and Tony has not ruled.
- 20220126a: a 2022 cell with no imaging.

## What interface2 decides

Under contract version 2, the producer makes every export decision, and this request does not
take any of them over. That covers which ROIs are dropped, which stretches are bridged, the
production F0 and penumbra settings, and the target ROI. Many of the 41 slices are outside
the cohorts that already have a dead-ROI rule and export factors.

- **For each such slice, interface2 says what it applied.** Record it in `cleaning`,
  `production` and `provenance` as usual.
- **interface2 may decline a slice it cannot screen.** List each declined slice with its
  reason; don't guess.
- **A declined slice is still useful information.** Return the list.

## Spikes: what to carry over from the cerebro file

These items are required by contract version 2:

- `spikes.times`: cerebro's `times`, as is. `timeZero.imaging[].offset_s` is 0 in every
  paired file, so the times are already on the imaging clock. Record the offset in
  `spikes.source.offset_s` all the same.
- `spikes.gaps`: cerebro's `gaps[]`, unchanged.
- `spikes.source`: `cell`, `revision`, `file`, `sha256`, `reviewed`, `offset_s` and
  `triggered_series`, exactly as in the contract.

**Four optional fields, new, inside `spikes.source`.** A version-2 reader ignores them, so the
version stays 2.

| Field | Copied from cerebro | Why |
|---|---|---|
| `review_by` | `review.by` | the reader can then show who confirmed the spikes |
| `review_at` | `review.at` | the reader can tell a re-confirmed cell from the one it saw before |
| `excluded_series` | `excluded[]`, as a list of `{series, reason}` | series that cerebro left out of `times` entirely |
| `clock_difference_s` | `timeZero.imaging[].clockDifference_s` | the wall-clock residual behind the choice of the triggered series |

Leave out the per-series rejected and added times. They are cerebro's audit trail and are not
needed here.

## Things that might fail without anyone noticing

1. **The imaging may end before the patch recording.** cerebro's PRIORITIES.md says imaging for
   434, 439 and 468 may have stopped 5–10 min early after a hardware crash. That estimate comes
   from start times and frame counts, not from the imaging files. Write `time` from the actual
   frames. **Do not trim the spikes.** `npm run lab-validate` reports any spikes that fall
   outside the imaging time span. Please state in `provenance` when the frames end before
   cerebro's `duration_s`. 439 is already exported, and our validator found 0 spikes outside
   the span on all 8 exported files.
2. **The triggered series is chosen from wall clocks, not from frames.** The residual is −3.9
   to +2.0 s across settled pairings. Carry `clock_difference_s` (above) so a consumer can see
   it.
3. **Files reviewed before 2026-11-13 confirm at the cell level only.** Files from 2026-11-13
   on also have a per-series `confirmed` flag. Both forms pass the rule above.

## Where the files go

Write the 41 files to a **new subfolder** of `rawF_kernel_test/`, for example
`rawF_kernel_test/confirmed_2026-11-20/`. That leaves the 8 existing files and
`kernel_review.tsv` untouched, and makes this batch replaceable as a unit when the next run
supersedes it. The exact name is interface2's to choose, under the lab naming scheme.

**Expected size.** The first files were 14–26 MB each, so the batch is roughly 0.6–1.1 GB in
Dropbox.

## Checking and handing back

- Before handing back, run `npm run lab-validate -- <folder>` from a colonel_kernel checkout.
  Every file should be read, with 0 refused.
- Return a table with one row per slice: slice id, written or declined (with the reason),
  ROIs, ROIs dropped, bridged frames, spikes, spikes outside the imaging span, and the
  exporter commit.
- jsMLspike reads the same folder. Nobody consumes the batch until the validation table is in.
