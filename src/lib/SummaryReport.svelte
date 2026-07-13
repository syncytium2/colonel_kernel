<script>
  // Per-recording summary report (Phase 1 of summaries & export).
  //
  // Renders the same page the offline matplotlib pipeline produces
  // (scripts/dataset-summary/fig_slice_page2.py), but in-app and as inline SVG so
  // it prints CRISP (vector) via the browser's "Save as PDF" — no canvas raster,
  // no PDF dependency, no network (FOUNDATIONS §6). Layout: a context strip
  // (ROI 1 calcium + 1 s-binned APs + region windows) over per-region blocks of
  // the top-4 kernel ROIs (free-vector / parametric / shaped + STA) on a FIXED
  // absolute dF/F₀ scale. The ✓ is a plausibility SCREEN, not a verdict (ADR-0018).
  import { preZero } from './core/recording-summary.js';

  let { summary, onClose } = $props();

  // While the report is mounted, flag <html> so the global print stylesheet
  // (app.css) prints ONLY this report. Scoped to mount so a plain Ctrl+P anywhere
  // else in the app is unaffected.
  $effect(() => {
    document.documentElement.classList.add('printing-report');
    return () => document.documentElement.classList.remove('printing-report');
  });

  // Fixed absolute kernel scale — the unitary-event amplitude is ~constant, so a
  // FIXED dF/F₀ window makes kernels comparable across ROIs/regions/recordings by
  // construction (memory: unitary-amplitude fixed scale; matches the renderer).
  const AMP_LO = -0.006;
  const AMP_HI = 0.016;
  const REF_AMP = 0.0095; // canonical unitary amplitude (file-80 ROI 1) reference line
  const LAG = 5; // kernel x half-window (s)

  const TYPE_C = { baseline: '#e69f00', treatment: '#22a222', hik: '#0072b2', full: '#888888' };
  const METHODS = [
    { key: 'fv', label: 'free-vector', color: '#117788' },
    { key: 'pm', label: 'parametric', color: '#77aa33' },
    { key: 'shaped', label: 'shaped', color: '#cc5500' },
  ];

  const roiLabel = (roi) => {
    const n = String(roi).replace(/\D/g, '');
    return n ? `ROI ${n}` : String(roi);
  };
  const fmt = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
  const signed = (x, d = 4) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(d) : '—');

  // ---- kernel panel geometry (SVG viewBox 100 × 90 user units) ----
  const PW = 100, PH = 78; // plot area; extra below for the caption
  const kx = (t) => ((t + LAG) / (2 * LAG)) * PW;
  const ky = (v) => PH - ((v - AMP_LO) / (AMP_HI - AMP_LO)) * PH;

  function poly(times, ys) {
    const yz = preZero(times, ys);
    let d = '';
    let pen = false;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const v = yz[i];
      if (t < -LAG || t > LAG || !Number.isFinite(v)) { pen = false; continue; }
      // CLIP, don't clamp: let out-of-range values run off the panel (the SVG clips
      // to its box) — clamping to the edge would draw false flat/box segments, which
      // is exactly what railed high-spike-rate kernels would look like otherwise.
      const X = kx(t).toFixed(2);
      const Y = ky(v).toFixed(2);
      d += (pen ? 'L' : 'M') + X + ' ' + Y + ' ';
      pen = true;
    }
    return d.trim();
  }

  // STA is scaled-to-fit (its absolute amplitude isn't the unitary anchor): scale
  // its [0,2] s peak to 75% of the fixed window, matching the renderer.
  function staPoly(times, ys) {
    const yz = preZero(times, ys);
    let peak = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= 0 && times[i] <= 2) { const a = Math.abs(yz[i]); if (a > peak) peak = a; }
    }
    const s = peak > 0 ? (AMP_HI * 0.75) / peak : 1;
    let d = '';
    let pen = false;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const v = yz[i] * s;
      if (t < -LAG || t > LAG || !Number.isFinite(v)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + kx(t).toFixed(2) + ' ' + ky(v).toFixed(2) + ' '; // clip, don't clamp
      pen = true;
    }
    return d.trim();
  }

  const blocks = $derived(
    summary
      ? [
          { key: 'baseline', data: summary.baseline },
          { key: 'treatment', data: summary.treatment },
          ...(summary.hik?.present ? [{ key: 'hik', data: summary.hik }] : []),
        ]
      : [],
  );

  // ---- context strip geometry ----
  const CW = 1000, CH = 150, CPAD = { l: 8, r: 8, t: 16, b: 22 };
  const ctxMins = $derived(summary ? summary.tEnd / 60 : 1);
  const ctxYRange = $derived.by(() => {
    if (!summary) return [0, 1];
    let lo = Infinity, hi = -Infinity;
    for (const v of summary.context.y) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.06 || 0.01;
    return [lo - pad, hi + pad];
  });
  const ctxApMax = $derived(summary ? Math.max(1, ...summary.context.binCounts) : 1);
  const cxm = (mins) => CPAD.l + (mins / ctxMins) * (CW - CPAD.l - CPAD.r);
  const cym = (v) => {
    const [lo, hi] = ctxYRange;
    return CPAD.t + (1 - (v - lo) / (hi - lo || 1)) * (CH - CPAD.t - CPAD.b);
  };
  const ctxTrace = $derived.by(() => {
    if (!summary) return '';
    const { t, y } = summary.context;
    let d = '', pen = false;
    for (let i = 0; i < t.length; i++) {
      if (!Number.isFinite(y[i])) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + cxm(t[i] / 60).toFixed(1) + ' ' + cym(y[i]).toFixed(1) + ' ';
      pen = true;
    }
    return d.trim();
  });
  const apBarH = (c) => (c / ctxApMax) * (CH - CPAD.t - CPAD.b) * 0.5;
  const printPdf = () => window.print();
