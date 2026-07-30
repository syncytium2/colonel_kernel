// Input-template generator — the "provided template workbook" ADR-0019 §5 named as a
// v1 deliverable and left TBD. Closes it.
//
// Two jobs in one artifact:
//   1. It documents the input contract by BEING it — correct sheet names, correct
//      headers, numeric cells (ADR-0019 §5 fidelity invariant), a real metadata
//      region table. A user pastes their own columns over the example rows.
//   2. It is a WORKING recording. Download it, drop it straight back into Tab 2, and
//      a kernel comes out. That is the quick start: the file a user is told to produce
//      is the same file they just watched succeed.
//
// The example trace is synthesized with the app's OWN core (rasterize → buildKernel →
// convolveOnGrid → addAWGN), not hand-rolled numbers, so the shape is physically
// consistent with what the tool claims to recover and stays correct if the kernel
// builders change. Seeded, so every download is byte-identical.
//
// NO SheetJS here — this module only emits plain arrays and text. It is still reached by
// dynamic import (see template-download.js) so it lands in its own chunk rather than the
// entry bundle; the .xlsx writer that consumes `templateSheets()` lives in
// make-template-xlsx.js, which carries SheetJS and follows the same rule load-xlsx.js
// establishes (FOUNDATIONS §6 code-split).

import { makeGrid } from './timebase.js';
import { rasterize } from './rasterize.js';
import { buildKernel } from './kernels.js';
import { convolveOnGrid } from './convolve.js';
import { addAWGN, mulberry32, SIGMA_COHORT_TYPICAL } from './noise.js';

// The example's shape lives in template-facts.js — a no-import module, so Tab 0 can
// quote the numbers in its copy without pulling this generator (and the whole
// convolution core) into the initial bundle. This module is the only place they are
// used, so the copy on screen and the bytes in the file cannot disagree.
import {
  RATE_HZ,
  DURATION_S,
  SPLIT_S,
  REGIONS,
  TRUE_KERNEL,
  TRUE_PEAK,
  ROI2_GAIN,
  ROI_COUNT,
  SEED,
} from './template-facts.js';

// Deliberately small (2 min at 10 Hz = 1200 frames) so the download is quick to open in
// Excel and quick to load. Real recordings run far longer; the copy says so.
const NOISE_SIGMA = SIGMA_COHORT_TYPICAL; // cohort-typical baseline σ (ADR-0015)

/** Poisson spike times in [fromS, toS) at `rateHz`, drawn from `rand`. */
function poisson(rand, rateHz, fromS, toS) {
  const out = [];
  let t = fromS;
  for (let guard = 0; guard < 100000; guard++) {
    t += -Math.log(1 - rand()) / rateHz;
    if (t >= toS) break;
    out.push(t);
  }
  return out;
}

/**
 * The example recording, synthesized from core. Deterministic.
 * @returns {{times:number[], spikes:number[], roi1:number[], roi2:number[],
 *            regions:{name:string,startS:number,endS:number}[], dt:number}}
 */
export function buildTemplateRecording() {
  const rand = mulberry32(SEED);
  const grid = makeGrid({ sampleRate: RATE_HZ, duration: DURATION_S });

  // High K⁺ depolarizes the cell, so it fires faster in the second half. The example
  // carries that asymmetry on purpose — it gives the two regions something to differ by.
  const spikes = [...poisson(rand, 0.25, 0, SPLIT_S), ...poisson(rand, 0.55, SPLIT_S, DURATION_S)];

  const raster = rasterize(spikes, grid);
  const kernel = buildKernel('calcium', TRUE_KERNEL, grid.dt, TRUE_PEAK);
  const clean = convolveOnGrid(raster.samples, grid, kernel).samples;

  const kernel2 = buildKernel('calcium', TRUE_KERNEL, grid.dt, TRUE_PEAK * ROI2_GAIN);
  const clean2 = convolveOnGrid(raster.samples, grid, kernel2).samples;

  // Independent noise realizations — two ROIs are two measurements, not one twice.
  const noisy1 = addAWGN(clean, NOISE_SIGMA, mulberry32(SEED + 1));
  const noisy2 = addAWGN(clean2, NOISE_SIGMA, mulberry32(SEED + 2));

  const n = grid.n;
  const times = new Array(n);
  const roi1 = new Array(n);
  const roi2 = new Array(n);
  for (let i = 0; i < n; i++) {
    // Round at emit time: 4 dp on a 0.1 s grid keeps `time` strictly increasing with
    // ~3 orders of magnitude to spare, and keeps the file small enough to open.
    times[i] = round(grid.times[i], 4);
    roi1[i] = round(noisy1[i], 6);
    roi2[i] = round(noisy2[i], 6);
  }

  return {
    times,
    spikes: spikes.map((t) => round(t, 4)),
    roi1,
    roi2,
    regions: REGIONS.map((r) => ({ ...r })),
    dt: grid.dt,
  };
}

