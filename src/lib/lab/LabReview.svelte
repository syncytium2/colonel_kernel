<script>
  // DEV-ONLY (ADR-0053). Reached exclusively through the dynamic import behind
  // `import.meta.env.DEV` in App.svelte; `npm run lab-check` asserts no trace of it reaches
  // dist/. Do not import this file statically anywhere.
  //
  // Every recording in the folder at once (Tony, 2026-11-17: "a review page where the results
  // for each can be reviewed simultaneously on the same scale. a column for kernels and a
  // column for STA"). One row per recording; the left column is the recovered kernel, the
  // right the spike-triggered average. EVERY panel shares one lag axis and one amplitude
  // axis, so a height read anywhere on the page is the same height everywhere. The numbers
  // come from the same analyzeVariants the single-recording page uses; nothing is recomputed
  // differently here.
  import Plot from '../Plot.svelte';
  import { normalizeUnitPeak } from '../core/readout.js';
  import { parseLabRecording } from './recording.js';
  import { analyzeVariants, analysisWindows } from './compare.js';
  import { PENSUB_K } from './extraction.js';
  import { VARIANT_COLORS_LIGHT, VARIANT_COLORS_DARK, METHODS, kernelFor } from './colors.js';
  import { parseVerdicts, currentVerdict, verdictKey, isStale } from './verdicts.js';
  import { riseCrossingLag, indexAtLag } from './timing.js';

  const scheme = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let dark = $state(!!scheme?.matches);
  $effect(() => {
    if (!scheme) return;
    const on = (e) => (dark = e.matches);
    scheme.addEventListener('change', on);
    return () => scheme.removeEventListener('change', on);
  });
  const COLORS = $derived(dark ? VARIANT_COLORS_DARK : VARIANT_COLORS_LIGHT);
  const VARIANT_IDS = Object.keys(VARIANT_COLORS_LIGHT);
  // Lag axis shown (Tony, 2026-11-20: "reset the x-axis -2s to 5 sec. one tick every sec").
  // Kernels are still recovered over ±5 s; only the view and the amplitude scale use this.
  const LAG_RANGE = [-2, 5];
  const inView = (t) => t >= LAG_RANGE[0] && t <= LAG_RANGE[1];
  // Short names for the table rows and the legend; the full description is the legend's
  // second line and its tooltip.
  const SHORT = {
    frozen: 'soma, F0 fixed',
    dff: 'soma dF/F0',
    'frozen-pensub': 'soma−pen, F0 fixed',
    'dff-pensub': 'soma−pen dF/F0',
    'dff-prct': 'soma dF/F0 − p10',
    'file-dff': 'producer dF/F0',
  };
  const T50_HELP = 'lag where the curve last crosses half its peak height (from zero) on the way up to the peak; — when it never falls below half inside the window';
  let showSettings = $state(true);
  let showLegend = $state(true);

  // Parsed recordings are large; they live outside reactive state.
  const recs = new Map();
  let rows = $state([]); // { name, sliceId, rois:[label], targetIndex, roiIndex, loadError }
  let dirLabel = $state('');
  let listError = $state(null);
  let loading = $state('');

  let windowName = $state('baseline');
  let method = $state('fv');
  let unitPeak = $state(false);
  let lambda = $state(0.002);
  let pensubK = $state(PENSUB_K);
  let hidden = $state({});
  let plotHeight = $state(180);

  let results = $state.raw({}); // name -> { result } | { error }
  // Finished results by (file, ROI, window, λ, k), so a file arriving or one row's ROI
  // changing does not recompute the other rows.
  const cache = new Map();
  let computing = $state('');

  let verdictRows = $state.raw([]);
  async function loadVerdicts() {
    try {
      verdictRows = parseVerdicts(await (await fetch('/__lab/raw-verdicts')).text());
    } catch {
      verdictRows = [];
    }
  }

  async function loadAll() {
    listError = null;
    try {
      const j = await (await fetch('/__lab/raw-recordings')).json();
      dirLabel = j.dir;
      if (j.missing) throw new Error(`no recordings folder (${j.dir || 'CK_LAB_RAW_DIR not set'})`);
      rows = j.files.map((name) => ({ name, sliceId: name.replace(/\.klab\.json$/i, ''), rois: [], targetIndex: null, roiIndex: 0, loadError: null, loaded: false }));
    } catch (e) {
      listError = String(e?.message ?? e);
      return;
    }
    for (let k = 0; k < rows.length; k++) {
      const name = rows[k].name;
      loading = `reading ${name} (${k + 1} of ${rows.length})`;
      try {
        const r = await fetch('/__lab/raw-file?name=' + encodeURIComponent(name));
        if (!r.ok) throw new Error(await r.text());
        const rec = await parseLabRecording(await r.text());
        recs.set(name, rec);
        rows[k] = { ...rows[k], sliceId: rec.sliceId, rois: rec.rois.map((x) => x.label), targetIndex: rec.targetIndex, roiIndex: rec.targetIndex ?? 0, loaded: true };
      } catch (e) {
        rows[k] = { ...rows[k], loadError: String(e?.message ?? e), loaded: true };
      }
    }
    loading = '';
  }
  loadVerdicts();
  loadAll();

  // Window choices: the whole recording, then every region name any file carries. A file
  // without the chosen region says so in its row; nothing is substituted for it.
  const windowNames = $derived.by(() => {
    const names = ['whole recording'];
    for (const r of rows) {
      const rec = r.loaded && !r.loadError ? recs.get(r.name) : null;
      if (!rec) continue;
      for (const g of rec.regions) if (!names.includes(g.name)) names.push(g.name);
    }
    return names;
  });
  const windowOf = (rec) => analysisWindows(rec).find((w, i) => (windowName === 'whole recording' ? i === 0 : i > 0 && w.name.trim().toLowerCase() === windowName.trim().toLowerCase())) ?? null;

  // Recompute every loaded row, one at a time off the main click, whenever an input changes.
  $effect(() => {
    const wanted = rows.filter((r) => r.loaded && !r.loadError).map((r) => ({ name: r.name, roiIndex: r.roiIndex }));
    const args = { lambda: Number(lambda), pensubK: Number(pensubK) };
    const wn = windowName;
    if (!(args.lambda >= 0) || !Number.isFinite(args.pensubK)) return;
    let cancelled = false;
    const out = {};
    let k = 0;
    const keyOf = (name, roiIndex) => JSON.stringify([name, roiIndex, wn, args.lambda, args.pensubK]);
    let id;
    const next = () => {
      if (cancelled) return;
      if (k >= wanted.length) {
        computing = '';
        return;
      }
      const { name, roiIndex } = wanted[k++];
      const key = keyOf(name, roiIndex);
      if (cache.has(key)) {
        out[name] = cache.get(key);
        results = { ...out };
        next();
        return;
      }
      const rec = recs.get(name);
      computing = `computing ${rec.sliceId} (${k} of ${wanted.length})`;
      const w = windowOf(rec);
      try {
        out[name] = w ? { result: analyzeVariants(rec, { roiIndex, startS: w.startS, endS: w.endS, ...args }), window: w } : { error: `no region named "${wn}"` };
      } catch (e) {
        out[name] = { error: String(e?.message ?? e) };
      }
      cache.set(key, out[name]);
      results = { ...out };
      id = setTimeout(next, 0);
    };
    id = setTimeout(next, 20);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  });

  const scale = (ys) => (unitPeak ? normalizeUnitPeak(ys) : Array.from(ys));
  const shownOf = (res) => (res?.result ? res.result.variants.filter((v) => v.analyzable && !hidden[v.id]) : []);

  // Per row: the kernel band and the STA band, as the single-recording page builds them.
  const bands = $derived.by(() => {
    const out = {};
    for (const r of rows) {
      const shown = shownOf(results[r.name]);
      if (!shown.length) continue;
      const k0 = kernelFor(shown[0], method);
      const lag = Array.from(k0.times ?? k0.samples.map((_, i) => (i - k0.zeroIndex) * k0.dt));
      const kernel = { lag, series: shown.map((v) => ({ ys: scale(kernelFor(v, method).samples), stroke: COLORS[v.id], width: 2 })) };
      const ok = shown.filter((v) => v.sta && !v.sta.empty);
      const sta = ok.length ? { lag: Array.from(ok[0].sta.times), series: ok.map((v) => ({ ys: scale(v.sta.samples), stroke: COLORS[v.id], width: 2 })) } : null;
      out[r.name] = { kernel, sta };
    }
    return out;
  });

  // ONE amplitude range for every panel on the page, kernel and STA alike. Automatic: the
  // largest and smallest value drawn anywhere. A row with few spikes can swing far enough to
  // flatten every other row, so the range can also be typed; it is still ONE range for all.
  let yMinIn = $state('');
  let yMaxIn = $state('');
  const yManual = $derived.by(() => {
    const lo = Number(yMinIn);
    const hi = Number(yMaxIn);
    return yMinIn !== '' && yMaxIn !== '' && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : null;
  });
  // Or the range can come from ONE chosen recording's curves (Tony, 2026-11-20: "418 has no
  // kernel relevant to our work. so it should not set the scale"). The reviewer picks the row;
  // nothing is excluded by rule. Every row is still drawn on that one range.
  let scaleFrom = $state(''); // '' = every row; otherwise a row's file name
  const yAuto = $derived.by(() => {
    let lo = 0;
    let hi = 0;
    const from = scaleFrom && bands[scaleFrom] ? [bands[scaleFrom]] : Object.values(bands);
    for (const b of from) {
      for (const band of [b.kernel, b.sta]) {
        for (const sr of band?.series ?? []) {
          for (let i = 0; i < sr.ys.length; i++) {
            const v = sr.ys[i];
            if (v == null || !Number.isFinite(v) || !inView(band.lag[i])) continue;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
    }
    if (hi === lo) return null;
    const pad = 0.06 * (hi - lo);
    return [lo - pad, hi + pad];
  });
  const yRange = $derived(yManual ?? yAuto);
  // The range is set by something other than every row: typed, or one chosen row.
  const yRestricted = $derived(!!yManual || (!!scaleFrom && !!bands[scaleFrom]));
  // Where the curves cross a restricted range, say so in the row: a clipped curve is not hidden data.
  const clippedIn = (b) => {
    if (!yRestricted || !yRange || !b) return false;
    for (const band of [b.kernel, b.sta]) {
      for (const sr of band?.series ?? []) {
        for (let i = 0; i < sr.ys.length; i++) {
          const v = sr.ys[i];
          if (Number.isFinite(v) && inView(band.lag[i]) && (v < yRange[0] || v > yRange[1])) return true;
        }
      }
    }
    return false;
  };
  const scaleRow = $derived(rows.find((r) => r.name === scaleFrom));
  const yKey = $derived(yRange ? `${yRange[0].toPrecision(6)}:${yRange[1].toPrecision(6)}` : 'auto');

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const mOf = (v) => (method === 'fv' ? v.fv : method === 'pm' ? v.pm : v.shaped);
  // t50 rise (timing.js): the lag where the curve last crosses half its reported peak on the
  // way up to it. Shown in place of the peak lag (Tony, 2026-11-20).
  const kernelT50 = (v) => {
    const k = kernelFor(v, method);
    const lag = k.times ?? Array.from(k.samples, (_, i) => (i - k.zeroIndex) * k.dt);
    return riseCrossingLag(k.samples, lag, indexAtLag(lag, mOf(v).peakLagS));
  };
  const staT50 = (v) => (v.sta && !v.sta.empty ? riseCrossingLag(v.sta.samples, v.sta.times, indexAtLag(v.sta.times, v.agreement.staPeakLagS)) : NaN);
  const verdictFor = (r, res) => {
    const rec = recs.get(r.name);
    if (!rec || !res?.window) return null;
    const v = currentVerdict(verdictRows, verdictKey({ slice_id: rec.sliceId, roi: rec.rois[r.roiIndex].label, window: res.window.name }));
    return v ? { ...v, stale: isStale(v, rec.spikes?.source) } : null;
  };
  const setRoi = (k, i) => (rows[k] = { ...rows[k], roiIndex: Number(i) });
</script>

<div class="review">
  <header class="bar">
    <div class="titlerow">
      <h2>Kernel review</h2>
      {#if loading || computing}<span class="busy">{loading || computing}…</span>{/if}
      <!-- Fold controls on the right, where the tabs' fold is (Tony, 2026-11-20). -->
      <button class="fold" class:on={showSettings} style="margin-left: auto" onclick={() => (showSettings = !showSettings)}>{showSettings ? '▾' : '▸'} settings</button>
      <button class="fold" class:on={showLegend} onclick={() => (showLegend = !showLegend)}>{showLegend ? '▾' : '▸'} legend</button>
    </div>
    {#if showSettings}
    <div class="settings">
    <label>window
      <select bind:value={windowName}>{#each windowNames as n (n)}<option value={n}>{n}</option>{/each}</select>
    </label>
    <label>method
      <select bind:value={method}>{#each METHODS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}</select>
    </label>
    <label>λ <input type="number" min="0" step="0.001" bind:value={lambda} /></label>
    <label>k <input type="number" step="0.05" bind:value={pensubK} /></label>
    <label>row height <input type="range" min="110" max="360" step="10" bind:value={plotHeight} /></label>
    <label title="Blank both for automatic: the range of everything drawn">amplitude axis
      <input type="number" step="0.005" placeholder="auto" bind:value={yMinIn} /> to
      <input type="number" step="0.005" placeholder="auto" bind:value={yMaxIn} />
    </label>
    <label title="With the amplitude boxes blank, the axis is fitted to this recording's curves; every row is drawn on it">scale from
      <select bind:value={scaleFrom} disabled={!!yManual}>
        <option value="">every row</option>
        {#each rows as r (r.name)}<option value={r.name} disabled={!bands[r.name]}>{r.sliceId}</option>{/each}
      </select>
    </label>
    <label class="check"><input type="checkbox" bind:checked={unitPeak} /> unit peak (shape only)</label>
    {#if dirLabel}<span class="where">{dirLabel}</span>{/if}
    </div>
    {/if}
    {#if showLegend}
    <div class="legend">
      {#each VARIANT_IDS as id (id)}
        {@const label = Object.values(results).find((x) => x.result)?.result.variants.find((v) => v.id === id)?.label ?? id}
        <label class="check" title={label}>
          <input type="checkbox" checked={!hidden[id]} onchange={(e) => (hidden = { ...hidden, [id]: !e.currentTarget.checked })} />
          <span class="swatch" style:--c={COLORS[id]}></span><b>{SHORT[id] ?? id}</b><span class="full">{label}</span>
        </label>
      {/each}
    </div>
    {/if}
  </header>
  {#if listError}<p class="err">{listError}</p>{/if}

  <div class="grid">
    <div class="colhead">Recovered kernel, {METHODS.find((m) => m.id === method).label}</div>
    <div class="colhead">Spike-triggered average</div>
    {#each rows as r, k (r.name)}
      {@const res = results[r.name]}
      {@const b = bands[r.name]}
      {@const vd = verdictFor(r, res)}
      <div class="rowhead">
        <strong>{r.sliceId}</strong>
        {#if r.rois.length}
          <select value={r.roiIndex} onchange={(e) => setRoi(k, e.currentTarget.value)}>
            {#each r.rois as lab, i (i)}<option value={i}>{lab}{i === r.targetIndex ? ' (loose-patch)' : ''}</option>{/each}
          </select>
        {:else}
          <span></span>
        {/if}
        {#if r.loadError}
          <span class="err">{r.loadError}</span>
        {:else if !r.loaded}
          <span class="busy">waiting to read</span>
        {:else if res?.error}
          <span class="err">{res.error}</span>
        {:else if res?.result}
          {@const rr = res.result}
          {@const a = rr.variants.find((v) => v.analyzable)?.agreement}
          <!-- Fixed slots, so the verdict sits in the same column on every row (Tony, 2026-11-20). -->
          <span class="verdict">verdict: {vd ? `${vd.verdict}${vd.stale ? ' (stale)' : ''}` : 'none'}</span>
          <span>{res.window.name} {fmt(rr.window.startS, 0)}–{fmt(rr.window.endS, 0)} s</span>
          <span class="num">{rr.spikeTimes.length} spikes</span>
          <span class="num">{rr.masked.nFrames ? `${rr.masked.nFrames} frames masked` : ''}</span>
          <span class="num">{a ? `STA events ${a.nAccepted} of ${a.nEvents}` : ''}</span>
          <span class="extra">
            {#if clippedIn(b)}<span class="err">clipped by the {yManual ? 'typed amplitude axis' : `axis set from ${scaleRow?.sliceId}`}</span>{/if}
            {#if !rr.variants.some((v) => v.analyzable)}<span class="err">{rr.variants[0]?.reason}</span>{/if}
          </span>
        {:else}
          <span class="busy">queued</span>
        {/if}
      </div>
      <div class="cell">
        {#if b}
          <div class="plotbox">
          {#key `${b.kernel.series.length}-${method}-${dark}-${plotHeight}-${yKey}-${unitPeak}`}
            <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={b.kernel.lag} seriesList={b.kernel.series} xRange={LAG_RANGE} {yRange} yAxisSize={60} padRight={12}
              cursorPoints={false} zeroLine yZeroLine zeroLineColor="var(--text)" grid={false} xTickStep={1} yTickSpace={16} xLabel="lag (s)" yLabel={unitPeak ? 'peak = 1' : 'dF/F₀ per spike'} height={plotHeight} />
          {/key}
          </div>
          <table class="mini">
            <thead>
              <tr><th></th><th title={T50_HELP}>t50 (s)</th><th title="causal-lobe maximum, lag ≥ 0">peak (dF/F₀)</th><th title="exponential fit to the tail after the peak">τ decay (s)</th><th title="negative-lag energy ÷ causal energy">acausal</th></tr>
            </thead>
            <tbody>
              {#each shownOf(res) as v (v.id)}
                {@const m = mOf(v)}
                <tr><td class="name"><span class="swatch" style:--c={COLORS[v.id]}></span>{SHORT[v.id] ?? v.id}</td><td>{fmt(kernelT50(v), 2)}</td><td>{fmt(m.peakAmp, 4)}</td><td>{fmt(m.tauDecayS)}</td><td>{fmt(m.acausalRatio, 2)}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
      <div class="cell">
        {#if b?.sta}
          <div class="plotbox">
          {#key `${b.sta.series.length}-${dark}-${plotHeight}-${yKey}-${unitPeak}`}
            <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={b.sta.lag} seriesList={b.sta.series} xRange={LAG_RANGE} {yRange} yAxisSize={60} padRight={12}
              cursorPoints={false} zeroLine yZeroLine zeroLineColor="var(--text)" grid={false} xTickStep={1} yTickSpace={16} xLabel="lag (s)" yLabel={unitPeak ? 'peak = 1' : 'dF/F₀'} height={plotHeight} />
          {/key}
          </div>
          <table class="mini">
            <thead>
              <tr><th></th><th title={T50_HELP}>t50 (s)</th><th title="maximum over ±2 s">peak (dF/F₀)</th></tr>
            </thead>
            <tbody>
              {#each shownOf(res) as v (v.id)}
                <tr><td class="name"><span class="swatch" style:--c={COLORS[v.id]}></span>{SHORT[v.id] ?? v.id}</td><td>{fmt(staT50(v), 2)}</td><td>{fmt(v.agreement.staPeakAmp, 4)}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else if b}
          <p class="note">no spike passed the STA's overlap rule in this window</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .review { flex: 1; min-height: 0; overflow: auto; font-size: 14px; color: var(--text-h); display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; flex-direction: column; gap: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; position: sticky; top: 0; z-index: 2; background: var(--bg); }
  .titlerow { display: flex; align-items: center; gap: 10px; }
  .settings { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; }
  .bar label { display: flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .bar select, .bar input[type='number'] { font: inherit; color: var(--text-h); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
  .bar input[type='number'] { width: 70px; }
  .fold { font: 12.5px inherit; color: var(--text-h); background: transparent; border: 1px solid var(--border); border-radius: 4px; padding: 1px 8px; cursor: pointer; }
  .fold.on { background: var(--border); }
  h2 { margin: 0; font-size: 16px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  .legend b { font-weight: 600; }
  .legend .full { color: var(--text); font-size: 11.5px; margin-left: 4px; }
  .check { display: flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .swatch { display: inline-block; flex: none; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; }
  .busy { font-style: italic; font-size: 12.5px; }
  .where { font: 11px var(--mono); color: var(--text); }
  .note { font-size: 12.5px; margin: 2px 0; }
  .err { color: #b00020; margin: 0; }
  @media (prefers-color-scheme: dark) { .err { color: #ff8a8a; } }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
  .colhead { font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
  /* Fixed slots: recording, ROI, verdict, window, spikes, masked, STA events, then notes.
     The verdict is the third slot on every row, so verdicts line up down the page. */
  .rowhead { grid-column: 1 / -1; display: grid; grid-template-columns: 115px 165px 150px 150px 110px 150px 170px 1fr; align-items: baseline; column-gap: 12px; margin-top: 10px; padding-top: 6px; border-top: 2px solid var(--border); font-size: 13px; }
  .rowhead > .err, .rowhead > .busy { grid-column: 3 / -1; }
  .rowhead .extra { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .rowhead select { font: inherit; color: var(--text-h); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
  /* Verdicts should pop (Tony, 2026-11-20): red and bold. */
  .verdict { color: #c8102e; font-weight: 700; font-size: 14px; }
  @media (prefers-color-scheme: dark) { .verdict { color: #ff6b6b; } }
  /* Each plot's numbers sit beside it, not under it (Tony, 2026-11-20): stacked, the tables
     made every row about twice the plot's height. Below 1300 px two columns of plot + table
     get too narrow, so the table drops back under its plot. */
  .cell { min-width: 0; display: flex; align-items: flex-start; gap: 10px; }
  .plotbox { flex: 1 1 auto; min-width: 0; }
  .cell .mini { flex: none; margin-top: 4px; }
  @media (max-width: 1300px) { .cell { flex-direction: column; align-items: stretch; } }
  .mini { border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  .mini th { font-weight: 600; font-size: 11px; text-align: right; padding: 0 0 2px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; cursor: help; }
  .mini td { text-align: right; padding: 1px 0 1px 12px; line-height: 1.25; white-space: nowrap; }
  /* One width for both tables, so the kernel plot and the STA plot are the same width. */
  .cell .mini { width: 350px; }
  .cell .mini th:first-child { width: 100%; }
  .mini td.name { text-align: left; padding-left: 0; }
  .mini td.name .swatch { margin-right: 6px; }
  .mini tbody tr + tr td { border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
</style>
