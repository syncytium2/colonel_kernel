# Dataset kernel-summary pipeline

Offline tooling that renders a **one-page-per-slice** PDF summarizing kernel recovery
across the golden `.xlsx` dataset, plus a plain-language **methods explainer**. Prototype
for the in-app "summarize a dataset" feature; uses the shipped core
(`src/lib/core/*` — recovery, rasterize, ADR-0035 region windowing) unchanged.

> **Data hygiene / outputs:** deliverables derive from **unpublished recordings** — never
> commit them. The **per-slice JSON + the full PDF** are written to the team Dropbox
> `SUMMARY_DIR` (default `…/team_colonel_kernel/summaries/`) for backup + cross-machine sync
> — the same account that holds the goldens, so no wider exposure (the "team" is one person).
> Override with the `SUMMARY_DIR` env var. The **venv + scratch** stay in the repo's local
> gitignored `darkroom/`. Only the scripts here are tracked. The methods explainer (synthetic,
> data-safe) is also tracked in `docs/img/` + bundled at `src/lib/assets/`.

## Depends on
- The **ADR-0035** region-windowing (`windowRegion(..., {protocol})`) — on `main`.
- Node (repo deps incl. `xlsx`) for the `.mjs` dumpers; the `darkroom/venv` Python
  (matplotlib + numpy) for the renderers.
- Local data (paths hardcoded at the top of `slice_lib.mjs` and `batch_dump.mjs` — edit
  if your Dropbox layout differs):
  - golden workbooks: `…/team_colonel_kernel/golden/`
  - cohort + region timing: `…/data/indiegroups_db4.xlsx`

## Files
| file | role |
|------|------|
| `slice_lib.mjs` | `buildSlice(file, {regions})` → the per-slice summary data (context strip + per-region top-4 kernel ROIs, all four methods + STA). `opts.regions` overrides the workbook's metadata sheet. |
| `batch_dump.mjs` | Loops all goldens, tags each with `group_id`/`treat` and **corrected region timing from `indiegroups_db4` `exp_timing`**, orders by treatment (baseline → senktide → TTX → sb222200 → other), writes `$SUMMARY_DIR/pdf/*.json` + `manifest.json`. |
| `fig_slice_page2.py` | `render_page(d)` → one matplotlib page. Kernels at fixed absolute dF/F₀ (constant unitary-amplitude anchor); STA scaled-to-fit; ROI 1 pinned first. Also runnable standalone for a single JSON. |
| `build_pdf.py` | Assembles `$SUMMARY_DIR/dataset_summary_full.pdf` from the manifest (vector; context strip rasterized; per-slice JSON resolved next to the manifest, so the folder is relocatable). |
| `scan_kernels.mjs` | Quick screen: which slices/ROIs have a plausible kernel (finds good app-test cases). |
| `methods_explainer.py` | The one-page four-methods explainer (`darkroom/methods_explainer.pdf`, synthetic/data-safe). |

## Rebuild (run from repo root)
```sh
# 1. dump every slice (heavy: recovery over all ROIs; ~2-3 min)
node scripts/dataset-summary/batch_dump.mjs
# 2. assemble the PDF
PYTHONPATH=scripts/dataset-summary darkroom/venv/bin/python scripts/dataset-summary/build_pdf.py
# methods explainer (standalone)
darkroom/venv/bin/python scripts/dataset-summary/methods_explainer.py
```

**Re-dump a single slice** (e.g. after a db4 timing edit) without the full batch: read that
slice's `exp_timing` row, build `regions` (minutes × 60), call
`buildSlice(file, {regions})`, and overwrite its `$SUMMARY_DIR/pdf/NN_<id>.json`, then re-run
`build_pdf.py`.

## Notes
- **Region timing comes from `indiegroups_db4` `exp_timing`**, not the goldens' metadata
  sheets — so db4 corrections (e.g. the TTX-onset fixes) show up on a re-dump without
  touching the shared-bus workbooks. The canonical long-term fix is still the MATLAB
  re-export of the goldens.
- The plausibility `✓` is a **screen, not a verdict** (ADR-0018 — eyeball decides).
