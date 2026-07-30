# ADR-0038: The input template is a working example recording, generated in-browser

## Status

**Accepted.** Discharges the deliverable [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md)
§5 reserved as "a **provided template workbook** with columns pre-typed numeric … a
**separate v1 deliverable — reserved / TBD**". ADR-0019's **xlsx** contract is unchanged;
this records how the template realizing it is built and why. Its **§6 CSV** contract turns
out never to have been implemented — a divergence found while building the template and
recorded in §4, not resolved here.

## Context

The app had no answer, anywhere in its UI, to "what file do I need?" Tab 2 accepted a
drop and named two extensions; the schema lived only in ADR-0016 and ADR-0019, which a
visitor has never read. A researcher arriving with a trace and a spike list had to
reverse-engineer the format from a dropzone label or give up.

The tool's entire premise (FOUNDATIONS §3–4) is that it measures the spike→calcium
relationship on **your** recording. A tool whose input format exists only in its ADRs is,
for everyone except its author, a demonstrator rather than an instrument.

Two constraints shape the answer:

- **FOUNDATIONS §6** — no backend and no egress, so any template must be produced on the
  client or shipped as a same-origin static asset. Nothing is uploaded to make one.
- **Repo hygiene (CLAUDE.md)** — derived binaries do not get committed. A checked-in
  `.xlsx` would be a tracked binary that silently rots as the contract moves.

## Decision

### 1. The template is a WORKING recording, not an empty skeleton

The workbook ships ~2 minutes of synthetic data (1200 frames at 10 Hz, two ROIs, 50
spikes, two regions) rather than headers over blank rows. Download it, drop it straight
back into Tab 2, and a kernel comes out.

The reasoning is about the order of risk. With a skeleton, a user's first load is also
their first attempt at the format, on their own data, with no way to separate a bad file
from a bad recording. With a working example, the format is observed succeeding first,
and only then does the user paste their columns over the example rows — so a subsequent
failure is more likely attributable to their edit than to the format.

**⚠ This is a design argument, not a measured result.** No user has been observed using
either version; the claim that it reduces failed first loads is a hypothesis, and the
honest test is watching someone who is not Tony load their own recording.

It also gives the app a demo path that exercises the **real** ingest (regions, multiple
ROIs, the metadata sheet), which the Tab 1 → Tab 2 handoff
([ADR-0034](0034-tab1-tab2-handoff.md)) cannot: the handoff is a single-region CSV and
never shows the region machinery.

### 2. The example is synthesized from core, seeded

`src/lib/core/make-template.js` builds the trace with the app's own primitives —
`rasterize` → `buildKernel` → `convolveOnGrid` → `addAWGN` — rather than carrying a
literal table of numbers. So the example is physically consistent with what the tool
claims to recover. If the kernel builders change, the example changes with them rather
than becoming a stale table — though `TRUE_KERNEL` in `template-facts.js` is hard-coded,
so the ground-truth values would still need review. `roi1` is the targeted cell; `roi2` is
the same cell driven at 0.45× — a second measurement with its own independent noise
realization, not a copy.

Ground truth: `calcium` kernel, `tau_rise` 0.15 s, `tau_decay` 0.5 s, peak 0.1 dF/F₀,
noise at `SIGMA_COHORT_TYPICAL` (0.0024, [ADR-0015](0015-harness-noise-model.md)). The
seed is fixed, so the trace is reproducible and the download is byte-identical in
practice — 155,413 bytes .xlsx / 29,333 bytes .csv **as of SheetJS 0.20.3**. No test
asserts byte-identity, and a SheetJS bump ([ADR-0036](0036-sheetjs-install-from-maintained-tarball.md)
makes those deliberate) will move the .xlsx figure without changing the data.

Where the constants come from, so none of them is a bare magic number:

| constant | value | why |
|---|---|---|
| rate | 10 Hz | the frame rate of the real cohort, and Tab 1's default |
| duration | 120 s | small enough to open in Excel and load instantly; the smallest length that still fits two regions with enough spikes each to be analyzable |
| `tau_rise` / `tau_decay` | 0.15 s / 0.5 s | mid-range of the sliders Tab 1 and the challenges already offer |
| peak | 0.1 dF/F₀ | Tab 1's default `kernelAmp` ([ADR-0032](0032-tab1-kernel-amplitude-control.md)), chosen there so cohort-typical σ actually bites |
| σ | 0.0024 | cohort-typical baseline σ, measured across 39 recordings (ADR-0015) |
| `roi2` gain | 0.45 | arbitrary within "clearly weaker but clearly present" — its only job is to make `roi2` a distinguishable second cell rather than a copy of `roi1` |
| region split | 60 s | halves the recording, giving each region enough spikes to be analyzable |
| ROI count | 2 | the minimum that demonstrates multi-ROI at all (FOUNDATIONS §4) |
| spike rate, baseline | 0.25 Hz | arbitrary within "sparse enough that individual transients are visible at 10 Hz" |
| spike rate, high K⁺ | 0.55 Hz | ~2× baseline. Only the *ratio* carries meaning — it encodes the one piece of physiology the example asserts, that high K⁺ depolarizes the cell so it fires faster, which is what gives the two regions something to differ by. The value itself is arbitrary |
| seed | 20260730 | the date; any fixed value works, the requirement is only that it never changes |

