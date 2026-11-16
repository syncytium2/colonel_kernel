# Handoff: the lab-only raw-fluorescence page (2026-11-16)

**For:** a session on 065 taking this over, and Tony.
**From:** a cloud session (`claude/kernel-viewer-fluorescence-a68sg6`). It had the four
repositories and no data, no MATLAB and no Dropbox folder, so **everything below was built
and run on a simulated recording only.**
**Branch:** `claude/kernel-viewer-fluorescence-a68sg6`, pushed, **not merged to `main`, not
deployed.** Seven commits, `168f910` to this one.

> ⚠ **DRAFT, NOT MURDERBOARDED**, like the ADR and the contract it points at. The freshness
> gate could not reach `syncytium2/murderboard` from the cloud session. Run `/murderboard` on
> [ADR-0053](adr/0053-lab-only-raw-fluorescence-page.md) and
> [the contract](lab-recording-contract.md) before either is treated as settled.

## What it is for

Tony, 2026-11-16: test whether the processing between raw fluorescence and dF/F0 removes
part of the kernel. Spikes come from cerebro, calcium signals from interface2, and the
viewer is lab-only, in this repository. haruspex is reference only.

## Start it on 065

```bash
git fetch origin && git switch claude/kernel-viewer-fluorescence-a68sg6
npm ci
npm run test:core        # 265 pass
npm run test:lab         # 51 pass
npm run lab-fixture      # writes exports/SIMULATED_20261116.klab.json (gitignored, no lab data)
npm run dev              # then open http://localhost:5173/#lab
```

For real recordings, point the dev server at the folder that holds the `.klab.json` files.
In Git Bash:

```bash
CK_LAB_RAW_DIR="C:/Users/defazio/University of Michigan Dropbox/Richard DeFazio/data/kernel_lab" npm run dev
```

The `LAB · Extraction` button exists only on the dev server. `scripts/lab-shot.mjs OUTDIR`
screenshots the page (`LAB_SCHEME=dark`, `LAB_VERDICT=unsure` to exercise a save); the cloud
session needed `PW_CHROMIUM` to name a browser, 065 may not.

## What is in flight right now

The session "065 interface2 cerebro" was asked on 2026-11-16 to write the interface2
exporter and three files: `20261023_452`, `20261026_458`, `20261027_468`. The request and
field map are in interface2 `docs/handoffs/HANDOFF_kernel_lab_export_2026-11-16.md` (same
branch name, in that repository). It was told to stop if db4 lacks the spike pairing for
those slices, if the archives lack the raw soma and penumbra traces, or if the archive time
and the spike times are on different clocks. **Its outcome was not known when this was
written.** Find out before doing anything else.

## The first things to do with a real file

1. `npm run lab-validate -- "<kernel_lab folder>"`. Read every line. In particular:
   - **"dF/F0 recomputed from raw_soma vs dff_production"** is the first test of the
     JavaScript F0 port against MATLAB output. On the synthetic trace it matches haruspex's
     Python port bit for bit, and haruspex ADR-0007 records that the archive's stored F0
     differs from that port on 10 of 72 recordings through a rounding in MATLAB's seconds to
     frames conversion. So a small number of differing samples may be expected. Report the
     count and the largest difference; do not tune the port to make it zero.
   - "spikes outside the imaging time span" should be small. `if2_spikes` documents that
     negative times are events from before the imaging began.
2. Open the file in the page. Tony looks at it before any wider batch is exported, and
   before any conclusion is drawn from a plot.
3. Time how long a real file takes to load and to compute. Nothing larger than the 4-ROI,
   30-minute simulation has been loaded. A real file is about 75 MB.

## Where things are