function round(v, dp) {
  if (!Number.isFinite(v)) return NaN;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// --- xlsx sheet data (ADR-0019) ---------------------------------------------

/**
 * The four sheets of the template workbook, as arrays-of-arrays.
 *
 * Numeric cells are emitted as JS **numbers**, never strings — ADR-0019 §5 makes
 * numeric fidelity an invariant, and the template is the mechanism §5 names for
 * enforcing it on the field/new-user path.
 *
 * `instructions` is an extra sheet: load-xlsx.js looks up trace/spikes/metadata BY NAME
 * and never enumerates the workbook's sheet list, so unknown sheets are ignored. That
 * lets the format documentation travel inside the file, where someone editing it in
 * Excel will actually see it.
 *
 * @returns {{instructions:any[][], trace:any[][], spikes:any[][], metadata:any[][]}}
 */
export function templateSheets() {
  const rec = buildTemplateRecording();

  const trace = [['time', 'roi1', 'roi2']];
  for (let i = 0; i < rec.times.length; i++) trace.push([rec.times[i], rec.roi1[i], rec.roi2[i]]);

  const spikes = [['spikes'], ...rec.spikes.map((t) => [t])];

  const metadata = [
    ['region', 'start_s', 'end_s', 'note'],
    ...rec.regions.map((r) => [r.name, r.startS, r.endS, 'example region — replace with your own']),
  ];

  return { instructions: instructionSheet(rec), trace, spikes, metadata };
}

function instructionSheet(rec) {
  return [
    ['Colonel Kernel — recording template'],
    [],
    ['This workbook is BOTH a template and a working example.'],
    ['Drop it into Tab 2 as-is to see a kernel recovered, then paste your own data over it.'],
    [],
    ['THE THREE SHEETS'],
    ['trace', 'REQUIRED. Column "time" (seconds) + one column per ROI. One row per frame.'],
    ['', 'time is seconds from the start of the recording and must strictly increase.'],
    ['', 'Do not store the frame interval — the app derives it. Whichever ROI column comes'],
    ['', 'FIRST positionally is treated as the targeted cell, whatever its header says.'],
    ['spikes', 'REQUIRED. One column, header must be exactly "spikes". Action-potential times'],
    ['', 'in seconds, on the SAME clock as trace.time. Any length — it does not have to'],
    ['', 'match the frame count, and must never be padded to match it.'],
    ['metadata', 'OPTIONAL. One row per region: region, start_s, end_s (seconds).'],
    ['', 'Regions must not overlap. Gaps between them are fine. Leave this sheet out and'],
    ['', 'the whole recording is analyzed as one region.'],
    [],
    ['RULES THAT WILL BITE YOU'],
    ['Numbers', 'Every data cell must be a NUMBER. Anything the spreadsheet cannot give as a'],
    ['', 'number — units in the cell, stray text, a locale decimal comma — reads as missing.'],
    ['', 'A missing sample should be an EMPTY cell, never a zero.'],
    ['Clock', 'trace.time, spikes and start_s/end_s all share one zero-based clock.'],
    ['Region names', 'The name selects how the region is windowed. A name containing "baseline"'],
    ['', 'analyzes the LAST 20 MINUTES of the period; "high K" or "hiK" uses the whole'],
    ['', 'period; ANY OTHER name is treated as a drug wash-in — first 2 minutes dropped,'],
    ['', 'then up to 20 minutes analyzed. Under 12 minutes is flagged but still analyzed.'],
    ['', 'All three numbers are adjustable in Tab 2. Matching ignores case and punctuation.'],
    ['Sheet names', 'Matched case-insensitively, so "Trace" and "trace" both work.'],
    [],
    ['ABOUT THE EXAMPLE DATA IN THIS FILE'],
    ['', `Synthetic, not a real recording. ${rec.times.length} frames at ${RATE_HZ} Hz (${DURATION_S} s), ${rec.spikes.length} spikes, ${ROI_COUNT} ROIs.`],
    ['', `roi1 = the spikes convolved with a calcium kernel (tau_rise ${TRUE_KERNEL.tauRise} s,`],
    ['', `tau_decay ${TRUE_KERNEL.tauDecay} s, peak ${TRUE_PEAK} dF/F0) plus noise at sigma ${NOISE_SIGMA}.`],
    ['', 'roi2 is the same cell driven more weakly. Those are the numbers Tab 2 should recover.'],
    ['', 'The two regions are 60 s each. Real protocol regions run for tens of minutes, so'],
    ['', 'the app will flag these as short — that flag is the app reporting, not an error.'],
  ];
}

// --- CSV fallback (ADR-0016 single-rectangle layout) --------------------------

/**
 * The template as one CSV: `time, spikes, roi1, roi2`, spikes ragged with blanks below
 * the last one. This is the layout `loadCsv` implements (ADR-0016) — the field-user
 * fallback of ADR-0019 §6, for anyone without Excel.
 *
 * The CSV path carries NO region table (loadCsv has nowhere to put one), so a CSV is
 * always analyzed as a single region. That is the real reason to prefer the workbook,
 * and the UI says so rather than presenting the two as equivalent.
 *
 * @returns {string}
 */
export function templateCsvText() {
  const rec = buildTemplateRecording();
  const rows = ['time,spikes,roi1,roi2'];
  for (let i = 0; i < rec.times.length; i++) {
    const sp = i < rec.spikes.length ? rec.spikes[i] : '';
    rows.push(`${rec.times[i]},${sp},${rec.roi1[i]},${rec.roi2[i]}`);
  }
  return rows.join('\n') + '\n';
}