The two spike rates are the one pair still living as literals in `make-template.js` rather
than in `template-facts.js`; moving them is an open item below.

**No real data.** The template is synthetic by construction, so it is not an
unpublished-data artifact and none of the [ADR-0018](0018-figure-gate-policy.md) /
`docs/img/README.txt` consent machinery applies to it.

### 3. Region names are chosen to survive protocol windowing

This is the trap that bites first and most silently, and the template is where it bites.
[ADR-0035](0035-region-protocol-windowing.md) derives each region's analysis window from
its **name**. `regionType()` lowercases the name and strips every non-alphanumeric
character, then substring-matches: a name containing `baseline` is a baseline, one
containing `hik` or `highk` is high-K⁺ (which is why `high K+` matches), and **anything
else** classifies as a **treatment** and has `SOLUTION_DELAY_S` (120 s) trimmed off its
front. At the template's
60-second regions no window survives that trim. The region is not silently dropped —
`windowRegion` returns it non-analyzable with a reason ("region 'X' is shorter than the
2.0-min solution delay"), which is ADR-0019 §7 behaving correctly. The problem is that
**nothing connects that reason back to the region's *name***, so the user is told their
region is too short when what actually happened is that a naming convention they have
never read reclassified it. A template that shipped that experience would manufacture
exactly the confusion it exists to prevent.

So the two example regions are `baseline` (0–60 s) and `high K+` (60–120 s). `baseline`
takes its window from the **end** of the region backwards, so even a short one still yields
a window; `high K+` is used whole. Both survive. `template-acceptance` asserts they stay
analyzable, so the names cannot drift back into the trap.

The short **baseline** is flagged — `baseline shorter than 12 min (1.0 min)`; `high K+` is
taken unwindowed and is not flagged at all. That flag is kept deliberately and explained in
the template's own instructions sheet: it is the report-don't-gate posture of
[ADR-0011](0011-validation-gates-machinery-not-fit.md) / ADR-0019 §7 behaving correctly,
and a user should meet it in a safe place rather than first on their own data.

### 4. The CSV variant targets ADR-0016's layout, because that is what the app reads

ADR-0019 §6 specifies the CSV fallback as **two files** — a trace CSV and a spikes CSV,
paired in the UI. **That was never implemented.** `loadCsv` reads a single rectangle with
`time`, `spikes` and one-or-more ROI columns in one header row (ADR-0016's layout), and
`handleFiles` takes `fileList[0]` only — there is no pairing UI anywhere in `Tab2.svelte`.

The template targets the implemented layout, because a template that matched the ADR would
simply not load — precisely the failure this deliverable exists to prevent. **This ADR
records the divergence rather than resolving it**: whether to build the two-file path or
amend ADR-0019 §6 to ratify the single rectangle is left open (see Open items). ADR-0019's
xlsx contract — the primary path, and the one Tony's own data uses — is unaffected.

One precision, because it is the elision that makes FOUNDATIONS §10 item 6 look settled
when it is not: the template borrows ADR-0016's **column layout** (`time`, ragged `spikes`,
`roi1..roiN`) but not its **granularity**. ADR-0016 was one CSV *per region*; the template
is one file over the whole recording. A CSV carries no region table at all, so region
granularity is simply not expressible on this path — every CSV is analyzed as a single
region. The UI says so rather than presenting the two formats as equivalent.

### 5. Generated in-browser at download time, not shipped as a static asset

Both files are built in-page and handed to a same-origin `blob:` download. Nothing is
uploaded, and nothing is committed.

The SheetJS writer lives in `core/make-template-xlsx.js` behind a dynamic import,
following the rule `core/load-xlsx.js` already establishes: **modules that carry SheetJS
are reachable only by dynamic import**, so the library never lands in the entry bundle.
That is where the real saving is. The CSV generator is dynamically imported too, for
symmetry — one shape for both download paths — but the saving there is only the 3.49 kB
generator chunk, **not** the convolution core it uses: Tab 1 statically imports
`rasterize` / `buildKernel` / `convolveOnGrid` / `addAWGN` (`App.svelte`), so every
visitor already has the core on first paint regardless.

Tab 0's copy reads its numbers from `core/template-facts.js`, the same module the
generator reads, so the screen and the file cannot disagree. That module has no imports,
so quoting them costs the initial load nothing.

**Rejected: pre-generating the file as a build-time static asset.** It would be smaller
(see Consequences) and cacheable, but it adds a build step whose output can silently
diverge from the loaders, and it puts a generated binary in the deploy path. In-browser
generation keeps one source of truth with core. If the lazy-chunk cost below ever matters,
generating into `dist/` from a Vite plugin — the same mechanism
[ADR-0008](0008-csp-build-time-injection.md) uses for the CSP — is the way to do it
without committing a binary.

### 6. The template's own instructions travel inside it

The reader looks up only `trace` / `spikes` / `metadata` **by name** and never enumerates
the workbook's sheet list, so unknown sheets are ignored. The workbook therefore carries a
fourth `instructions` sheet, written first so Excel opens on it.

The point is that the workbook is the only artifact that survives the app: it gets emailed
to a collaborator, opened months later, edited on a machine that never loads Tab 0. The
format documentation has to travel with it.

**⚠ That prose is hand-written, not derived from the loaders** — it describes the sheet
names, the numeric-cell rule and ADR-0035's naming behaviour in English. Nothing checks it
against the code, so it can go stale exactly the way §5's rejected static asset could. The
acceptance run verifies that the *data* round-trips, never that the *instructions* still
describe the reader.

### 7. It is guarded by an acceptance run

A template is the one artifact whose contract is enforced by nothing else. Nobody files a
bug against a broken template — they conclude the tool does not work and leave. So it gets
a run that treats it as what it is: an input file.

`npm run template-acceptance` (`src/lib/core/template-acceptance.mjs`) generates both
files and loads them back through the **real** `loadCsv` / `loadWorkbook`. The xlsx path is
then windowed with `protocol: true` exactly as Tab 2 does, and a kernel recovered from each
region and checked against the values built in. (The CSV path is checked for parse and
shape only — it has no regions to window.) It sits outside `npm run test:core` for the same
reason `xlsx-acceptance.mjs` does — these are end-to-end round-trips, not unit tests — and
what distinguishes it from `xlsx-acceptance.mjs` is that it needs **no golden data**: it
touches no unpublished recording and runs on any checkout, with no `GOLDEN_DIR`.

It also **pins the counts this ADR publishes** (50 spikes; 11 baseline / 39 high K⁺). Those
are emergent properties of the seeded Poisson draw, not constants, so without the pin a
seed or rate change would silently falsify this document.

Current result: both regions analyzable, with the recovered peak checked against the
0.1 dF/F₀ built in. Recovery is **method 1, free-vector**
([ADR-0004](0004-tab2-deconvolution-method.md)/[ADR-0021](0021-kernel-recovery-three-parallel-methods.md))
on binned-count density at Tab 2's own defaults — λ = 0.002 and a ±5 s half-window. Column
definitions: **recovered peak** is the largest sample of the recovered kernel vector, for
`roi1` only (`roi2` is loaded and windowed but never recovered); **peak lag** is that
sample's lag relative to zero.

| region | spikes | peak lag | recovered peak (`roi1`) |
|---|---|---|---|
| `baseline` | 11 | 0.30 s | 0.0997 dF/F₀ |
| `high K+` | 39 | 0.30 s | 0.0841 dF/F₀ |

The two peak lags agreeing is **quantization, not replication**: at 10 Hz the lag
resolution is one frame, and the true kernel's analytic peak,
ln(τ_d/τ_r)/(1/τ_r − 1/τ_d) ≈ 0.258 s, simply rounds to the 0.30 s sample either way.

**⚠ Read this table as a regression tripwire, not as a recovery benchmark.** It is one run
of one fixed seed on data generated by the very model being recovered — an inverse-crime
setup where the forward model is exactly right and additive noise is the only nuisance.
Real recordings have drift, decoupling, saturation and a kernel that is not literally a
double exponential, and will not recover this cleanly. Both guards — peak lag in [0, 1.0] s
and peak within ±2× of 0.1 dF/F₀ — are deliberately loose and calibrated against nothing:
they are sized to catch a broken generator or a broken loader, not to bound recovery error.
The instruments that judge recovery quality are the §3 checks and the human eye
([ADR-0011](0011-validation-gates-machinery-not-fit.md) /
[ADR-0018](0018-figure-gate-policy.md)), not this table.

## Consequences

All byte figures below are from the Vite build report: **raw** = uncompressed, **gzip** =
transfer size.

- **ADR-0019 §5's reserved deliverable is discharged.** Its numeric-fidelity invariant is
  now enforced by construction on the path a new user takes: `templateSheets()` emits JS
  **numbers**, and `aoa_to_sheet` writes them as numeric cells.
- **Initial load grows by 14.61 kB raw / 4.38 kB gzip.** "Initial load" = the two files
  every visitor fetches on first paint, `dist/assets/index-*.js` + `dist/assets/index-*.css`:
  306.17 → 320.78 kB raw, 98.87 → 103.25 kB gzip. That is the Tab 0 section and the Tab 2
  copy — UI that renders on the landing tab, and it bundles a CSS change with the JS one.
  It is **not** the generator, which is code-split into its own chunks
  (`make-template` 3.49 kB + `make-template-xlsx` 0.46 kB), off the initial path entirely.
- **The lazy xlsx chunk — the dynamically-imported bundle carrying SheetJS (`load-xlsx` +
  `make-template-xlsx`) — grows by 117.51 kB** (369.80 → 487.31 kB). Cause: SheetJS's
  **writer** is now reachable, where previously only the reader was and the writer was
  tree-shaken away. Paid **only** by users who load a workbook or download the template —
  who were already fetching 369.80 kB — and never on first paint. This is the price of
  §5's "one source of truth with core" and is the number to revisit if it ever matters.
- **A demo path through the real ingest now exists**, independent of the Tab 1 handoff.
- **The region-naming trap is load-bearing on a test someone has to run.** Renaming the
  example regions fails the acceptance run rather than silently shipping a non-analyzable
  template — but that run is out of `test:core` by design (§7) and there is **no CI in this
  repo** (`.github/workflows/` carries only dependency freshness). So the guard is a
  convention, not an enforcement. Wiring it into `scripts/deploy.sh`, which already gates on
  the test suite, is the obvious fix and is left open.
- **Tab 2 had no keyboard path to load a file at all** — the dropzone carried
  `role="button" tabindex="0"` with no key handler and the `<input type="file">` was
  `display: none`. Fixed in the same pass: false role removed, input clipped rather than
  hidden, visible `:focus-within` ring. It belongs in this ADR only because adding
  explanatory copy to that panel made the mis-labelling concrete — assistive tech was
  announcing the whole panel, spec paragraph included, as one button name.
- **Verified against the built artifact** under the real CSP (`connect-src 'none';
  default-src 'self'`), per FOUNDATIONS §6: all **six** download buttons fire — two in the
  Tab 0 section, two on the Tab 2 dropzone, two in the Tab 2 rail fold — with **no
  third-party requests** and no console errors on those views. 217/217 core tests plus the
  acceptance run above.
  ⚠ That browser verification was a scripted Playwright session against `npm run preview`;
  it leaves no artifact in-tree, so unlike everything else here it is not reproducible from
  the repo alone. The loader round-trip, by contrast, **is** — `npm run template-acceptance`.

## Open items (deliberately not resolved here)

- **The CSV path divergence (§4).** Build ADR-0019 §6's two-file paired path, or amend
  §6 to ratify the single rectangle the app implements. Not urgent — the xlsx path is
  primary and is what real data uses — but the ADR and the code should stop disagreeing.
- **Recording-level metadata** stays as ADR-0019 left it (reserved, v1.1). The template
  documents only the region table.
- **The acceptance run is not wired into any gate.** `scripts/deploy.sh` already runs the
  test suite; adding `template-acceptance` there would make the guard real.
- **The two spike rates are still literals** in `make-template.js` rather than
  `template-facts.js`, so they sit outside the single-source-of-truth §5 claims.
- **The instructions sheet is unchecked prose** (§6). Deriving even the sheet names from
  the loader would remove one way for it to rot.

## References

- [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) §5 (the reserved
  deliverable), §6 (the CSV path this diverges from), §7 (report-don't-gate).
- [ADR-0016](0016-csv-input-layout.md) — the single-rectangle CSV layout the app reads.
- [ADR-0035](0035-region-protocol-windowing.md) — the name-driven windowing §3 designs around.
- [ADR-0015](0015-harness-noise-model.md) — the σ the example's noise uses.
- [ADR-0036](0036-sheetjs-install-from-maintained-tarball.md) — the SheetJS the writer comes from.
- [ADR-0008](0008-csp-build-time-injection.md) — the build-time mechanism §5 names as the alternative.
- FOUNDATIONS §5 (input format), §6 (privacy / no egress).
