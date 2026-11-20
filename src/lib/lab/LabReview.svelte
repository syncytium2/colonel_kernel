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
  const LAG_RANGE = [-5, 5];

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
  const yAuto = $derived.by(() => {
    let lo = 0;
    let hi = 0;
    for (const b of Object.values(bands)) {
      for (const band of [b.kernel, b.sta]) {
        for (const sr of band?.series ?? []) {
          for (const v of sr.ys) {
            if (v == null || !Number.isFinite(v)) continue;
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
  // Where the curves cross a typed range, say so in the row: a clipped curve is not hidden data.
  const clippedIn = (b) => {
    if (!yManual || !b) return false;
    for (const band of [b.kernel, b.sta]) {
      for (const sr of band?.series ?? []) for (const v of sr.ys) if (Number.isFinite(v) && (v < yManual[0] || v > yManual[1])) return true;
    }
    return false;
  };
  const yKey = $derived(yRange ? `${yRange[0].toPrecision(6)}:${yRange[1].toPrecision(6)}` : 'auto');

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const mOf = (v) => (method === 'fv' ? v.fv : method === 'pm' ? v.pm : v.shaped);
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
    <span class="tag">lab only · dev server only</span>
    <h2>Review: every recording, one scale</h2>
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
    <label class="check"><input type="checkbox" bind:checked={unitPeak} /> unit peak (shape only)</label>
    <span class="legend">
      {#each VARIANT_IDS as id (id)}
        {@const label = Object.values(results).find((x) => x.result)?.result.variants.find((v) => v.id === id)?.label ?? id}
        <label class="check">
          <input type="checkbox" checked={!hidden[id]} onchange={(e) => (hidden = { ...hidden, [id]: !e.currentTarget.checked })} />
          <span class="swatch" style:--c={COLORS[id]}></span>{label}
        </label>
      {/each}
    </span>
    {#if loading || computing}<span class="busy">{loading || computing}…</span>{/if}
    {#if dirLabel}<span class="where">{dirLabel}</span>{/if}
  </header>
  {#if listError}<p class="err">{listError}</p>{/if}
  <p class="note">
    Every panel shares the lag axis (−5 to 5 s) and one amplitude axis
    {#if yRange}({fmt(yRange[0], 4)} to {fmt(yRange[1], 4)}{unitPeak ? ', peak = 1' : ' dF/F₀'}){/if},
    {#if yManual}as typed; rows marked "clipped" have a curve outside it.{:else}set by the largest and smallest value drawn anywhere on the page.{/if} The STA is computed to ±2 s. Numbers are reported, not judged.
  </p>

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
          <span>{res.window.name} {fmt(rr.window.startS, 0)}–{fmt(rr.window.endS, 0)} s</span>
          <span>{rr.spikeTimes.length} spikes</span>
          {#if rr.masked.nFrames}<span>{rr.masked.nFrames} frames masked</span>{/if}
          {#if a}<span>STA events {a.nAccepted} of {a.nEvents}</span>{/if}
          {#if clippedIn(b)}<span class="err">clipped by the typed amplitude axis</span>{/if}
          <span class="verdict">verdict: {vd ? `${vd.verdict}${vd.stale ? ' (stale)' : ''}` : 'none'}</span>
          {#if !rr.variants.some((v) => v.analyzable)}<span class="err">{rr.variants[0]?.reason}</span>{/if}
        {:else}
          <span class="busy">queued</span>
        {/if}
      </div>
      <div class="cell">
        {#if b}
          <div class="plotbox">
          {#key `${b.kernel.series.length}-${method}-${dark}-${plotHeight}-${yKey}-${unitPeak}`}
            <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={b.kernel.lag} seriesList={b.kernel.series} xRange={LAG_RANGE} {yRange} yAxisSize={60} padRight={12}
              cursorPoints={false} zeroLine xLabel="lag (s)" yLabel={unitPeak ? 'peak = 1' : 'dF/F₀ per spike'} height={plotHeight} />
          {/key}
          </div>
          <table class="mini">
            <tbody>
              {#each shownOf(res) as v (v.id)}
                {@const m = mOf(v)}
                <tr><td><span class="swatch" style:--c={COLORS[v.id]}></span></td><td>peak {fmt(m.peakLagS, 1)} s</td><td>{fmt(m.peakAmp, 4)}</td><td>τ {fmt(m.tauDecayS)} s</td><td>acausal {fmt(m.acausalRatio, 2)}</td></tr>
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
              cursorPoints={false} zeroLine xLabel="lag (s)" yLabel={unitPeak ? 'peak = 1' : 'dF/F₀'} height={plotHeight} />
          {/key}
          </div>
          <table class="mini">
            <tbody>
              {#each shownOf(res) as v (v.id)}
                <tr><td><span class="swatch" style:--c={COLORS[v.id]}></span></td><td>peak {fmt(v.agreement.staPeakLagS, 1)} s</td><td>{fmt(v.agreement.staPeakAmp, 4)}</td></tr>
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
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 8px 10px; border: 1px dashed var(--text); border-radius: 8px; position: sticky; top: 0; z-index: 2; background: var(--bg); }
  .bar label { display: flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .bar select, .bar input[type='number'] { font: inherit; color: var(--text-h); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
  .bar input[type='number'] { width: 70px; }
  .tag { font: 11px var(--mono); text-transform: uppercase; letter-spacing: 1px; }
  h2 { margin: 0; font-size: 17px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .check { display: flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .swatch { display: inline-block; flex: none; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; }
  .busy { font-style: italic; font-size: 12.5px; }
  .where { font: 11px var(--mono); color: var(--text); }
  .note { font-size: 12.5px; margin: 2px 0; }
  .err { color: #b00020; margin: 0; }
  @media (prefers-color-scheme: dark) { .err { color: #ff8a8a; } }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
  .colhead { font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--border); padding-bottom: 2px; }
  .rowhead { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-top: 10px; padding-top: 6px; border-top: 2px solid var(--border); font-size: 13px; }
  .rowhead select { font: inherit; color: var(--text-h); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; }
  .verdict { font-style: italic; }
  /* Each plot's numbers sit beside it, not under it (Tony, 2026-11-20): stacked, the tables
     made every row about twice the plot's height. Below 1300 px two columns of plot + table
     get too narrow, so the table drops back under its plot. */
  .cell { min-width: 0; display: flex; align-items: flex-start; gap: 10px; }
  .plotbox { flex: 1 1 auto; min-width: 0; }
  .cell .mini { flex: none; margin-top: 4px; }
  @media (max-width: 1300px) { .cell { flex-direction: column; align-items: stretch; } }
  .mini { border-collapse: collapse; font-size: 11.5px; }
  .mini td { padding: 0 8px 0 0; white-space: nowrap; }
</style>