</script>

<div class="summary-report" role="dialog" aria-label="Recording summary">
  <div class="toolbar no-print">
    <div class="ttl">Recording summary — <strong>{summary?.id}</strong></div>
    <div class="tb-actions">
      <button class="btn primary" onclick={printPdf}>Save as PDF</button>
      <button class="btn" onclick={onClose}>Close</button>
    </div>
  </div>

  <div class="page">
    <header class="page-head">
      <h1>{summary?.id}</h1>
      <div class="meta">
        {summary?.nRoi} ROIs · dt {summary ? (summary.dt * 1000).toFixed(1) : '—'} ms ·
        {summary ? (summary.tEnd / 60).toFixed(1) : '—'} min ·
        kernels at fixed absolute dF/F₀ [{AMP_LO}, {AMP_HI}] · ✓ = plausibility screen, not a verdict
      </div>
    </header>

    <!-- context strip -->
    {#if summary}
      <svg class="ctx" viewBox="0 0 {CW} {CH}" preserveAspectRatio="none" role="img" aria-label="context strip">
        <!-- region shading + windows + solution-delay leaks -->
        {#each summary.context.regions as r}
          {@const c = TYPE_C[r.type] ?? '#888888'}
          <rect x={cxm(r.winStart / 60)} y={CPAD.t} width={Math.max(0, cxm(r.winEnd / 60) - cxm(r.winStart / 60))} height={CH - CPAD.t - CPAD.b} fill={c} opacity="0.10" />
          {#if r.winStart - r.rawStart > 1e-6}
            <rect x={cxm(r.rawStart / 60)} y={CPAD.t} width={Math.max(0, cxm(r.winStart / 60) - cxm(r.rawStart / 60))} height={CH - CPAD.t - CPAD.b} fill="#dd3333" opacity="0.16" />
          {/if}
          <line x1={cxm(r.winStart / 60)} y1={CPAD.t} x2={cxm(r.winStart / 60)} y2={CH - CPAD.b} stroke={c} stroke-width="1" />
          <line x1={cxm(r.winEnd / 60)} y1={CPAD.t} x2={cxm(r.winEnd / 60)} y2={CH - CPAD.b} stroke={c} stroke-width="1" />
          <text x={(cxm(r.winStart / 60) + cxm(r.winEnd / 60)) / 2} y={CPAD.t + 9} text-anchor="middle" font-size="9" font-weight="700" fill={c}>{r.name} ({r.type})</text>
        {/each}
        <!-- AP bars (baseline at strip bottom) -->
        {#each summary.context.binCenters as bc, i}
          {#if summary.context.binCounts[i] > 0}
            <rect x={cxm(bc / 60)} y={CH - CPAD.b - apBarH(summary.context.binCounts[i])} width={Math.max(0.4, (CW - CPAD.l - CPAD.r) / (ctxMins * 60) - 0.2)} height={apBarH(summary.context.binCounts[i])} fill="#555555" opacity="0.30" />
          {/if}
        {/each}
        <!-- ROI 1 calcium trace -->
        <path d={ctxTrace} fill="none" stroke="#117788" stroke-width="0.8" />
        <text x={CPAD.l} y={CH - 6} font-size="9" fill="#117788">dF/F₀ (ROI 1)</text>
        <text x={CW - CPAD.r} y={CH - 6} font-size="9" fill="#555555" text-anchor="end">APs / 1 s bin · time → {ctxMins.toFixed(1)} min</text>
      </svg>
    {/if}

    <!-- per-region blocks -->
    {#each blocks as blk}
      <section class="block">
        <div class="block-head {blk.key}">
          <span class="chip {blk.key}">{blk.key}</span>
          {#if blk.data.present}
            <span class="bh-name">{blk.data.region}</span>
            <span class="bh-facts">{blk.data.spikeCount} APs · {blk.data.nDecent} ROI{blk.data.nDecent === 1 ? '' : 's'} pass the screen</span>
          {:else if blk.data.absent}
            <span class="bh-name">{blk.data.region ?? '—'}</span>
            <span class="bh-facts muted">region not present in this recording</span>
          {:else}
            <span class="bh-name">{blk.data.region ?? '—'}</span>
            <span class="bh-facts muted">present but non-analyzable ({blk.data.spikeCount ?? 0} APs in window)</span>
          {/if}
        </div>

        {#if blk.data.present}
          <div class="panels">
            {#each blk.data.panels as p}
              <figure class="panel">
                <figcaption class="p-title" class:good={p.decent}>{roiLabel(p.roi)} {p.decent ? '✓' : '–'}{#if p.col === 0}<span class="target"> · target</span>{/if}</figcaption>
                <svg viewBox="0 0 {PW} {PH + 4}" class="kplot" role="img" aria-label="kernel panel">
                  <!-- zero axes + reference amplitude -->
                  <line x1="0" y1={ky(0)} x2={PW} y2={ky(0)} stroke="#cccccc" stroke-width="0.5" />
                  <line x1={kx(0)} y1="0" x2={kx(0)} y2={PH} stroke="#cccccc" stroke-width="0.5" />
                  <line x1="0" y1={ky(REF_AMP)} x2={PW} y2={ky(REF_AMP)} stroke="#22a222" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.6" />
                  {#each METHODS as m}
                    <path d={poly(p[m.key].times, p[m.key].y)} fill="none" stroke={m.color} stroke-width="1" />
                  {/each}
                  {#if p.sta.times.length === p.sta.y.length && p.sta.times.length}
                    <path d={staPoly(p.sta.times, p.sta.y)} fill="none" stroke="#666666" stroke-width="0.8" stroke-dasharray="2.5 2" />
                  {/if}
                </svg>
                <div class="p-facts">fv {signed(p.fvAmpAdj)}@{fmt(p.fvPeakLagS)} · pm@{fmt(p.pmPeakLagS)} · STA@{fmt(p.staPeakLagS)}</div>
              </figure>
            {/each}
          </div>
        {/if}
      </section>
    {/each}

    <!-- legend -->
    <footer class="legend">
      {#each METHODS as m}<span class="lg"><i class="sw sw-{m.key}"></i>{m.label}</span>{/each}
      <span class="lg"><i class="dash dash-sta"></i>STA (scaled to fit)</span>
      <span class="lg"><i class="dash dash-ref"></i>reference amplitude {REF_AMP}</span>
      <span class="lg spacer">lag axis −{LAG}…+{LAG} s · dF/F₀ [{AMP_LO}, {AMP_HI}]</span>
    </footer>
  </div>
</div>

<style>
  /* Full-viewport overlay; the .page inside is a white A-series-ish sheet that is
     the ONLY thing printed (global print rules live in app.css). */
  .summary-report {
    position: fixed;
    inset: 0;
    z-index: 1200;
    overflow: auto;
    background: #6b6b74;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 0 40px;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    background: #23242b;
    color: #f3f4f6;
  }
  .ttl { font-size: 14px; }
  .ttl strong { font-family: var(--mono); }
  .tb-actions { display: flex; gap: 8px; }
  .btn {
    font: inherit;
    font-size: 13px;
    padding: 7px 14px;
    border: 1px solid #55575f;
    border-radius: 7px;
    background: #2f3038;
    color: #f3f4f6;
    cursor: pointer;
  }
  .btn.primary { background: var(--accent, #7a1fb8); border-color: var(--accent, #7a1fb8); color: #fff; font-weight: 600; }

  /* the printed sheet — always light, dark text (like the explainer figure) */
  .page {
    width: min(1100px, 96vw);
    background: #fff;
    color: #1a1a1f;
    margin: 20px 0;
    padding: 26px 30px 34px;
    border-radius: 4px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
    font-family: var(--sans, system-ui, sans-serif);
  }
  .page-head h1 { font-size: 20px; margin: 0 0 4px; font-family: var(--mono, monospace); color: #000; }
  .meta { font-size: 11.5px; color: #555; margin-bottom: 14px; }

  .ctx { width: 100%; height: auto; display: block; border: 1px solid #e6e6ea; border-radius: 4px; }

  .block { margin-top: 18px; break-inside: avoid; }
  .block-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    border-left: 4px solid;
    padding: 2px 0 4px 10px;
    margin-bottom: 8px;
  }
  .chip {
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 4px;
  }
  /* Region-type colors as classes (no inline styles — strict CSP, FOUNDATIONS §6). */
  .block-head.baseline { border-left-color: #e69f00; }
  .block-head.treatment { border-left-color: #22a222; }
  .block-head.hik { border-left-color: #0072b2; }
  .chip.baseline { background: #e69f00; }
  .chip.treatment { background: #22a222; }
  .chip.hik { background: #0072b2; }
  .bh-name { font-size: 14px; font-weight: 650; color: #111; }
  .bh-facts { font-size: 12px; color: #444; }
  .bh-facts.muted { color: #999; font-style: italic; }

  .panels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  @media (max-width: 720px) { .panels { grid-template-columns: repeat(2, 1fr); } }
  .panel { margin: 0; border: 1px solid #ececf0; border-radius: 6px; padding: 6px 8px 8px; }
  .p-title { font-size: 12px; font-weight: 700; color: #a22; margin-bottom: 2px; }
  .p-title.good { color: #161; }
  .p-title .target { color: #7a1fb8; font-weight: 600; }
  .kplot { width: 100%; height: auto; display: block; overflow: hidden; }
  .p-facts { font-family: var(--mono, monospace); font-size: 9.5px; color: #333; margin-top: 3px; word-break: break-all; }

  .legend {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #e6e6ea;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    font-size: 11px;
    color: #444;
  }
  .lg { display: inline-flex; align-items: center; gap: 5px; }
  .lg i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .sw-fv { background: #117788; }
  .sw-pm { background: #77aa33; }
  .sw-shaped { background: #cc5500; }
  .lg i.dash { height: 0; border-top: 2px dashed; width: 16px; }
  .dash-sta { border-top-color: #666666; }
  .dash-ref { border-top-color: #22a222; }
  .lg.spacer { margin-left: auto; color: #888; }
</style>
