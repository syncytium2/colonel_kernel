// In-app recording summary (Phase 1 of summaries & export).
//
// This is the browser port of the offline dataset-summary builder
// (scripts/dataset-summary/slice_lib.mjs → buildSlice). The ONLY difference is
// input: the script reads a workbook off disk (node:fs); here the caller hands
// in an already-loaded record (the same `loadWorkbook(...)` object Tab 2 already
// holds). Everything downstream — region windowing (ADR-0035), per-ROI recovery
// across all methods + STA, the plausibility screen, the context strip — is the
// shipped core, unchanged, so the in-app summary and the offline PDF agree by
// construction.
//
// A "summary" is: a context strip (ROI 1 calcium + 1 s-binned APs + region
// windows) over per-region blocks (baseline + treatment, hik if present), each
// block the top-4 kernel ROIs (ROI 1 pinned first) with free-vector /
// parametric / shaped kernels + STA. The plausibility ✓ is a SCREEN, not a
// verdict (ADR-0018 — the eye decides).

// NOTE — SheetJS code-split (FOUNDATIONS §6 / load-xlsx barrel note). The region
// helpers (windowRegion/regionsOf/regionAnalysisWindow/regionType) live in
// load-xlsx.js, which statically imports the ~338 KB SheetJS. Importing them here
// would pull SheetJS back into the main bundle. So they are DEPENDENCY-INJECTED
// via `opts.xlsx` — Tab 2 already holds them on its dynamically-imported `xlsxApi`
// handle by the time a summary is requested (an xlsx must be open). The rest
// (recoverRegion/recoverKernelShaped/rasterize/nextPow2) are SheetJS-free.
import { recoverRegion } from './region-recovery.js';
import { recoverKernelShaped } from './deconvolve-shaped.js';
import { rasterize } from './rasterize.js';
import { nextPow2 } from './deconvolve.js';

const TOPN = 4;
const DEFAULT_WIN_S = 5;

/**
 * Build the per-recording summary from an already-loaded record.
 * @param {object} rec a `loadWorkbook(...)` record: { rois, meta:{dt,tEnd}, grid, spikeTimes }
 * @param {{ xlsx: object, regions?: Array<{name,startS,endS}>, winS?: number, topN?: number }} opts
 *   xlsx — the load-xlsx module (Tab 2's `xlsxApi`), providing windowRegion,
 *     regionsOf, regionAnalysisWindow, regionType (injected to keep SheetJS code-split);
 *   regions — override the workbook's metadata sheet (e.g. corrected timing);
 *   winS — kernel half-window seconds (default 5); topN — ROIs per block (default 4).
 * @returns {object} { id, dt, tEnd, nRoi, context, baseline, treatment, hik }
 */
