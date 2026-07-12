<script>
  import Plot from './lib/Plot.svelte';
  import Tab2 from './lib/Tab2.svelte';
  import Shell from './lib/Shell.svelte';
  import Help from './lib/Help.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    defaultParams,
    convolveOnGrid,
    KERNEL_LIBRARY,
    NOISE_LEVEL_MAX,
    sigmaForLevel,
    addAWGN,
    mulberry32,
  } from './lib/core/index.js';

  // --- tab selection ---
  // First-time landing is Tab 0 (Start here) — the accessible on-ramp for naive
  // users. Direct/screenshot links still work: #tab1 / #tab2 (and #tab0/#help)
  // pick their tab explicitly.
  function initialTab() {
    if (typeof location === 'undefined') return 0;
    const h = location.hash.replace('#', '');
    if (h === 'tab2') return 2;
    if (h === 'tab1') return 1;
    if (h === 'tab0' || h === 'help' || h === 'start') return 0;
    return 0;
  }
  let tab = $state(initialTab());

  // --- controls (FOUNDATIONS §11) ---
  // Surfaced by default: place spikes, shape the kernel, see the output.
  // Advanced (collapsed): the global timebase.
  const SPIKE_RATE_HZ = 0.1; // default input: a random Poisson spike train at 0.1 Hz
  const DEFAULT_DURATION = 300; // s — a realistic recording-length window
  const DEFAULT_RATE = 10; // Hz — a typical calcium-imaging frame rate

  // Random Poisson spike train (exponential inter-spike intervals, mean 1/rate),
  // formatted for the spikes text box. Seeded so the default is reproducible and the
  // "randomize" button draws a fresh-but-stable train (same idiom as the noise reseed).
  function randomSpikeText(rateHz, durationS, seed) {
    const rand = mulberry32(seed);
    const out = [];
    let t = 0;
    for (let guard = 0; guard < 100000; guard++) {
      t += -Math.log(1 - rand()) / rateHz;
      if (t >= durationS) break;
      out.push(t.toFixed(1));
    }
    return out.join(', ');
  }

  let spikeSeed = $state(7);
  let spikesText = $state(randomSpikeText(SPIKE_RATE_HZ, DEFAULT_DURATION, 7));
  let sampleRate = $state(DEFAULT_RATE);
  let duration = $state(DEFAULT_DURATION);

  function randomizeSpikes() {
    spikeSeed = (spikeSeed + 1) | 0;
    spikesText = randomSpikeText(SPIKE_RATE_HZ, duration, spikeSeed);
  }
  let kernelId = $state('calcium');
  let params = $state(defaultParams('calcium'));
  // Shared width preference for the plot shell (both tabs). false = capped (1600px),
  // true = full-bleed. A view pref only; lives here so Tab 1 and Tab 2 obey one toggle.
  let wide = $state(false);
  // Kernel peak height in dF/F₀ (ADR-0031 follow-up). Builders emit a peak-1
  // shape; this scales it to a realistic transient height so the imported
  // measurement noise (σ ≈ 0.0024 dF/F₀, ADR-0015) actually bites. Universal to
  // all shapes, so it lives here — not per-kernel — and survives a shape switch.
  let kernelAmp = $state(0.1);
  // Kernel display half-window (s), user-settable. Was derived from the kernel's own support
  // (~2 s for the calcium default → looked "cropped at 2 s"); now an explicit ±window, default
  // ±5 s, zero-padded past the kernel's support. Also sets the extent of the source-kernel
  // overlay carried into Tab 2 (ADR-0034).
  let kernelWinS = $state(5);

  // Measurement-noise tool (ADR-0031): AWGN injected on the convolution OUTPUT
  // (measurement noise on the synthesized dF/F₀ trace), calibrated in cohort-typical
  // σ units per ADR-0015. Default 0/off so a learner sees the clean case first (§11.2).
  let noiseLevel = $state(0); // 0 … NOISE_LEVEL_MAX, cohort-typical σ multiples
  let noiseSeed = $state(1); // reseed → new realization; stable across unrelated re-renders

  function selectKernel(id) {
    kernelId = id;
    params = defaultParams(id); // reset params to the new shape's defaults
  }

  // --- derived pipeline (all live) ---
  const spikeTimes = $derived(
    spikesText
      .split(/[\s,]+/)
      .map(Number)
      .filter((t) => Number.isFinite(t)),
  );
  const grid = $derived(makeGrid({ sampleRate, duration }));
  const raster = $derived(rasterize(spikeTimes, grid)); // snap + unit
  const kernel = $derived(buildKernel(kernelId, params, grid.dt, kernelAmp));
  const output = $derived(convolveOnGrid(raster.samples, grid, kernel));

  const kernelEntry = $derived(KERNEL_LIBRARY.find((k) => k.id === kernelId));
  const gridTimes = $derived(Array.from(grid.times));
  const rasterSamples = $derived(Array.from(raster.samples));
  const outTimes = $derived(Array.from(output.times));
  const outValues = $derived(Array.from(output.samples));

  // --- measurement noise (ADR-0031) ---
  const sigma = $derived(sigmaForLevel(noiseLevel));

  // Noisy realization of the OUTPUT. Null when off, so the overlay disappears at
  // level 0 and the output band is byte-for-byte what it is today. Seeded, so moving
  // an unrelated control never reshuffles the noise — only a reseed or level change
  // draws a new realization. Recomputes on output.samples / noiseLevel / noiseSeed.
  const noisyOut = $derived.by(() =>
    sigma > 0 ? Array.from(addAWGN(output.samples, sigma, mulberry32(noiseSeed))) : null,
  );

  // SNR = peak of the CLEAN output / σ. Loop over samples (don't spread a big array
  // into Math.max). Honest & teachable: a taller kernel raises the peak → raises SNR.
  const signalPeak = $derived.by(() => {
    let m = 0;
    for (const v of output.samples) {
      const a = Math.abs(v);
      if (a > m) m = a;
    }
    return m;
  });
  const snr = $derived(sigma > 0 && signalPeak > 0 ? signalPeak / sigma : Infinity);

  // --- Tab 1 → Tab 2 handoff (FOUNDATIONS §11.3: one signal flowing through the tabs) ---
  // The whole reason this is a "ground-truth kernel-verification instrument": author a known
  // kernel + spikes here, hand the synthesized fluorescence (noisy if noise is on) + the known
  // spike times to Tab 2, and see whether recovery gets the kernel back. We build a CSV in
  // memory and feed Tab 2's *existing* loadCsv path — identical to a real file load, no new
  // ingestion code. output.times (not grid.times) carries the fluorescence: the convolution
  // tail can extend past the window, and time + trace must share one length.
  let handoff = $state(null);
  function buildHandoffCsv() {
    const t = outTimes;
    const y = noisyOut ?? outValues; // measurement fluorescence = noisy realization when noise is on
    const sp = spikeTimes;
    const rows = ['time,spikes,dFF0'];
    for (let i = 0; i < t.length; i++) {
      rows.push(`${t[i]},${i < sp.length ? sp[i] : ''},${y[i]}`);
    }
    return rows.join('\n');
  }
  // Entering Tab 2 loads the CURRENT Tab 1 signal by default (FOUNDATIONS §11.3): rebuild the
  // synthetic recording and switch. Each entry carries a fresh monotonic id so Tab 2 reliably
  // reloads it exactly once; a file dropped in Tab 2 overrides it until Tab 2 is re-entered.
  // The known (ground-truth) kernel rides along on its lag axis for the source-vs-recovered
  // overlay (ADR-0034).
  let handoffSeq = 0;
  function goToTab2() {
    handoff = {
      id: ++handoffSeq,
      csv: buildHandoffCsv(),
      label: 'Tab 1 (synthetic)',
      noisy: noiseLevel > 0,
      sourceKernel: { lag: kernelDisplay.t, samples: kernelDisplay.v },
    };
    tab = 2;
  }
  // Tab 0 "Open Tab N" buttons. Tab 2 must go through goToTab2() so it loads the
  // current Tab 1 signal (the handoff); any other tab is a plain switch.
  function navFromHelp(n) {
    if (n === 2) goToTab2();
    else tab = n;
  }

  // --- presentation transforms (core untouched) ---

  // View-only x-zoom (ADR-0030), mirroring Tab 2's coupled zoom. A drag on EITHER
  // recording-time band emits onZoom(min,max); the parent holds ONE shared window and
  // feeds it back to BOTH bands so they zoom together. uPlot's per-plot native zoom is
  // disabled (Plot.svelte) — it would zoom only the dragged band and shear the pair.
  // Double-click restores full view. Zoom never recomputes anything; it only reframes x.
  let zoomRange = $state(null); // [min,max] recording-time s, or null = full
  function handleZoom(min, max) {
    zoomRange = min == null ? null : [min, max];
  }

  // Equal right-edge padding on BOTH recording-time bands. uPlot only auto-reserves
  // right-edge space when an x-axis is shown (for the last tick label); the spike band
  // hides its x-axis and the output band shows it, so without this their plot areas
  // shear and a spike no longer drops straight onto its response. Pinning an identical
  // padRight forces identical right edges (same co-registration Tab 2 uses, ADR-0026).
  const PLOT_PAD_R = 32;

  // Spike train and output share ONE recording-time x-axis so the eye drops
  // straight down from a spike to where its response begins. Use the union of
  // both ranges so the kernel tail past the window isn't clipped.
  const leftXRange = $derived.by(() => {
    const min = Math.min(gridTimes[0] ?? 0, outTimes[0] ?? 0);
    const max = Math.max(gridTimes[gridTimes.length - 1] ?? 1, outTimes[outTimes.length - 1] ?? 1);
    return [min, max];
  });
  // Effective x-window fed to both bands: the zoom window when set, else the full union.
  const xView = $derived(zoomRange ?? leftXRange);

  // The kernel is an operator on LAG, not a signal on the recording timebase.
  // Display it on its own symmetric ±win axis centered on lag 0, matching how
  // Tab 2 shows recovered kernels (ADR-0004). Causal kernels fill the positive
  // half and sit flat at zero on the negative side — that teaches causality, so
  // pad with zeros rather than cropping to causal-only.
  const kernelDisplay = $derived.by(() => {
    const L = kernel.samples.length;
    const origin = kernel.zeroIndex;
    const win = Math.max(1, Math.round(kernelWinS / grid.dt)); // half-window in samples (user-set ±window)
    const len = 2 * win + 1;
    const t = new Array(len);
    const v = new Array(len);
    for (let oi = 0; oi < len; oi++) {
      const lagSamp = oi - win;
      const ki = origin + lagSamp;
      t[oi] = lagSamp * grid.dt;
      v[oi] = ki >= 0 && ki < L ? kernel.samples[ki] : 0;
    }
    return { t, v, winSeconds: win * grid.dt };
  });
  const kernelXRange = $derived([-kernelDisplay.winSeconds, kernelDisplay.winSeconds]);