| Path | What |
|---|---|
| `src/lib/lab/LabExtraction.svelte` | the page |
| `src/lib/lab/extraction.js` | the production steps, ported: penumbra subtraction, running-minimum F0, dF/F0, percentile filter; `buildVariants` |
| `src/lib/lab/compare.js` | windows, masking, and recovery of each variant through `core/` |
| `src/lib/lab/recording.js` | reader and checker for the `.klab.json` file |
| `src/lib/lab/verdicts.js` | the review log: line format, parsing, staleness |
| `src/lib/lab/simulate.js` | the simulated recording with a planted kernel |
| `src/lib/lab/lab.test.mjs`, `fixtures/f0-parity.json` | tests, and the F0 parity vectors |
| `vite.config.js` | serve-only endpoints `/__lab/raw-recordings`, `/__lab/raw-file`, `/__lab/raw-verdicts` |
| `scripts/lab-fixture.mjs`, `lab-validate.mjs`, `lab-shot.mjs`, `lab-make-f0-vectors.py` | fixture, validator, screenshots, parity vectors |
| `scripts/lab-check.sh` | the gate that proves none of this is in `dist/` |
| `src/lib/Plot.svelte` | two new optional props, `axisColor` and `gridColor`; null leaves every existing plot unchanged |
| `src/App.svelte` | the dynamic import behind `import.meta.env.DEV`, and the nav button |

## Rules that are easy to break

- **Never import anything under `src/lib/lab/` statically.** It still builds, still deploys,
  and ships the page. Run `npm run build && npm run lab-check` after any change to how the
  page is reached. `npm run deploy` runs the gate too.
- **Recovery goes through `core/` only.** The page adds no recovery code and must not.
- **`core/` changes can break the lab modules without `test:core` noticing.** Run `test:lab`.
- **No recording, and no file made from one, is committed.** `exports/` is gitignored; the
  Dropbox folder is outside the repository. The parity fixture is synthetic.
- **The dev server writes exactly one file**, `kernel_review.tsv` in the recordings folder,
  append only. Do not add a second write path or let anything rewrite that file.
- The build refuses a shallow clone; `git fetch --unshallow` if it complains.

## What the page shows

For one recording, one ROI and one window (whole recording or a region as marked):

- five extractions: soma with F0 held constant; soma dF/F0; soma minus k times penumbra with
  F0 held constant; the same as dF/F0; soma dF/F0 minus the 10th percentile over 5 s. A sixth
  appears when the file carries the producer's own dF/F0.
- the kernel from each, by the method chosen (free-vector, shaped, parametric), and the
  spike-triggered average, on the same lag axis (-5 to 5 s) and the same amplitude axis.
- a diagnostics table, downloadable as TSV with all three methods.
- raw soma, penumbra and F0; the extracted traces; spikes per frame.
- accept, reject or unsure with a note, saved per ROI and window.

Every block folds; the controls and the two lag panels fold sideways.

## Decisions Tony made on 2026-11-16

- Home is this repository, lab-only.
- Recordings go in a new Dropbox folder under the data root, every ROI exported. The name
  `kernel_lab` was proposed and not objected to. Revisit the size before senktide/TTX.
- Review verdicts go in a file beside the recordings.
- Spike detection and its integration with interface2 are cerebro's.

## Known gaps, in the order I would take them

1. **No real file has been read.** Everything else waits on this.
2. **Regions are used as marked.** The page does not apply the protocol windows of
   ADR-0035 (wash-in delay, 20-minute cap). `regionAnalysisWindow` in `core/load-xlsx.js`
   is the function to reuse. Ask Tony whether he wants the raw markers, the protocol
   windows, or both as choices.
3. **A verdict is per ROI and window**, not per extraction or method. Tony was told; he has
   not asked for more.
4. **No multi-recording view.** One recording at a time, previous and next buttons.
5. **Fold state and control settings reset on reload.**
6. **The public tabs draw black plot axes in dark mode.** The lab page does not, through the
   two new Plot props. Applying them to Tabs 1 to 3 changes the deployed app, so it needs
   Tony's word.
7. **`simulate.js` is a model with chosen numbers.** The simulation's results say the page
   works. They say nothing about the hypothesis.

## Before merging to `main`

`/murderboard` on the ADR and the contract; `npm run test:core`, `test:lab`, `build`,
`lab-check`; one real file opened and looked at by Tony. Merging does not deploy anything,
and a deploy of this branch would ship an unchanged public app.
