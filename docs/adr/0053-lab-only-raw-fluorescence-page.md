# ADR-0053: A lab-only page that recovers kernels from raw fluorescence

## Status

Accepted for the home and the gating (Tony, 2026-11-16: *"App should be lab only for now and
colonel is a good home"*). The file format it introduces is **Proposed**: no producer has
written a real file against it. Extends [ADR-0048](0048-dev-only-lab-mode.md). Changes nothing
in the shipped artifact, and `npm run lab-check` asserts that.

Not murderboarded. Nothing in this record has been run on a real recording.

## Context

The lab wants to test one hypothesis: that the processing between raw fluorescence and the
trace a kernel is recovered from removes part of the kernel. The app cannot ask that question
today. Its input contract ([ADR-0019](0019-tab2-input-contract-workbook-per-recording.md)) is dF/F0 only, so
by the time a trace reaches Tab 2 the processing has already happened, once, upstream.

Three things exist that make the question answerable:

- interface2 holds raw soma and penumbra fluorescence for every ROI, and the production chain
  from raw to dF/F0 is known function by function.
- cerebro now writes reviewed spike times as one checked file per cell, and interface2 has a
  reader that puts them on the imaging clock.
- This repository has the kernel recovery, and FOUNDATIONS holds that recovery goes through
  it and not through a second implementation.

FOUNDATIONS §2 keeps spike inference out of this app. This page does not infer spikes. It is
the same operation as Tab 2 (known spikes plus a trace gives a kernel) applied to several
versions of the trace.

## Decision

A second lab-only page, `#lab`, built the way ADR-0048 built the lab picker.

1. **Lab-only, by the same two gates.** `src/lib/lab/` is reached only through a dynamic
   import behind `import.meta.env.DEV` in `App.svelte`, and its files come from two more
   endpoints on the serve-only Vite plugin (`/__lab/raw-recordings`, `/__lab/raw-file`).
   `scripts/lab-check.sh` now also greps `dist/` for the page's component name, its
   endpoints, its file format name and a string only its extraction module carries.
2. **A separate file, not a change to the workbook.** Raw fluorescence arrives in
   `<slice_id>.klab.json`, specified in
   [`docs/lab-recording-contract.md`](../lab-recording-contract.md). The public contract and
   the `team_colonel_kernel` bus are untouched. The dev server lists the files in `exports/`,
   or in the folder named by `CK_LAB_RAW_DIR`.
3. **Extraction steps are ported, one function each, and can be withheld one at a time.**
   `src/lib/lab/extraction.js` ports the production chain: penumbra subtraction, the
   running-minimum F0, dF/F0, and the percentile drift filter applied before MLspike.
4. **The control is a frozen F0.** For each signal the page builds a pair: dF/F0 with the
   production F0, and the same signal with that F0 held at its window mean. The frozen member
   is raw fluorescence under one offset and one gain. The pair differs only in whether F0
   moves with time, which is the thing under test.
5. **Recovery is Tab 2's.** Every variant goes through `recoverRegion` (free-vector,
   parametric, STA) and `recoverKernelShaped`. The page adds no recovery code.
6. **Numbers are reported, never judged** (ADR-0011). The page draws the kernels on one lag
   axis and tabulates each variant's diagnostics. It gives no verdict on which extraction is
   right.
7. **A simulated recording stands in for data.** `src/lib/lab/simulate.js` writes a raw
   recording with a planted kernel, so the page and its tests run on a machine with no
   recordings. It is a model with chosen numbers, not a measurement.

## Consequences

**What exists.** The page, a reader and validator for the file, the ported extraction steps,
a simulated fixture, and `npm run test:lab` (39 checks). The F0 port agrees bit for bit with
haruspex's Python port on a synthetic trace; that Python port is the one haruspex checked
against the archive's stored F0 (haruspex ADR-0007). The percentile filter agrees with an
independent NumPy transcription of `prctfilt.m`.

**What does not.** No MATLAB exporter, so no real file. Nothing here has been compared with
MATLAB output directly, and nothing has been run on a recording. Review verdicts are not
recorded by the page: it downloads the diagnostics table as a file and keeps nothing.

**The public artifact is unchanged.** `npm run build` then `npm run lab-check` passes with the
new markers. Core tests are untouched (265 pass).

**Costs.** A second dev-only path that users never exercise, so it can rot unnoticed, as
ADR-0048 warned of the first. The lab modules import from `core/` but are not in its barrel,
so a core change can break them without `test:core` saying so; `test:lab` has to be run.

**The failure mode to watch** is the one ADR-0048 names: a static import of anything under
`src/lib/lab/` still builds and still deploys, and ships the page. The gate exists for that.

**What this does not decide.** Whether any of this becomes public; where lab recordings are
stored; how review verdicts are recorded; and whether the haruspex HDF5 export and this file
should come from one exporter. Each is listed in the contract's open points.
