// CSV ingestion (ADR-0016): parse one region's exported CSV into the in-memory
// signal contract the app runs on. The consuming side of scripts/mat2csv.py.
//
// Input schema (ADR-0016): one CSV per region, with columns
//   time            dense frame timebase (s), authoritative (ADR-0012)
//   spikes          sparse AP event times (s); SHORTER than the dense columns,
//                   blank below the last spike (ragged)
//   roi1..roiN      dF/F₀ traces, dense; roi1 is the default targeted cell (§4)
//
// Output: a loaded-mode grid (ADR-0002 global timebase, locked from the time
// column) + per-ROI trace samples on that grid + the spike event list that feeds
// binned-count rasterization (ADR-0001). Traces share the one grid (ADR-0002), so
// they are returned as plain sample arrays rather than duplicating the times axis.
//
// Machinery is gated (FOUNDATIONS §3): a malformed time column (non-finite,
// non-increasing, too short) or a missing roi column is a hard error. Fit-quality
// concerns are never gated here.

import Papa from 'papaparse';
import { gridFromTimeColumn } from './timebase.js';

/**
 * @typedef {Object} LoadedRoi
 * @property {string} id     column header (e.g. 'roi1')
 * @property {Float64Array} samples  dense trace on the grid, length grid.n (NaN allowed)
 */

/**
 * @typedef {Object} LoadedRegion
 * @property {import('./timebase.js').Grid} grid  loaded-mode grid from the time column
 * @property {Float64Array} spikeTimes  finite spike event times (seconds), ascending
 * @property {LoadedRoi[]} rois         one per roi column, in file order (rois[0] = targeted)
 * @property {{ source: string|null, nFrames: number, nROIs: number, nSpikes: number, dt: number, t0: number, tEnd: number }} meta
 * @property {string[]} warnings        non-fatal notes (fit/representation, never machinery)
 */

/** Parse a numeric cell; blank / 'NaN' / non-numeric → NaN. */
function toNum(s) {
  if (s == null) return NaN;
  const t = String(s).trim();
  if (t === '') return NaN;
  return Number(t);
}

/**
 * Load one region's CSV (ADR-0016 schema) into the signal contract.
 * @param {string} text raw CSV text
 * @param {{ source?: string|null }} [opts]
 * @returns {LoadedRegion}
 */
export function loadCsv(text, { source = null } = {}) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' });
  const rawFields = parsed.meta.fields || [];
  if (rawFields.length === 0) throw new Error('CSV has no header row');

  // Map each header to its role by trimmed, case-insensitive name; keep the raw
  // key (papaparse rows are keyed by the original header).
  let timeKey = null;
  let spikesKey = null;
  const roiKeys = [];
  for (const raw of rawFields) {
    const role = raw.trim().toLowerCase();
    if (role === 'time') timeKey = raw;
    else if (role === 'spikes') spikesKey = raw;
    else roiKeys.push(raw);
  }
  if (timeKey == null) throw new Error("CSV missing required 'time' column");
  if (roiKeys.length === 0) throw new Error('CSV has no roi (trace) columns');

  const rows = parsed.data;
  const nRows = rows.length;
  if (nRows < 2) throw new Error(`CSV needs at least 2 data rows (got ${nRows})`);

  // --- time column: machinery-gated (finite, strictly increasing) ---
  const time = new Float64Array(nRows);
  for (let i = 0; i < nRows; i++) {
    const t = toNum(rows[i][timeKey]);
    if (!Number.isFinite(t)) throw new Error(`non-finite time at data row ${i + 1}`);
    if (i > 0 && t <= time[i - 1]) {
      throw new Error(`time must be strictly increasing (row ${i + 1}: ${t} ≤ ${time[i - 1]})`);
    }
    time[i] = t;
  }
  const grid = gridFromTimeColumn(time); // loaded mode (ADR-0002), dt = mean(diff)

  // --- roi traces: dense, NaN allowed (ADR-0016) ---
  const rois = roiKeys.map((key) => {
    const samples = new Float64Array(nRows);
    for (let i = 0; i < nRows; i++) samples[i] = toNum(rows[i][key]);
    return { id: key.trim(), samples };
  });

  // --- spikes: sparse, ragged; collect finite values, ascending ---
  const spikes = [];
  if (spikesKey != null) {
    for (let i = 0; i < nRows; i++) {
      const v = toNum(rows[i][spikesKey]);
      if (Number.isFinite(v)) spikes.push(v);
    }
    spikes.sort((a, b) => a - b);
  }
  const spikeTimes = Float64Array.from(spikes);

  // --- non-fatal warnings (representation/fit, never machinery) ---
  const warnings = [];
  const t0 = time[0];
  const tEnd = time[nRows - 1];
  const outOfRange = spikeTimes.reduce((n, t) => n + (t < t0 || t >= tEnd ? 1 : 0), 0);
  if (outOfRange > 0) {
    warnings.push(
      `${outOfRange} spike(s) fall outside the time window [${t0}, ${tEnd}) and will be dropped on rasterization`,
    );
  }
  const nanRois = rois.filter((r) => r.samples.some((v) => !Number.isFinite(v))).map((r) => r.id);
  if (nanRois.length > 0) warnings.push(`roi column(s) with non-finite samples: ${nanRois.join(', ')}`);
  let maxJitter = 0;
  for (let i = 1; i < nRows; i++) maxJitter = Math.max(maxJitter, Math.abs(time[i] - time[i - 1] - grid.dt));
  if (maxJitter > 0.5 * grid.dt) {
    warnings.push(
      `irregular frame timing (max jitter ${maxJitter.toExponential(2)}s vs dt ${grid.dt}); times are authoritative (ADR-0012)`,
    );
  }

  return {
    grid,
    spikeTimes,
    rois,
    meta: { source, nFrames: nRows, nROIs: rois.length, nSpikes: spikeTimes.length, dt: grid.dt, t0, tEnd },
    warnings,
  };
}
