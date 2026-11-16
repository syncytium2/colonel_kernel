# The lab recording file: raw fluorescence and spike times for one recording

> **DRAFT, version 1, proposed 2026-11-16. Not murderboarded. No producer has written a real
> file against it yet.** The reader, its tests and a simulated file exist; the MATLAB exporter
> does not. Treat every field as open to change until one real recording has been written,
> validated and looked at. Decision record: [ADR-0053](adr/0053-lab-only-raw-fluorescence-page.md).

One JSON file per imaging recording, named `<slice_id>.klab.json`. It is read by the lab-only
page in this repository (`#lab`, dev server only) and by nothing in the public app.

It exists because the public input contract ([ADR-0019](adr/0019-tab2-input-contract-workbook-per-recording.md))
carries dF/F0 only, and the question the lab page asks needs what came before dF/F0: the raw
soma and penumbra fluorescence of each ROI.

**This is not the `team_colonel_kernel` workbook and does not change it.** Lab recordings must
not be written into `team_colonel_kernel/`: interface2's `docs/handoffs/haruspex.md` records
that the bus protocol does not allow raw traces there. Where the files do go is a decision for
Tony and the producer (see "Open points").

## Who supplies what

| Content | Source | How it reaches the file |
|---|---|---|
| Raw soma and penumbra fluorescence, frame times, ROI list, target ROI, regions | interface2 | read from its archive and db4 by the exporter |
| Spike times | cerebro, `data/spikes/<cell>.r<N>.spikes.json` | through interface2's `if2_spikes(slice_id)`, which checks the file and shifts the times to the imaging clock |
| Kernel recovery | this repository, `src/lib/core/` | never precomputed; the file carries no kernel |

## What a reader can rely on

1. **Numbers are exact.** Every numeric array is base64 of its little-endian bytes, never
   decimal text. A reader gets back the bits the producer held.
2. **The file can prove it.** Each array may carry `sha256`, the SHA-256 of those bytes as
   lower-case hex. A reader recomputes it and refuses the file on a mismatch. A producer
   should always write it; the reader warns when it is absent.
3. **Fluorescence is raw.** `raw_soma` and `raw_pen` are the mean fluorescence inside the ROI
   mask and inside its penumbra ring, in camera units, from the motion-corrected stack. No
   F0, no dF/F0, no penumbra subtraction, no filtering, no normalization.
4. **Spike `t = 0` is imaging `t = 0`.** Spike times are in seconds on the same clock as
   `time`. The producer has already applied the offset between the loose-patch series and the
   imaging start; `spikes.source.offset_s` records what was applied.
5. **No spike file is not the same as no spikes.** `"spikes": null` means no spike file was
   paired. A paired cell with no events has `spikes` present with `n` 0.
6. **Nothing is trimmed.** Traces cover the whole recording. Regions are markers, not cuts.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | `"colonel-lab-recording"` |
| `version` | yes | `1`. A reader refuses any other value. |
| `slice_id` | yes | interface2's canonical id, e.g. `20260917_411`. |
| `cohort` | no | Free text, shown to the reader. |
| `dt_nominal_s` | yes | The declared frame interval in seconds (`0.1` for the 10 Hz corpus). Parameters given in seconds are converted to samples with this number, never with `mean(diff(time))`. |
| `n_frames`, `n_roi` | yes | Whole numbers. |
| `time` | yes | Array object, `float64`, shape `[n_frames]`: frame times in seconds, strictly increasing. `time[0]` need not be 0. Its mean interval must be within 1% of `dt_nominal_s`. |
| `rois` | yes | List of `n_roi` objects in column order, each with `label` (e.g. `"roi1"`). |
| `target_roi` | yes | 1-based position in `rois` of the loose-patch cell, or `null` when not known. Stated, never implied by position. |
| `traces.raw_soma` | yes | Array object, shape `[n_frames, n_roi]`, `order: "column-major"`. |
| `traces.raw_pen` | no | Same shape. Without it the penumbra variants are not offered. |
| `traces.dff_production` | no | The producer's own stored dF/F0 of the raw soma trace (interface2 `ROIdata.dFoF0.ROI`), same shape. When present the validator reports how far the reader's recomputation is from it. |
| `production` | no | What the producer's pipeline used: `f0: {t1_s, t2_s, t4_s}` (`t2_s: null` for no limit) and `pensub_k`. Informational. |
| `spikes` | yes | `null`, or the object below. |
| `spikes.units` | yes | `"s"` |
| `spikes.clock` | yes | `"imaging"`. A reader refuses any other value. |
| `spikes.times` | yes | Array object, `float64`, shape `[n]`, ascending, all finite. |
| `spikes.n` | yes | Count; must equal the array length. |
| `spikes.gaps` | no | List of `{start_s, end_s}` on the imaging clock: stretches when the loose-patch recording was not running. The reader removes both the trace and any spikes inside them. |
| `spikes.source` | yes | `cell`, `revision`, `file`, `sha256` (of the cerebro file's own `times`), `reviewed` (`true`, `false` or `null`, copied from cerebro's `review.reviewed`), `offset_s`, `triggered_series`. |
| `regions` | no | List of `{name, start_s, end_s}` in seconds on the imaging clock, from db4. They must not overlap. An open-ended region ends at the last frame time. |
| `exclusions` | no | List of `{start_s, end_s, reason}`: stretches to leave out (artifacts, blanked frames). |
| `provenance` | yes | `tool`, the producer's `commit`, `created` (UTC), and the archive variant read. |
| `truth` | never from a producer | Simulated files only: the planted kernel. |

