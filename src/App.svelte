<script>
  import Plot from './lib/Plot.svelte';
  import Tab2 from './lib/Tab2.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    defaultParams,
    convolveOnGrid,
    KERNEL_LIBRARY,
  } from './lib/core/index.js';

  // --- tab selection (initial tab honors #tab2 for direct/screenshot links) ---
  let tab = $state(
    typeof location !== 'undefined' && location.hash.replace('#', '') === 'tab2' ? 2 : 1,
  );

  // --- controls (FOUNDATIONS §11) ---
  // Surfaced by default: place spikes, shape the kernel, see the output.
  // Advanced (collapsed): the global timebase.
  let spikesText = $state('0.5, 1.0, 1.2');
  let sampleRate = $state(100);
  let duration = $state(2);
  let kernelId = $state('calcium');
  let params = $state(defaultParams('calcium'));

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
  const kernel = $derived(buildKernel(kernelId, params, grid.dt));
  const output = $derived(convolveOnGrid(raster.samples, grid, kernel));

  const kernelEntry = $derived(KERNEL_LIBRARY.find((k) => k.id === kernelId));
  const gridTimes = $derived(Array.from(grid.times));
  const rasterSamples = $derived(Array.from(raster.samples));
  const outTimes = $derived(Array.from(output.times));
  const outValues = $derived(Array.from(output.samples));

  // --- presentation transforms (core untouched) ---

  // Spike train and output share ONE recording-time x-axis so the eye drops
  // straight down from a spike to where its response begins. Use the union of
  // both ranges so the kernel tail past the window isn't clipped.
  const leftXRange = $derived.by(() => {
    const min = Math.min(gridTimes[0] ?? 0, outTimes[0] ?? 0);
    const max = Math.max(gridTimes[gridTimes.length - 1] ?? 1, outTimes[outTimes.length - 1] ?? 1);
    return [min, max];
  });

  // The kernel is an operator on LAG, not a signal on the recording timebase.
  // Display it on its own symmetric ±win axis centered on lag 0, matching how
  // Tab 2 shows recovered kernels (ADR-0004). Causal kernels fill the positive
  // half and sit flat at zero on the negative side — that teaches causality, so
  // pad with zeros rather than cropping to causal-only.
  const kernelDisplay = $derived.by(() => {
    const L = kernel.samples.length;
    const origin = kernel.zeroIndex;
    const win = Math.max(origin, L - 1 - origin); // half-window in samples
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

<main class:wide={tab === 2}>
  <!-- ADR-0028: on Tab 2 the title folds into the left rail so the top row is tab nav only,
       maximizing vertical space for the three plot bands. Tab 1 keeps its header. -->
  {#if tab === 1}
    <header>
      <h1>colonel_kernel</h1>
      <p class="sub">Tab 1 — forward convolution: <code>output = input ⊗ kernel</code></p>
    </header>
  {/if}

  <nav class="tabs">
    <button class:active={tab === 1} onclick={() => (tab = 1)}>1 · Convolution</button>
    <button class:active={tab === 2} onclick={() => (tab = 2)}>2 · Kernel recovery</button>
  </nav>

  {#if tab === 2}
    <Tab2 />
  {:else}
  <section class="controls">
    <div class="field">
      <label for="spikes">Spike times (seconds)</label>
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
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              bind:value={params[p.key]}
            />
            <output>{params[p.key]}</output>
          </label>
        {/each}
      </div>
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
  </section>

  <section class="workspace">
    <!-- Left column: spikes (top) + output (bottom), one locked recording-time axis. -->
    <div class="panel spikes">
      <div class="panel-label">Input — spike train</div>
      <Plot
        xs={gridTimes}
        ys={rasterSamples}
        kind="stems"
        color="var(--text-h)"
        xRange={leftXRange}
        yAxisSize={48}
        showXAxis={false}
        height={150}
      />
    </div>
    <div class="panel output">
      <div class="panel-label">Output — input ⊗ kernel</div>
      <Plot
        xs={outTimes}
        ys={outValues}
        color="#2a9d8f"
        xRange={leftXRange}
        yAxisSize={48}
        xLabel="time (s)"
        height={170}
      />
    </div>

    <!-- Upper-right: the kernel as an operator on lag — its own square ±win axis. -->
    <div class="panel kernel">
      <div class="panel-label">Kernel — lag (s)</div>
      <Plot
        xs={kernelDisplay.t}
        ys={kernelDisplay.v}
        color="var(--accent)"
        xRange={kernelXRange}
        xLabel="lag (s)"
        zeroLine
        height={260}
      />
    </div>
  </section>
  {/if}
</main>

<style>
  main {
    max-width: 920px;
    margin: 0 auto;
    padding: 24px 20px 64px;
    text-align: left;
  }
  /* Tab 2 (ADR-0026): a full-height app shell so the rail + co-equal plot bands
     own the viewport. Gated on tab===2 via class:wide, so Tab 1 is unaffected. */
  main.wide {
    max-width: 1600px;
    height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding-bottom: 20px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 24px;
  }
  /* Tab 2 (ADR-0028): tighten the nav row (no header above it) to give the bands height. */
  main.wide .tabs {
    margin-bottom: 12px;
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
  header {
    margin-bottom: 20px;
  }
  h1 {
    font-size: 32px;
    margin: 0 0 4px;
  }
  .sub {
    color: var(--text);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 24px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
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
  }
  .hint {
    font-size: 13px;
    color: var(--text);
  }
  .params {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .slider {
    display: grid;
    grid-template-columns: 130px 1fr 56px;
    align-items: center;
    gap: 10px;
    font-weight: 400;
  }
  .slider output {
    font-family: var(--mono);
    font-size: 13px;
    text-align: right;
  }
  .advanced summary {
    cursor: pointer;
    font-size: 14px;
    color: var(--text-h);
  }
  .adv-grid {
    display: flex;
    gap: 16px;
    margin: 12px 0 6px;
  }
  .adv-grid label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 400;
  }
  .workspace {
    display: grid;
    grid-template-columns: 1fr 300px;
    grid-template-areas:
      'spikes kernel'
      'output kernel';
    column-gap: 28px;
    row-gap: 16px;
    align-items: start;
  }
  .spikes {
    grid-area: spikes;
  }
  .output {
    grid-area: output;
  }
  .kernel {
    grid-area: kernel;
    align-self: start;
    width: 300px;
  }
  .panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
  }
  .panel-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-h);
    margin-bottom: 6px;
  }

  @media (max-width: 720px) {
    .workspace {
      grid-template-columns: 1fr;
      grid-template-areas:
        'spikes'
        'output'
        'kernel';
    }
    .kernel {
      width: 100%;
    }
  }
</style>