</script>

<main class="appmain">
  <nav class="tabs">
    <button class:active={tab === 0} onclick={() => (tab = 0)} title="What this tool is + the mathematical reference">0 · Start here</button>
    <button class:active={tab === 1} onclick={() => (tab = 1)}>1 · Convolution</button>
    <button class:active={tab === 2} onclick={goToTab2} title="loads the current Tab 1 signal for recovery">2 · Kernel recovery</button>
    <!-- Shared plot-width preference — both tabs obey it (2026-07-03 layout unification). -->
    <button class="widthbtn" onclick={() => (wide = !wide)} title="Toggle plot width">
      {wide ? '▥ Fit width' : '▤ Full width'}
    </button>
  </nav>

  {#if tab === 0}
    <Help onNavigate={navFromHelp} />
  {:else if tab === 2}
    <Tab2 {wide} {handoff} />
  {:else}
    <Shell {wide}>
      <!-- LEFT RAIL — tools (was the top controls card; folded into the 20% rail). -->
      {#snippet rail()}
        <div class="rail-title">
          <strong>Tab 1 · Forward convolution</strong>
          <span>output = input ⊗ kernel</span>
        </div>

        <div class="field">
          <div class="field-h">
            <label for="spikes">Spike times (seconds)</label>
            <button type="button" class="minibtn" onclick={randomizeSpikes}>↻ random 0.1 Hz</button>
          </div>
          <input id="spikes" type="text" bind:value={spikesText} spellcheck="false" />
          <p class="hint">
            {raster.placed} placed{#if raster.dropped}, {raster.dropped} outside window{/if}{#if raster.collisions}, {raster.collisions}
              collision{raster.collisions > 1 ? 's' : ''} clamped (unit amplitude){/if}
          </p>
        </div>

        <div class="field">
          <label for="kernel">Kernel</label>
          <select id="kernel" value={kernelId} onchange={(e) => selectKernel(e.currentTarget.value)}>
            {#each KERNEL_LIBRARY as k}
              <option value={k.id}>{k.label}</option>
            {/each}
          </select>
          <div class="params">
            {#each kernelEntry.params as p}
              <label class="slider">
                <span>{p.label}</span>
                <input type="range" min={p.min} max={p.max} step={p.step} bind:value={params[p.key]} />
                <output>{params[p.key]}</output>
              </label>
            {/each}
            <label class="slider">
              <span>peak (dF/F₀)</span>
              <input type="range" min="0.01" max="1" step="0.01" bind:value={kernelAmp} />
              <output>{kernelAmp.toFixed(2)}</output>
            </label>
            <label class="slider">
              <span>window ±(s)</span>
              <input type="range" min="1" max="10" step="0.5" bind:value={kernelWinS} />
              <output>{kernelWinS.toFixed(1)}</output>
            </label>
          </div>
        </div>

        <div class="field">
          <label for="noise">Measurement noise</label>
          <div class="params">
            <label class="slider">
              <span>Level</span>
              <input id="noise" type="range" min="0" max={NOISE_LEVEL_MAX} step="0.1" bind:value={noiseLevel} />
              <output>{noiseLevel.toFixed(1)}×</output>
            </label>
          </div>
          <div class="noise-readout">
            <button
              type="button"
              class="reseed"
              onclick={() => (noiseSeed = (noiseSeed + 1) | 0)}
              disabled={noiseLevel === 0}
            >
              Reseed
            </button>
          </div>
          <p class="hint">
            1× = cohort-typical baseline σ ≈ 0.0024 dF/F₀, measured across 39 recordings
            (ADR-0015). Faint trace = one noise realization added to the output; teal = clean
            input ⊗ kernel.
          </p>
        </div>

        <details class="advanced">
          <summary>Advanced — timebase (global)</summary>
          <div class="adv-grid">
            <label>
              <span>Sample rate (Hz)</span>
              <input type="number" min="1" max="2000" step="1" bind:value={sampleRate} />
            </label>
            <label>
              <span>Window length (s)</span>
              <input type="number" min="0.1" max="60" step="0.1" bind:value={duration} />
            </label>
          </div>
          <p class="hint">
            grid: {grid.n} samples · dt = {grid.dt.toFixed(4)} s · {grid.duration.toFixed(2)} s window
          </p>
        </details>
      {/snippet}

      <!-- SUMMARY — readouts beside the kernel (a time band here would break ADR-0030). -->
      {#snippet summary()}
        <div class="sum-eq">output = input ⊗ kernel</div>
        <div class="sum-sub">
          Synthesized dF/F₀ trace{#if noiseLevel > 0} with measurement noise (ADR-0031){/if}.
        </div>
        <div class="readouts">
          <div class="ro"><div class="k">Kernel peak</div><div class="v">{kernelAmp.toFixed(2)} <small>dF/F₀</small></div></div>
          <div class="ro"><div class="k">Noise σ</div><div class="v">{sigma.toFixed(4)} <small>dF/F₀</small></div></div>
          <div class="ro"><div class="k">SNR</div><div class="v">{noiseLevel === 0 ? 'clean' : Number.isFinite(snr) ? '≈ ' + Math.round(snr) : '—'}</div></div>
          <div class="ro"><div class="k">Spikes</div><div class="v">{raster.placed}</div></div>
        </div>
        <!-- FOUNDATIONS §11.3: this synthesized signal is what Tab 2 recovers by default (the
             ground-truth loop — the kernel is known, so recovery can be scored against it). -->
        <p class="sum-foot">Open <strong>Tab 2</strong> to recover this signal's kernel.</p>
      {/snippet}

      <!-- SQUARE KERNEL — the operator on its own ±lag axis (ADR-0004/0009). -->
      {#snippet kernelPanel()}
        <div class="sq-label">Kernel — lag (s)</div>
        <div class="sq-body">
          <Plot
            fill
            xs={kernelDisplay.t}
            ys={kernelDisplay.v}
            color="var(--accent)"
            xRange={kernelXRange}
            xLabel="lag (s)"
            zeroLine
          />
        </div>
      {/snippet}

      <!-- FULL-WIDTH TIME-COURSE BANDS — spike train + output, co-registered (ADR-0030). -->
      {#snippet bands()}
        <div class="band">
          <div class="band-head"><span class="plot-label">Input — spike train</span></div>
          <div class="band-body">
            <Plot
              fill
              xs={gridTimes}
              ys={rasterSamples}
              kind="stems"
              color="var(--text-h)"
              xRange={xView}
              yAxisSize={48}
              padRight={PLOT_PAD_R}
              syncKey="tab1-rec-x"
              cursorPoints={true}
              zoomable
              onZoom={handleZoom}
              dblClickReset
              showXAxis={false}
            />
          </div>
        </div>

        <div class="band">
          <div class="band-head">
            <span class="plot-label">Output — input ⊗ kernel</span>
            {#if noiseLevel > 0}<span class="caption">teal = clean · faint = noisy ({noiseLevel.toFixed(1)}× σ)</span>{/if}
          </div>
          <!-- uPlot fixes its series count at init (Plot.svelte): remount via {#key} only when
               the noisy overlay toggles across level 0. Reseeds / in-range level changes flow
               through setData. Co-registration with the spike band is prop-driven → survives the
               remount (ADR-0030). -->
          <div class="band-body">
            {#key noisyOut != null}
              <Plot
                fill
                xs={outTimes}
                ys={outValues}
                ys2={noisyOut}
                color="#2a9d8f"
                color2="var(--noise-trace)"
                xRange={xView}
                yAxisSize={48}
                padRight={PLOT_PAD_R}
                syncKey="tab1-rec-x"
                cursorPoints={true}
                zoomable
                onZoom={handleZoom}
                dblClickReset
                xLabel="time (s)"
              />
            {/key}
          </div>
        </div>
      {/snippet}
    </Shell>
  {/if}
</main>

<style>
  .appmain {
    height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px;
    text-align: left;
  }

  /* tab nav + width toggle */
  .tabs {
    display: flex;
    gap: 6px;
    align-items: center;
    flex: none;
  }
  .tabs button {
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    padding: 7px 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .tabs button.active {
    border-color: var(--accent);
    color: var(--text-h);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  }
  .widthbtn {
    margin-left: auto; /* push the width toggle to the right edge of the nav */
    font-family: var(--mono) !important;
    font-size: 13px !important;
  }

  /* --- rail (tools) --- */
  .rail-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .rail-title strong { font-size: 15px; color: var(--text-h); }
  .rail-title span { font-size: 11px; color: var(--text); font-family: var(--mono); }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-h {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .minibtn {
    font: inherit;
    font-size: 12px;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-weight: 500;
    cursor: pointer;
  }
  .minibtn:hover { text-decoration: underline; }
  label {
    font-size: 14px;
    color: var(--text-h);
    font-weight: 500;
  }
  input[type='text'],
  input[type='number'],
  select {
    font: inherit;
    font-size: 15px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text-h);
    width: 100%;
  }
  .hint { font-size: 13px; color: var(--text); }
  .params { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: 'lab out' 'rng rng';
    gap: 4px 8px;
    align-items: center;
    font-weight: 400;
  }
  .slider > span { grid-area: lab; font-size: 12.5px; }
  .slider > output { grid-area: out; font-family: var(--mono); font-size: 12px; text-align: right; }
  .slider > input { grid-area: rng; width: 100%; }
  .noise-readout { display: flex; align-items: center; gap: 12px; margin-top: 2px; }
  .reseed {
    font: inherit;
    font-size: 13px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text-h);
    cursor: pointer;
  }
  .reseed:disabled { opacity: 0.45; cursor: default; }
  .advanced summary { cursor: pointer; font-size: 14px; color: var(--text-h); }
  .adv-grid { display: flex; gap: 16px; margin: 12px 0 6px; flex-wrap: wrap; }
  .adv-grid label { display: flex; flex-direction: column; gap: 4px; font-weight: 400; }

  /* --- summary panel (beside the square kernel) --- */
  .sum-eq { font-family: var(--mono); font-size: 15px; color: var(--text-h); }
  .sum-sub { font-size: 12.5px; color: var(--text); margin-top: 3px; }
  .readouts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .ro { border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; }
  .ro .k { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text); }
  .ro .v {
    font-family: var(--mono);
    font-size: 19px;
    color: var(--text-h);
    margin-top: 3px;
    font-variant-numeric: tabular-nums;
  }
  .ro .v small { font-size: 11px; color: var(--text); }
  .sum-foot { margin-top: 14px; font-size: 12.5px; color: var(--text); }
  .sum-foot strong { color: var(--text-h); }

  /* --- square kernel inner --- */
  .sq-label { font-size: 12px; font-weight: 500; color: var(--text-h); margin-bottom: 4px; flex: none; }
  .sq-body { flex: 1; min-height: 0; }

  /* --- time-course bands --- */
  .band {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    background: var(--bg);
  }
  .band-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex: none;
  }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .caption { font-weight: 400; color: var(--text); font-size: 11px; }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }
</style>