**Array object:** `{"dtype": "float32" | "float64", "shape": [..], "b64": "...", "sha256": "..."}`.
Bytes are little-endian. A 2-D array is stored column-major, which is MATLAB's own memory
order: all frames of ROI 1, then all frames of ROI 2.

Traces should be `float32`, which is what the archive holds. `time` and `spikes.times` must be
`float64`.

## Writing one from MATLAB

Not yet written or run. The array object is three calls:

```matlab
bytes = typecast(single(X(:)), 'uint8');            % X is nFrames-by-nROI; (:) is column-major
obj.dtype = 'float32';  obj.shape = size(X);
obj.b64   = matlab.net.base64encode(bytes);
md = java.security.MessageDigest.getInstance('SHA-256');
obj.sha256 = lower(reshape(dec2hex(typecast(md.digest(bytes), 'uint8'))', 1, []));
```

Three things to check on the first real file, because each fails quietly:

- `jsonencode` writes a 1-by-1 `shape` as a scalar, not a list. `shape` must be a JSON list
  even for one ROI or one spike.
- An empty spike train must still produce `"shape": [0]`, `"b64": ""` and `"n": 0`.
- `typecast` gives the machine's byte order. Windows and Apple Silicon are both
  little-endian, so no swap is needed there.

## Checking a file

```bash
npm run lab-validate -- /path/to/folder-or-file.klab.json
```

It uses the same reader as the page, prints the shape, the target ROI, the spike count, how
many spikes fall outside the imaging time span, the regions and every warning, and exits 1 if
any file is refused. A simulated file to compare against: `npm run lab-fixture`.

## What has been checked

- **Reader round trip (`npm run test:lab`, 39 checks):** a simulated file reads back bit for
  bit; a file with one trace value altered, a wrong version, a wrong shape, row-major traces,
  spikes on another clock, a wrong spike count, an out-of-range target, overlapping regions
  and a contradicted `dt_nominal_s` are each refused.
- **Not checked:** any file written by MATLAB; any real recording; a file of realistic size
  in the browser (a 27-minute recording with about 290 ROIs and three trace matrices is about
  75 MB of base64).

## Open points

1. **Where the files live.** Proposed: a new folder under the lab data root, outside
   `team_colonel_kernel/`. The dev server reads the folder named by `CK_LAB_RAW_DIR`.
2. **The file name.** `<slice_id>.klab.json` is a placeholder. interface2's rule is that
   output names come from the lab-wide naming scheme, which does not cover export data files
   yet; the name should follow that scheme once it does.
3. **Which ROIs to export.** The contract takes any subset. The target ROI is required for
   kernel work; every ROI is needed to look for coupling in a non-targeted ROI.
4. **Relation to the haruspex export contract.** haruspex `docs/contract/export_contract_v0.md`
   specifies the same content as one HDF5 file per recording, and that exporter exists on an
   interface2 branch but has not been run. This file is JSON because the page runs in a
   browser with no HDF5 reader. If both are wanted, one exporter should feed both.
