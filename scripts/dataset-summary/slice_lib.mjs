// Shared slice-summary builder for the dataset-summary prototype (single-page CLI +
// batch PDF share this one code path). buildSlice(FILE) → the JSON object a page needs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorkbook, windowRegion, regionsOf, regionAnalysisWindow, regionType } from '../../src/lib/core/load-xlsx.js';
import { recoverRegion } from '../../src/lib/core/region-recovery.js';
import { recoverKernelShaped } from '../../src/lib/core/deconvolve-shaped.js';
import { rasterize } from '../../src/lib/core/rasterize.js';
import { nextPow2 } from '../../src/lib/core/deconvolve.js';

export const GOLDEN_DIR = '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/golden';
const TOPN = 4, WIN_S = 5;

// opts.regions (optional): [{name, startS, endS}] overriding the golden's metadata
// sheet — used to source corrected region timing straight from indiegroups_db4.
export function buildSlice(FILE, opts = {}) {
  const rec = loadWorkbook(readFileSync(join(GOLDEN_DIR, FILE)), { source: FILE });
  const id = FILE.replace('APs_xlsx_v1_', '').replace('.xlsx', '');
  const dt = rec.meta.dt, tEnd = rec.meta.tEnd;

  const shapedKernel = (view, col) => {
    const grid = view.grid, n = grid.n, N = nextPow2(n), ws = Math.round(WIN_S / grid.dt);
    const sd = rasterize(view.spikeTimes, grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
    const sdPad = new Float64Array(N); sdPad.set(sd.samples);
    const tr = view.rois[col].samples, tp = new Float64Array(N);
    for (let k = 0; k < n; k++) tp[k] = Number.isFinite(tr[k]) ? tr[k] : 0;
    const k = recoverKernelShaped(tp, sdPad, { windowSamples: ws, dt: grid.dt, fitLength: n });
    return { times: Array.from(k.times), samples: Array.from(k.samples) };
  };
  const screen = (rr) => {
    const { peakLagS, peakAmpAdj, acausalRatio } = rr.fv, dLag = rr.agreement.dLagFvS;
    return peakLagS >= -0.2 && peakLagS <= 1.5 && acausalRatio <= 0.5 &&
      Number.isFinite(dLag) && Math.abs(dLag) <= 0.5 && peakAmpAdj > 0;
  };
  const panelFor = (view, col) => {
    const rr = recoverRegion(view, { col, stability: false });
    const sh = shapedKernel(view, col);
    return {
      col, roi: rec.rois[col].id, decent: screen(rr),
      fv: { times: Array.from(rr.fv.kernel.times), y: Array.from(rr.fv.kernel.samples) },
      pm: { times: Array.from(rr.pm.kernel.times), y: Array.from(rr.pm.kernel.samples) },
      shaped: { times: sh.times, y: sh.samples },
      sta: { times: Array.from(rr.sta.times), y: Array.from(rr.sta.samples) },
      fvPeakLagS: rr.fv.peakLagS, fvAmpAdj: rr.fv.peakAmpAdj, pmPeakLagS: rr.pm.peakLagS,
      staPeakLagS: rr.agreement.staPeakLagS, acausalRatio: rr.fv.acausalRatio,
    };
  };
  const blockFor = (view, region) => {
    // distinguish a truly ABSENT region-type from one that EXISTS but is
    // non-analyzable (too few / zero spikes in the window) — no conclusions, just facts.
    if (!view) return { present: false, absent: true, region: region?.name ?? null };
    if (!view.analyzable) return { present: false, absent: false, region: region?.name ?? null, spikeCount: view.spikeCount ?? 0 };
    const ranked = [];
    for (let col = 0; col < rec.rois.length; col++) {
      let rr; try { rr = recoverRegion(view, { col, stability: false }); } catch { continue; }
      if (!rr.analyzable) continue;
      ranked.push({ col, decent: screen(rr), amp: rr.fv.peakAmpAdj });
    }
    ranked.sort((a, b) => (b.decent - a.decent) || (b.amp - a.amp));
    const has0 = ranked.some((r) => r.col === 0);
    const others = ranked.filter((r) => r.col !== 0).map((r) => r.col);
    const cols = has0 ? [0, ...others.slice(0, TOPN - 1)] : others.slice(0, TOPN);
    return {
      present: true, region: region.name, type: regionType(region.name),
      spikeCount: view.spikeCount, nDecent: ranked.filter((r) => r.decent).length,
      panels: cols.map((col) => panelFor(view, col)),
    };
  };

  const regionList = opts.regions ?? regionsOf(rec);
  const proto = regionList.map((r) => {
    const pw = regionAnalysisWindow(r);
    return { r, type: regionType(r.name), v: windowRegion(rec, r, { protocol: true }),
      winStart: pw.analyzable ? pw.winStart : r.startS, winEnd: pw.analyzable ? Math.min(pw.winEnd, tEnd) : Math.min(r.endS, tEnd),
      rawStart: r.startS, rawEnd: Math.min(r.endS, tEnd) };
  });
  // per type: prefer the analyzable region with the most spikes; else the fullest
  // non-analyzable one (so its spike count can be reported), else undefined (absent).
  const pick = (type) => {
    const all = proto.filter((p) => p.type === type);
    const bySpk = (a, b) => (b.v.spikeCount ?? 0) - (a.v.spikeCount ?? 0);
    return all.filter((p) => p.v.analyzable).sort(bySpk)[0] ?? [...all].sort(bySpk)[0];
  };
  const baseR = pick('baseline');
  const treatR = pick('treatment');
  const hikR = pick('hik');

  const decf = Math.max(1, Math.round(0.2 / dt));
  const t = [], y = [], roi1 = rec.rois[0].samples;
  for (let i = 0; i < rec.grid.times.length; i += decf) { t.push(rec.grid.times[i]); y.push(Number.isFinite(roi1[i]) ? roi1[i] : NaN); }
  const nb = Math.ceil(tEnd), bins = new Float64Array(nb);
  for (const s of rec.spikeTimes) { const b = Math.floor(s); if (b >= 0 && b < nb) bins[b]++; }

  return {
    id, dt, tEnd, nRoi: rec.rois.length,
    context: { t, y, binCenters: Array.from({ length: nb }, (_, i) => i + 0.5), binCounts: Array.from(bins),
      regions: proto.map((p) => ({ name: p.r.name, type: p.type, rawStart: p.rawStart, rawEnd: p.rawEnd, winStart: p.winStart, winEnd: p.winEnd })) },
    baseline: blockFor(baseR?.v, baseR?.r),
    treatment: blockFor(treatR?.v, treatR?.r),
    // hik is an optional 3rd block — shown only when it is analyzable
    hik: hikR && hikR.v.analyzable ? blockFor(hikR.v, hikR.r) : { present: false, absent: true, region: null },
  };
}