export function buildRecordingSummary(rec, opts = {}) {
  const { xlsx } = opts;
  if (!xlsx) throw new Error('buildRecordingSummary: opts.xlsx (load-xlsx module) is required');
  const { windowRegion, regionsOf, regionAnalysisWindow, regionType } = xlsx;
  const winS = opts.winS ?? DEFAULT_WIN_S;
  const topN = opts.topN ?? TOPN;
  const dt = rec.meta.dt;
  const tEnd = rec.meta.tEnd;
  const id = rec.meta.source || 'recording';

  // Shaped kernel (ADR-0021 method 3) — recoverRegion returns fv/pm/STA; the
  // shaped method is recovered here alongside so all four traces share a panel.
  const shapedKernel = (view, col) => {
    const grid = view.grid;
    const n = grid.n;
    const N = nextPow2(n);
    const ws = Math.round(winS / grid.dt);
    const sd = rasterize(view.spikeTimes, grid, {
      amplitudeMode: 'binned-count',
      preFirstBin: 'keep',
    });
    const sdPad = new Float64Array(N);
    sdPad.set(sd.samples);
    const tr = view.rois[col].samples;
    const tp = new Float64Array(N);
    for (let k = 0; k < n; k++) tp[k] = Number.isFinite(tr[k]) ? tr[k] : 0;
    const k = recoverKernelShaped(tp, sdPad, { windowSamples: ws, dt: grid.dt, fitLength: n });
    return { times: Array.from(k.times), samples: Array.from(k.samples) };
  };

  // Plausibility SCREEN (not a verdict, ADR-0018): a fast filter for "looks like
  // a real transient" so the top-4 ranking surfaces the promising ROIs first.
  const screen = (rr) => {
    const { peakLagS, peakAmpAdj, acausalRatio } = rr.fv;
    const dLag = rr.agreement.dLagFvS;
    return (
      peakLagS >= -0.2 &&
      peakLagS <= 1.5 &&
      acausalRatio <= 0.5 &&
      Number.isFinite(dLag) &&
      Math.abs(dLag) <= 0.5 &&
      peakAmpAdj > 0
    );
  };

  const panelFor = (view, col) => {
    const rr = recoverRegion(view, { col, stability: false });
    const sh = shapedKernel(view, col);
    return {
      col,
      roi: rec.rois[col].id,
      decent: screen(rr),
      fv: { times: Array.from(rr.fv.kernel.times), y: Array.from(rr.fv.kernel.samples) },
      pm: { times: Array.from(rr.pm.kernel.times), y: Array.from(rr.pm.kernel.samples) },
      shaped: { times: sh.times, y: sh.samples },
      sta: { times: Array.from(rr.sta.times), y: Array.from(rr.sta.samples) },
      fvPeakLagS: rr.fv.peakLagS,
      fvAmpAdj: rr.fv.peakAmpAdj,
      pmPeakLagS: rr.pm.peakLagS,
      staPeakLagS: rr.agreement.staPeakLagS,
      acausalRatio: rr.fv.acausalRatio,
    };
  };

  const blockFor = (view, region) => {
    // ABSENT (no such region-type) vs. EXISTS-but-non-analyzable (too few / zero
    // spikes) are different facts — report both, conclude neither.
    if (!view) return { present: false, absent: true, region: region?.name ?? null };
    if (!view.analyzable)
      return {
        present: false,
        absent: false,
        region: region?.name ?? null,
        spikeCount: view.spikeCount ?? 0,
      };
    const ranked = [];
    for (let col = 0; col < rec.rois.length; col++) {
      let rr;
      try {
        rr = recoverRegion(view, { col, stability: false });
      } catch {
        continue;
      }
      if (!rr.analyzable) continue;
      ranked.push({ col, decent: screen(rr), amp: rr.fv.peakAmpAdj });
    }
    ranked.sort((a, b) => b.decent - a.decent || b.amp - a.amp);
    const has0 = ranked.some((r) => r.col === 0);
    const others = ranked.filter((r) => r.col !== 0).map((r) => r.col);
    // ROI 1 (col 0) is the default targeted cell (FOUNDATIONS §4) — pin it first.
    const cols = has0 ? [0, ...others.slice(0, topN - 1)] : others.slice(0, topN);
    return {
      present: true,
      region: region.name,
      type: regionType(region.name),
      spikeCount: view.spikeCount,
      nDecent: ranked.filter((r) => r.decent).length,
      panels: cols.map((col) => panelFor(view, col)),
    };
  };

  const regionList = opts.regions ?? regionsOf(rec);
  const proto = regionList.map((r) => {
    const pw = regionAnalysisWindow(r);
    return {
      r,
      type: regionType(r.name),
      v: windowRegion(rec, r, { protocol: true }),
      winStart: pw.analyzable ? pw.winStart : r.startS,
      winEnd: pw.analyzable ? Math.min(pw.winEnd, tEnd) : Math.min(r.endS, tEnd),
      rawStart: r.startS,
      rawEnd: Math.min(r.endS, tEnd),
    };
  });

  // Per type: prefer the analyzable region with the most spikes; else the fullest
  // non-analyzable one (so its spike count can still be reported).
  const pick = (type) => {
    const all = proto.filter((p) => p.type === type);
    const bySpk = (a, b) => (b.v.spikeCount ?? 0) - (a.v.spikeCount ?? 0);
    return all.filter((p) => p.v.analyzable).sort(bySpk)[0] ?? [...all].sort(bySpk)[0];
  };
  const baseR = pick('baseline');
  const treatR = pick('treatment');
  const hikR = pick('hik');

  // Context strip: decimated ROI 1 trace + 1 s-binned APs + region windows.
  const decf = Math.max(1, Math.round(0.2 / dt));
  const t = [];
  const y = [];
  const roi1 = rec.rois[0].samples;
  for (let i = 0; i < rec.grid.times.length; i += decf) {
    t.push(rec.grid.times[i]);
    y.push(Number.isFinite(roi1[i]) ? roi1[i] : NaN);
  }
  const nb = Math.ceil(tEnd);
  const bins = new Float64Array(nb);
  for (const s of rec.spikeTimes) {
    const b = Math.floor(s);
    if (b >= 0 && b < nb) bins[b]++;
  }

  return {
    id,
    dt,
    tEnd,
    nRoi: rec.rois.length,
    context: {
      t,
      y,
      binCenters: Array.from({ length: nb }, (_, i) => i + 0.5),
      binCounts: Array.from(bins),
      regions: proto.map((p) => ({
        name: p.r.name,
        type: p.type,
        rawStart: p.rawStart,
        rawEnd: p.rawEnd,
        winStart: p.winStart,
        winEnd: p.winEnd,
      })),
    },
    baseline: blockFor(baseR?.v, baseR?.r),
    treatment: blockFor(treatR?.v, treatR?.r),
    // hik is an optional 3rd block — shown only when analyzable.
    hik: hikR && hikR.v.analyzable ? blockFor(hikR.v, hikR.r) : { present: false, absent: true, region: null },
  };
}

// Baseline-relative kernel (ADR-0017): subtract the [-0.5, 0) s pre-spike mean,
// matching the renderer's `prezero`. Pure helper shared by the report component.
export function preZero(times, y) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= -0.5 && times[i] < 0 && Number.isFinite(y[i])) {
      sum += y[i];
      count++;
    }
  }
  const m = count ? sum / count : 0;
  return y.map((v) => v - m);
}
