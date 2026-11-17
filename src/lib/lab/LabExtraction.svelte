<script>
  // DEV-ONLY (ADR-0053). Reached exclusively through the dynamic import behind
  // `import.meta.env.DEV` in App.svelte, so a production build has no reference to this
  // module and emits no chunk for it; `npm run lab-check` asserts that. Do not import this
  // file statically anywhere.
  //
  // One recording, one ROI, one window: the kernel recovered from each extraction of the
  // raw fluorescence, drawn on one lag axis. The recoveries are Tab 2's own (core/), so two
  // curves differ only in what was done to the fluorescence before recovery.
  import Plot from '../Plot.svelte';
  import { normalizeUnitPeak } from '../core/readout.js';
  import { parseLabRecording, roiColumn } from './recording.js';
  import { analyzeVariants, analysisWindows } from './compare.js';
  import { PENSUB_K } from './extraction.js';
  import { VARIANT_COLORS_LIGHT, VARIANT_COLORS_DARK, METHODS } from './colors.js';
  import { VERDICTS, VERDICT_FILE, parseVerdicts, currentVerdict, verdictKey, isStale } from './verdicts.js';

  // One hue per variant (colors.js), shared with the review page. Plots are keyed on the
  // scheme so a switch redraws them.
  const LIGHT = VARIANT_COLORS_LIGHT;
  const DARK = VARIANT_COLORS_DARK;
  const scheme = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let dark = $state(!!scheme?.matches);
  $effect(() => {
    if (!scheme) return;
    const on = (e) => (dark = e.matches);
    scheme.addEventListener('change', on);
    return () => scheme.removeEventListener('change', on);
  });
  const COLORS = $derived(dark ? DARK : LIGHT);
  // Theme variables, resolved by Plot when it draws.
  const TRUTH_COLOR = 'var(--series-truth)';
  const SOMA_COLOR = 'var(--text-h)';
  const PEN_COLOR = 'var(--text)';

  let files = $state([]);
  let dirLabel = $state('');
  let missing = $state(false);
  let fileName = $state('');
  let rec = $state.raw(null);
  let loadError = $state(null);
  let busy = $state(false);

  let roiIndex = $state(0);
  let windowIdx = $state(0);
  let method = $state('fv');
  let unitPeak = $state(false);
  let lambda = $state(0.002);
  let pensubK = $state(PENSUB_K);
  let hidden = $state({});

  let result = $state.raw(null);
  let computeError = $state(null);
  let computing = $state(false);

  async function refresh() {
    try {
      const r = await fetch('/__lab/raw-recordings');
      const j = await r.json();
      files = j.files;
      dirLabel = j.dir;
      missing = j.missing;
    } catch (e) {
      loadError = String(e?.message ?? e);
    }
  }
  refresh();

  async function take(text, name) {
    busy = true;
    loadError = null;
    try {
      const parsed = await parseLabRecording(text);
      rec = parsed;
      fileName = name;
      roiIndex = parsed.targetIndex ?? 0;
      // Open on the region named "baseline" when the file has one (Tony, 2026-11-16);
      // the whole recording otherwise.
      const b = analysisWindows(parsed).findIndex((w, i) => i > 0 && /^baseline$/i.test(w.name.trim()));
      windowIdx = b > 0 ? b : 0;
    } catch (e) {
      rec = null;
      result = null;
      loadError = `${name}: ${e?.message ?? e}`;
    } finally {
      busy = false;
    }
  }

  async function pick(name) {
    if (!name) return;
    busy = true;
    try {
      const r = await fetch('/__lab/raw-file?name=' + encodeURIComponent(name));
      if (!r.ok) throw new Error(await r.text());
      await take(await r.text(), name);
    } catch (e) {
      loadError = `${name}: ${e?.message ?? e}`;
      busy = false;
    }
  }

  async function openFile(e) {
    const f = e.currentTarget.files?.[0];
    if (f) await take(await f.text(), f.name);
  }

  function step(delta) {
    const i = files.indexOf(fileName);
    const next = files[i + delta];
    if (next) pick(next);
  }

  const windows = $derived(rec ? analysisWindows(rec) : []);

  // ---- review verdicts (kernel_review.tsv beside the recordings; see verdicts.js) ----
  let verdictRows = $state.raw([]);
  let verdictError = $state(null);
  let saving = $state(false);
  let note = $state('');

  async function loadVerdicts() {
    try {
      const r = await fetch('/__lab/raw-verdicts');
      verdictRows = parseVerdicts(await r.text());
      verdictError = null;
    } catch (e) {
      verdictError = String(e?.message ?? e);
    }
  }
  loadVerdicts();

  const reviewKey = $derived(
    rec && windows[windowIdx]
      ? verdictKey({ slice_id: rec.sliceId, roi: rec.rois[roiIndex].label, window: windows[windowIdx].name })
      : null,
  );
  const verdict = $derived(reviewKey ? currentVerdict(verdictRows, reviewKey) : null);
  const stale = $derived(verdict ? isStale(verdict, rec?.spikes?.source) : false);
  // The note box follows the kernel on screen: it shows the saved note, or is empty.
  $effect(() => {
    note = verdict?.note ?? '';
  });

  async function saveVerdict(v) {
    const w = windows[windowIdx];
    const src = rec.spikes?.source ?? {};
    saving = true;
    verdictError = null;
    try {
      const r = await fetch('/__lab/raw-verdicts', {
        method: 'POST',
        body: JSON.stringify({
          slice_id: rec.sliceId, roi: rec.rois[roiIndex].label, window: w.name,
          start_s: w.startS, end_s: w.endS,
          spike_cell: src.cell ?? '', spike_revision: src.revision ?? '', spike_sha256: src.sha256 ?? '',
          verdict: v, note,
        }),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(text);
      // What comes back is the file as read from disk after the write.
      verdictRows = parseVerdicts(text);
    } catch (e) {
      verdictError = `NOT SAVED: ${e?.message ?? e}`;
    } finally {
      saving = false;
    }
  }

  // Recompute off the click, so the controls repaint before a long window blocks the thread.
  $effect(() => {
    const r = rec;
    const w = windows[windowIdx];
    const args = { roiIndex, startS: w?.startS, endS: w?.endS, lambda: Number(lambda), pensubK: Number(pensubK) };
    if (!r || !w || !(args.lambda >= 0) || !Number.isFinite(args.pensubK)) return;
    computing = true;
    computeError = null;
    const id = setTimeout(() => {
      try {
        result = analyzeVariants(r, args);
      } catch (e) {
        result = null;
        computeError = String(e?.message ?? e);
      }
      computing = false;
    }, 20);
    return () => clearTimeout(id);
  });

  const shown = $derived(result ? result.variants.filter((v) => v.analyzable && !hidden[v.id]) : []);

  const kernelOf = (v) => (method === 'fv' ? v.fv.kernel : method === 'pm' ? v.pm.kernel : v.shaped.kernel);
  const scale = (ys) => (unitPeak ? normalizeUnitPeak(ys) : Array.from(ys));

  const kernelBand = $derived.by(() => {
    if (!shown.length) return null;
    const k0 = kernelOf(shown[0]);
    const lag = Array.from(k0.times ?? k0.samples.map((_, i) => (i - k0.zeroIndex) * k0.dt));
    const series = shown.map((v) => ({ ys: scale(kernelOf(v).samples), stroke: COLORS[v.id], width: 2 }));
    if (rec?.truth && rec.truth.kernel.samples.length === lag.length) {
      series.push({ ys: scale(rec.truth.kernel.samples), stroke: TRUTH_COLOR, width: 1.5, dash: [6, 4] });
    }
    return { lag, series };
  });

  const staBand = $derived.by(() => {
    const ok = shown.filter((v) => v.sta && !v.sta.empty);
    if (!ok.length) return null;
    return {
      lag: Array.from(ok[0].sta.times),
      series: ok.map((v) => ({ ys: scale(v.sta.samples), stroke: COLORS[v.id], width: 2 })),
    };
  });

  const traceBand = $derived.by(() => {
    if (!shown.length) return null;
    return {
      xs: Array.from(result.times),
      series: shown.map((v) => ({ ys: Array.from(v.samples, (x) => (Number.isFinite(x) ? x : null)), stroke: COLORS[v.id], width: 1 })),
    };
  });

  const rawBand = $derived.by(() => {
    if (!result || !rec) return null;
    const { i0, i1 } = result.window;
    const col = (m) => Array.from(roiColumn(m, rec.nFrames, roiIndex).subarray(i0, i1));
    const series = [{ ys: col(rec.traces.raw_soma), stroke: SOMA_COLOR, width: 1 }];
    if (rec.traces.raw_pen) series.push({ ys: col(rec.traces.raw_pen), stroke: PEN_COLOR, width: 1 });
    const f0 = result.variants.find((v) => v.id === 'dff')?.f0;
    if (f0) series.push({ ys: Array.from(f0), stroke: COLORS.dff, width: 1.5 });
    return { xs: Array.from(result.times), series, hasPen: !!rec.traces.raw_pen };
  });

  const xRange = $derived(result ? [result.window.startS, result.window.endS] : null);

  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const row = (v) => {
    const m = method === 'fv' ? v.fv : method === 'pm' ? v.pm : v.shaped;
    const t = v.truth ? v.truth[method] : null;
    return { m, t };
  };

  // ---- folding: every block can be put away so the ones being read get the room ----
  // Vertical blocks fold to their heading; the controls rail and the two lag panels fold
  // sideways to a strip. Height given up by a folded block goes to the plots still open.
  let fold = $state({});
  const flip = (k) => (fold = { ...fold, [k]: !fold[k] });
  const BANDS = ['raw', 'traces', 'spikes'];
  // The time bands share one x-axis, drawn once, on the lowest band that is open.
  const lastBand = $derived(BANDS.findLast((k) => !fold[k]) ?? null);
  const lagOpen = $derived(!fold.kernel || !fold.sta);
  const lagHeight = $derived(
    300 + (fold.table ? 120 : 0) + (fold.raw ? 150 : 0) + (fold.traces ? 170 : 0) + (fold.spikes ? 110 : 0),
  );
  const bandBoost = $derived((lagOpen ? 0 : 140) + (fold.table ? 50 : 0));
  const bandHeight = (k, base) => base + (k === 'spikes' ? 0 : bandBoost) + (lastBand === k && k !== 'spikes' ? 44 : 0);
  // Kernel and STA are drawn on the SAME lag axis. The STA is only computed out to +/-2 s
  // (ADR-0005), so its curve stops short of the frame; the frame is the kernel's.
  const LAG_RANGE = [-5, 5];
  // ...and on the SAME amplitude axis: one range covering every curve drawn in either panel,
  // so a height read off one panel is the same height in the other.
  const lagYRange = $derived.by(() => {
    let lo = 0;
    let hi = 0;
    for (const band of [fold.kernel ? null : kernelBand, fold.sta ? null : staBand]) {
      for (const sr of band?.series ?? []) {
        for (const v of sr.ys) {
          if (v == null || !Number.isFinite(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (hi === lo) return null;
    const pad = 0.06 * (hi - lo);
    return [lo - pad, hi + pad];
  });

  function tableTsv() {
    if (!result) return '';
    const head = ['slice_id', 'roi', 'window', 'start_s', 'end_s', 'n_spikes', 'method', 'variant', 'peak_lag_s', 'peak_amp', 'tau_decay_s', 'acausal_ratio', 'r2', 'sta_peak_lag_s', 'sta_peak_amp', 'sta_n_accepted'];
    const w = windows[windowIdx];
    const lines = [head.join('\t')];
    for (const v of result.variants) {
      if (!v.analyzable) continue;
      for (const { id } of METHODS) {
        const m = id === 'fv' ? v.fv : id === 'pm' ? v.pm : v.shaped;
        lines.push([
          rec.sliceId, rec.rois[roiIndex].label, w.name, result.window.startS, result.window.endS, result.spikeTimes.length,
          id, v.id, m.peakLagS, m.peakAmp, m.tauDecayS, m.acausalRatio, m.r2,
          v.agreement.staPeakLagS, v.agreement.staPeakAmp, v.agreement.nAccepted,
        ].join('\t'));
      }
    }
    return lines.join('\n') + '\n';
  }

  function download() {
    const w = windows[windowIdx];
    const blob = new Blob([tableTsv()], { type: 'text/tab-separated-values' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${rec.sliceId}_${rec.rois[roiIndex].label}_${w.name.replace(/[^A-Za-z0-9]+/g, '-')}_kernels-by-extraction.tsv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

{#snippet head(key, title)}
  <button class="foldhead" aria-expanded={!fold[key]} onclick={() => flip(key)}>
    <span class="chev">{fold[key] ? '▸' : '▾'}</span>{title}
  </button>
{/snippet}
{#snippet strip(key, title)}
  <button class="foldstrip" aria-expanded="false" title={`show ${title}`} onclick={() => flip(key)}>
    <span class="chev">▸</span><span class="vert">{title}</span>
  </button>
{/snippet}

<div class="labpage">
  {#if fold.rail}
    {@render strip('rail', 'controls')}
  {/if}
  <aside class="rail" class:gone={fold.rail}>
    <button class="foldhead" aria-expanded="true" onclick={() => flip('rail')}><span class="chev">◂</span>hide controls</button>
    <p class="tag">lab only · dev server only</p>
    <h2>Kernels by extraction</h2>

    <label class="field">
      <span>recording {#if dirLabel}<em>({dirLabel})</em>{/if}</span>
      {#if missing}
        <span class="note">no folder to list; open a file below</span>
      {:else}
        <select value={files.includes(fileName) ? fileName : ''} disabled={busy} onchange={(e) => pick(e.currentTarget.value)}>
          <option value="">{files.length ? `${files.length} lab recordings…` : 'no .klab.json files found'}</option>
          {#each files as f (f)}<option value={f}>{f.replace(/\.klab\.json$/i, '')}</option>{/each}
        </select>
      {/if}
    </label>
    <div class="steps">
      <button disabled={busy || files.indexOf(fileName) <= 0} onclick={() => step(-1)}>← previous</button>
      <button disabled={busy || files.indexOf(fileName) < 0 || files.indexOf(fileName) >= files.length - 1} onclick={() => step(1)}>next →</button>
    </div>
    <label class="field">
      <span>or open a .klab.json file</span>
      <input type="file" accept=".json" onchange={openFile} />
    </label>

    {#if rec}
      <label class="field">
        <span>ROI</span>
        <select bind:value={roiIndex}>
          {#each rec.rois as r, i (i)}
            <option value={i}>{r.label}{i === rec.targetIndex ? ' — loose-patch cell' : ''}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>window</span>
        <select bind:value={windowIdx}>
          {#each windows as w, i (i)}
            <option value={i}>{w.name} ({(w.startS / 60).toFixed(1)}–{(w.endS / 60).toFixed(1)} min)</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>recovery method drawn</span>
        <select bind:value={method}>
          {#each METHODS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="check"><input type="checkbox" bind:checked={unitPeak} /> scale every curve to unit peak (shape only)</label>
      <label class="field">
        <span>free-vector λ</span>
        <input type="number" min="0" step="0.001" bind:value={lambda} />
      </label>
      <label class="field">
        <span>penumbra coefficient k (production {PENSUB_K})</span>
        <input type="number" step="0.05" bind:value={pensubK} />
      </label>

      {#if result}
        <fieldset class="legend">
          <legend>extractions</legend>
          {#each result.variants as v (v.id)}
            <label class="check" title={v.steps.join(' → ')}>
              <input type="checkbox" checked={!hidden[v.id]} onchange={(e) => (hidden = { ...hidden, [v.id]: !e.currentTarget.checked })} />
              <span class="swatch" style:--c={COLORS[v.id]}></span>
              {v.label}
            </label>
          {/each}
          {#if rec.truth}
            <p class="check"><span class="swatch dashed" style:--c={TRUTH_COLOR}></span> planted kernel (simulation)</p>
          {/if}
        </fieldset>
        <button onclick={download}>Download this table (TSV)</button>
      {/if}
    {/if}
  </aside>

  <section class="main">
    {#if loadError}<p class="err">{loadError}</p>{/if}
    {#if !rec}
      <p class="empty">
        Pick a lab recording. This page reads <code>.klab.json</code> files (raw soma and penumbra
        fluorescence, spike times, regions) from the folder the dev server was started on.
        <code>npm run lab-fixture</code> writes a simulated one into <code>exports/</code>.
      </p>
    {:else}
      <header class="facts">
        <strong>{rec.sliceId}</strong>
        {#if rec.cohort}<span>{rec.cohort}</span>{/if}
        <span>{rec.nRoi} ROIs · {(rec.nFrames * rec.dt / 60).toFixed(1)} min at {(1 / rec.dt).toFixed(0)} Hz</span>
        {#if result}
          <span>{result.spikeTimes.length} spikes in window</span>
          {#if result.masked.nFrames}<span>{result.masked.nFrames} frames masked</span>{/if}
        {/if}
        {#if rec.spikes.present}
          <span>spikes: {rec.spikes.source?.cell ?? '?'}{rec.spikes.source?.revision != null ? ` r${rec.spikes.source.revision}` : ''}, reviewed: {String(rec.spikes.source?.reviewed ?? 'not recorded')}</span>
        {/if}
        {#if computing}<span class="busy">computing…</span>{/if}
      </header>
      {#if rec.warnings.length}
        {@render head('notes', `Notes on this file (${rec.warnings.length})`)}
        {#if !fold.notes}
          <ul class="warnings">{#each rec.warnings as w (w)}<li>{w}</li>{/each}</ul>
        {/if}
      {/if}
      {#if computeError}<p class="err">{computeError}</p>{/if}

      {#if result && !result.variants.some((v) => v.analyzable)}
        <p class="err">{result.variants[0]?.reason}</p>
      {/if}

      {#if result && shown.length}
        {@render head('review', `Your verdict on this kernel${fold.review ? `: ${verdict ? verdict.verdict + (stale ? ' (stale)' : '') : 'none saved'}` : ''}`)}
        <div class="review" class:stale class:gone={fold.review}>
          {#each VERDICTS as v (v)}
            <button class:on={verdict?.verdict === v && !stale} disabled={saving} onclick={() => saveVerdict(v)}>{v}</button>
          {/each}
          <input class="notebox" type="text" placeholder="note (saved with the verdict)" bind:value={note} />
          {#if verdict}
            <span class="saved">
              saved: <b>{verdict.verdict}</b> at {verdict.time_utc.slice(0, 16).replace('T', ' ')} UTC
              {#if stale} — <b>stale</b>: given on spike file {verdict.spike_cell || '?'}{verdict.spike_revision ? ` r${verdict.spike_revision}` : ''}, not the one loaded{/if}
            </span>
          {:else}
            <span class="saved">none saved for this ROI and window</span>
          {/if}
          <span class="where">{VERDICT_FILE} in {dirLabel || 'the recordings folder'}</span>
          {#if verdictError}<span class="err">{verdictError}</span>{/if}
        </div>

        <div class="lagrow" class:konly={fold.sta && !fold.kernel} class:sonly={fold.kernel && !fold.sta} class:none={fold.kernel && fold.sta}>
          {#if fold.kernel}
            {#if fold.sta}{@render head('kernel', 'Recovered kernel')}{:else}{@render strip('kernel', 'recovered kernel')}{/if}
          {:else}
            <div class="panel">
              {@render head('kernel', `Recovered kernel, ${METHODS.find((m) => m.id === method).label}`)}
              {#key `${kernelBand.series.length}-${method}-${dark}-${lagHeight}`}
                <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={kernelBand.lag} seriesList={kernelBand.series} xRange={LAG_RANGE} yRange={lagYRange} yAxisSize={56} padRight={16}
                  cursorPoints={false} zeroLine xLabel="lag (s)" yLabel={unitPeak ? 'amplitude (peak = 1)' : 'amplitude (dF/F₀ per spike)'} height={lagHeight} />
              {/key}
            </div>
          {/if}
          {#if fold.sta}
            {#if fold.kernel}{@render head('sta', 'Spike-triggered average')}{:else}{@render strip('sta', 'spike-triggered average')}{/if}
          {:else}
            <div class="panel">
              {@render head('sta', 'Spike-triggered average (computed to ±2 s; same axes as the kernel)')}
              {#if staBand}
                {#key `${staBand.series.length}-${dark}-${lagHeight}`}
                  <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={staBand.lag} seriesList={staBand.series} xRange={LAG_RANGE} yRange={lagYRange} yAxisSize={56} padRight={16} cursorPoints={false} zeroLine
                    xLabel="lag (s)" yLabel={unitPeak ? 'amplitude (peak = 1)' : 'amplitude (dF/F₀)'} height={lagHeight} />
                {/key}
              {:else}
                <p class="note">no spike passed the STA's overlap rule in this window</p>
              {/if}
            </div>
          {/if}
        </div>

        {@render head('table', 'Diagnostics by extraction')}
        <div class:gone={fold.table}>
        <table>
          <thead>
            <tr>
              <th>extraction</th><th>peak lag (s)</th><th>peak amp</th><th>τ decay (s)</th><th>acausal ratio</th><th>R²</th>
              <th>STA peak lag (s)</th><th>STA peak amp</th><th>STA events</th>
              {#if rec.truth}<th>amp ÷ planted</th><th>shape RMS vs planted</th>{/if}
            </tr>
          </thead>
          <tbody>
            {#each result.variants as v (v.id)}
              {#if v.analyzable}
                {@const r = row(v)}
                <tr class:dim={hidden[v.id]}>
                  <td title={v.steps.join(' → ')}><span class="swatch" style:--c={COLORS[v.id]}></span> {v.label}</td>
                  <td>{fmt(r.m.peakLagS)}</td><td>{fmt(r.m.peakAmp, 4)}</td><td>{fmt(r.m.tauDecayS)}</td>
                  <td>{fmt(r.m.acausalRatio, 3)}</td><td>{fmt(r.m.r2, 3)}</td>
                  <td>{fmt(v.agreement.staPeakLagS)}</td><td>{fmt(v.agreement.staPeakAmp, 4)}</td>
                  <td>{v.agreement.nAccepted} of {v.agreement.nEvents}</td>
                  {#if rec.truth}<td>{fmt(r.t?.ampRatio)}</td><td>{fmt(r.t?.shapeRms, 3)}</td>{/if}
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
        <p class="note">
          Numbers are reported, not judged. "F0 held constant" rows are raw fluorescence under one offset and one
          gain; each differs from the row below it only in whether F0 moves with time.
        </p>
        </div>

        <div class="bands">
          {@render head('raw', `Raw fluorescence: soma (strong line)${rawBand.hasPen ? ', penumbra (faint line)' : ''}, running-minimum F0 of soma (orange)`)}
          {#if !fold.raw}
            {#key `${rawBand.series.length}-${dark}-${lastBand}-${bandBoost}`}
              <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={rawBand.xs} seriesList={rawBand.series} {xRange} yAxisSize={56} padRight={16}
                timeTicks showXAxis={lastBand === 'raw'} xLabel={lastBand === 'raw' ? 'time' : ''}
                syncKey="labx" cursorPoints={false} yLabel="F (camera units)" height={bandHeight('raw', 170)} />
            {/key}
          {/if}
          {@render head('traces', 'Extracted traces, as recovery saw them')}
          {#if !fold.traces}
            {#key `${traceBand.series.length}-${dark}-${lastBand}-${bandBoost}`}
              <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={traceBand.xs} seriesList={traceBand.series} {xRange} yAxisSize={56} padRight={16}
                timeTicks showXAxis={lastBand === 'traces'} xLabel={lastBand === 'traces' ? 'time' : ''}
                syncKey="labx" cursorPoints={false} zeroLine yLabel="dF/F₀" height={bandHeight('traces', 190)} />
            {/key}
          {/if}
          {@render head('spikes', 'Spikes per imaging frame')}
          {#if !fold.spikes}
            {#key dark}
              <Plot axisColor="var(--text-h)" gridColor="var(--border)" xs={Array.from(result.times)} ys={Array.from(result.spikeCounts)} kind="stems" color="var(--series-spikes)"
                {xRange} yAxisSize={56} padRight={16} syncKey="labx" timeTicks xLabel="time" yLabel="spikes" height={140} />
            {/key}
          {/if}
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .labpage {
    display: flex;
    gap: 18px;
    flex: 1;
    min-height: 0;
    overflow: auto;
    font-size: 14px;
  }
  .rail {
    flex: 0 0 290px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px dashed var(--text);
    border-radius: 8px;
    padding: 12px;
    align-self: flex-start;
  }
  .tag {
    margin: 0;
    font: 11px var(--mono);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  h2 { margin: 0; font-size: 18px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field span { font-size: 12px; }
  .field select, .field input { font: inherit; max-width: 100%; }
  .check { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; line-height: 1.3; }
  .steps { display: flex; gap: 6px; }
  .steps button { flex: 1; font: inherit; }
  .legend { border: 1px solid var(--border, #ccc); border-radius: 6px; display: flex; flex-direction: column; gap: 6px; padding: 8px; }
  .swatch { display: inline-block; flex: none; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; }
  .swatch.dashed { border-top-style: dashed; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: baseline; }
  .busy { font-style: italic; }
  .warnings { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .err { color: #b00020; margin: 0; }
  @media (prefers-color-scheme: dark) {
    .err { color: #ff8a8a; }
  }
  .labpage { color: var(--text-h); }
  .field select, .field input[type='number'], .steps button, .rail > button {
    color: var(--text-h);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .note, .empty { font-size: 12.5px; margin: 2px 0; }
  .review { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }
  .review.stale { border-style: dashed; }
  .review button { font: inherit; padding: 2px 12px; color: var(--text-h); background: var(--bg); border: 1px solid var(--text); border-radius: 4px; cursor: pointer; }
  .review button.on { background: var(--accent-bg); border-color: var(--accent); font-weight: 600; }
  .notebox { flex: 1 1 220px; font: inherit; color: var(--text-h); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; }
  .saved { font-size: 12.5px; }
  .where { font: 11px var(--mono); color: var(--text); }
  .gone { display: none !important; }
  .foldhead {
    display: flex; align-items: center; gap: 6px; width: 100%; margin: 8px 0 2px; padding: 2px 0;
    font: 600 13px var(--sans); text-align: left; color: var(--text-h);
    background: none; border: 0; border-bottom: 1px solid var(--border); cursor: pointer;
  }
  .rail > .foldhead { margin-top: 0; font-weight: 400; font-size: 12px; }
  .chev { flex: none; width: 14px; font-size: 11px; }
  .foldstrip {
    flex: none; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 30px; padding: 8px 0;
    font: 600 12px var(--sans); color: var(--text-h);
    background: none; border: 1px dashed var(--text); border-radius: 6px; cursor: pointer; align-self: stretch;
  }
  .vert { writing-mode: vertical-rl; }
  .lagrow { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .lagrow.konly { grid-template-columns: 1fr 30px; }
  .lagrow.sonly { grid-template-columns: 30px 1fr; }
  .lagrow.none { grid-template-columns: 1fr; gap: 0; }
  .panel { min-width: 0; }
  table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
  th, td { text-align: right; padding: 3px 8px; border-bottom: 1px solid var(--border, #ddd); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; white-space: normal; }
  tr.dim { opacity: 0.45; }
  .bands { display: flex; flex-direction: column; }
</style>
