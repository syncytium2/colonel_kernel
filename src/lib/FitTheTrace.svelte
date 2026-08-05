<script>
  // Tab 1 · Challenge mode — "Fit the trace".
  //
  // The forward problem, played by hand. A hidden spike train + hidden kernel make
  // a target calcium trace; the spikes are HIDDEN. You place your own spikes (click
  // the spike band to add, shift-click to remove, drag to move) and shape a kernel
  // until your reconstruction matches the target. Score = reconstruction R². It
  // teaches convolution by making you build it — the inverse of just watching it.
  //
  // Reuses the shipped core (rasterize + convolveOnGrid) and the shared editable
  // Plot; Learn (Tab 1) mode is untouched.
  import Shell from './Shell.svelte';
  import Plot from './Plot.svelte';
  import Celebration from './Celebration.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    convolveOnGrid,
    addAWGN,
    sigmaForLevel,
    mulberry32,
    rSquared,
    poissonSpikes,
  } from './core/index.js';

  let { wide = false } = $props();

  const DURATION = 60;
  const RATE = 10;
  const SPIKE_RATE = 0.3;
  const WIN_S = 5;
  const GOOD_FIT = 0.85; // R² that earns a celebration
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);

  let roundSeed = $state(1);
  let phase = $state('play');
  let userSpikes = $state([]); // times (s) the player has placed
  let uTauRise = $state(0.15);
  let uTauDecay = $state(0.5);
  let uAmp = $state(0.1);
  let celebrateToken = $state(0);

  // timer: how long you take to fit the trace (live during play, frozen on reveal)
  let elapsedMs = $state(0);
  let yourTimeMs = $state(0);
  let timerStart = 0;
  $effect(() => {
    const _seed = roundSeed; // restart on each new round
    if (phase !== 'play') return;
    timerStart = performance.now();
    elapsedMs = 0;
    const id = setInterval(() => (elapsedMs = performance.now() - timerStart), 100);
    return () => clearInterval(id);
  });
  const fmtTime = (ms) =>
    !Number.isFinite(ms) ? '—' : ms < 1000 ? ms.toFixed(ms < 10 ? 1 : 0) + ' ms' : (ms / 1000).toFixed(1) + ' s';

  function sampleOnLag(kernel) {
    const win = Math.max(1, Math.round(WIN_S / grid.dt));
    const len = 2 * win + 1;
    const t = new Array(len);
    const v = new Array(len);
    for (let oi = 0; oi < len; oi++) {
      const lag = oi - win;
      const ki = kernel.zeroIndex + lag;
      t[oi] = lag * grid.dt;
      v[oi] = ki >= 0 && ki < kernel.samples.length ? kernel.samples[ki] : 0;
    }
    return { t, v };
  }
  const sliceGrid = (full, zeroIndex) => {
    const r = new Float64Array(grid.n);
    for (let i = 0; i < grid.n; i++) r[i] = full[zeroIndex + i] ?? 0;
    return r;
  };

  // hidden round (regenerates on roundSeed only)
  const round = $derived.by(() => {
    const rand = mulberry32(roundSeed * 2654435761 + 101);
    const spikes = poissonSpikes(rand, SPIKE_RATE, DURATION);
    const hiddenKernel = buildKernel(
      'calcium',
      { tauRise: 0.05 + rand() * 0.2, tauDecay: 0.3 + rand() * 0.9 },
      grid.dt,
      0.08 + rand() * 0.06,
    );
    const raster = rasterize(spikes, grid, { amplitudeMode: 'unit' });
    const clean = sliceGrid(convolveOnGrid(raster.samples, grid, hiddenKernel).samples, hiddenKernel.zeroIndex);
    const target = Float64Array.from(addAWGN(clean, sigmaForLevel(1.5), mulberry32(roundSeed * 7919 + 3)).slice(0, grid.n));
    return { spikes, hiddenKernel, target, nSpikes: spikes.length };
  });

  const userKernel = $derived(buildKernel('calcium', { tauRise: uTauRise, tauDecay: uTauDecay }, grid.dt, uAmp));
  const userRaster = $derived(rasterize(userSpikes, grid, { amplitudeMode: 'unit' }));
  const userRecon = $derived(sliceGrid(convolveOnGrid(userRaster.samples, grid, userKernel).samples, userKernel.zeroIndex));
  const userR2 = $derived(rSquared(userRecon, round.target, grid.n));

  // --- spike editing (from the shared editable Plot) ---
  function addSpike(t) {
    if (t < 0 || t > DURATION) return;
    // avoid stacking two spikes on the same frame
    if (userSpikes.some((s) => Math.abs(s - t) < grid.dt / 2)) return;
    userSpikes = [...userSpikes, t].sort((a, b) => a - b);
  }
  function removeSpike(idx) {
    userSpikes = userSpikes.filter((_, i) => i !== idx);
  }
  function moveSpike(idx, t) {
    if (t < 0 || t > DURATION) return;
    userSpikes = userSpikes.map((s, i) => (i === idx ? t : s));
  }
  function clearSpikes() {
    userSpikes = [];
  }

  function reveal() {
    yourTimeMs = performance.now() - timerStart;
    phase = 'revealed';
    if (Number.isFinite(userR2) && userR2 >= GOOD_FIT) celebrateToken += 1;
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    userSpikes = [];
  }

  const reconSeries = $derived([
    { ys: Array.from(round.target), stroke: 'var(--series-trace)', width: 2 },
    { ys: Array.from(userRecon), stroke: 'var(--series-you)', width: 2 },
  ]);
  const kernelSeries = $derived.by(() => {
    const u = sampleOnLag(userKernel);
    if (phase !== 'revealed') return { xs: u.t, list: [{ ys: u.v, stroke: 'var(--series-you)', width: 2 }] };
    const tru = sampleOnLag(round.hiddenKernel);
    return { xs: u.t, list: [{ ys: tru.v, stroke: 'var(--series-truth)', width: 2, dash: [3, 3] }, { ys: u.v, stroke: 'var(--series-you)', width: 2 }] };
  });
  const kernelXRange = [-WIN_S, WIN_S];
  const userRasterSamples = $derived(Array.from(userRaster.samples));
  const trueRasterSamples = $derived(Array.from(rasterize(round.spikes, grid, { amplitudeMode: 'unit' }).samples));
  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Fit the trace</strong>
      <span>place spikes · shape a kernel</span>
    </div>

    <div class="note">
      A hidden spike train made the <span class="target">target trace</span>.
      <strong>Click the spike band</strong> to add spikes (shift-click removes, drag moves) and
      shape the kernel until <span class="you">your reconstruction</span> matches. Then reveal the answer.
    </div>

    <div class="field">
      <div class="params">
        <label class="slider"><span>τ rise (s)</span>
          <input type="range" min="0.01" max="0.3" step="0.01" bind:value={uTauRise} /><output>{uTauRise.toFixed(2)}</output></label>
        <label class="slider"><span>τ decay (s)</span>
          <input type="range" min="0.05" max="2" step="0.05" bind:value={uTauDecay} /><output>{uTauDecay.toFixed(2)}</output></label>
        <label class="slider"><span>peak (dF/F₀)</span>
          <input type="range" min="0.01" max="0.4" step="0.01" bind:value={uAmp} /><output>{uAmp.toFixed(2)}</output></label>
      </div>
    </div>

    {#if phase === 'play'}
      <button class="cta" onclick={reveal}>Reveal answer →</button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <div class="minirow">
      <button class="skip" onclick={clearSpikes}>clear spikes</button>
      <button class="skip" onclick={newRound}>skip</button>
    </div>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">Your fit (R²)</div>
        <div class="v">{pctR2(userR2)}</div>
        <div class="t">⏱ {fmtTime(phase === 'play' ? elapsedMs : yourTimeMs)}</div>
      </div>
      <div class="score">
        <div class="k">Spikes placed</div>
        <div class="v">{userSpikes.length}{#if phase === 'revealed'} <small>/ {round.nSpikes} true</small>{/if}</div>
      </div>
    </div>
    {#if phase === 'revealed'}
      <div class="verdict {userR2 >= GOOD_FIT ? 'good' : 'ok'}">
        {#if userR2 >= 0.95}🏆 Near-perfect reconstruction!
        {:else if userR2 >= GOOD_FIT}✅ Great fit — you captured the trace.
        {:else}👍 Not bad. Compare your spikes to the true ones below and try again.{/if}
      </div>
      <p class="reveal-note">
        Spike band now shows the <span class="true">true spikes</span> under yours, and the kernel panel
        overlays the <span class="true">true kernel</span>. How close did you get?
      </p>
    {:else}
      <p class="play-note">
        Live R² updates as you edit. A tall spike in the target needs a spike under it; the kernel sets
        the rise &amp; decay shape.
        <br /><span class="muted">click to add · shift-click to remove · drag to move</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">Kernel — lag (s)</div>
    <div class="sq-body">
      {#key phase}
        <Plot fill xs={kernelSeries.xs} seriesList={kernelSeries.list} xRange={kernelXRange} xLabel="lag (s)" zeroLine />
      {/key}
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head"><span class="plot-label">Reconstruction — <span class="target">target</span> vs <span class="you">your kernel</span></span></div>
      <div class="band-body">
        <Plot fill xs={gridTimes} seriesList={reconSeries} yAxisSize={48} padRight={32} syncKey="ftt-x" cursorPoints={true} showXAxis={false} />
      </div>
    </div>

    <div class="band">
      <div class="band-head"><span class="plot-label">Your spikes ({userSpikes.length}) — click to add · shift-click remove · drag move</span></div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={userRasterSamples}
          kind="stems"
          color="var(--series-you)"
          yAxisSize={48}
          padRight={32}
          syncKey="ftt-x"
          showXAxis={phase !== 'revealed'}
          xLabel={phase === 'revealed' ? '' : 'time (s)'}
          editable
          spikeTimesForEdit={userSpikes}
          editSnapDt={grid.dt}
          onSpikeAdd={addSpike}
          onSpikeRemove={removeSpike}
          onSpikeMove={moveSpike}
        />
      </div>
    </div>

    {#if phase === 'revealed'}
      <div class="band">
        <div class="band-head"><span class="plot-label">True spikes ({round.nSpikes})</span></div>
        <div class="band-body">
          <Plot fill xs={gridTimes} ys={trueRasterSamples} kind="stems" color="var(--series-spikes)" yAxisSize={48} padRight={32} syncKey="ftt-x" cursorPoints={true} xLabel="time (s)" />
        </div>
      </div>
    {/if}
  {/snippet}
</Shell>

<Celebration trigger={celebrateToken} />

<style>
  .rail-title { display: flex; flex-direction: column; gap: 1px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .rail-title strong { font-size: 15px; color: var(--text-h); }
  .rail-title span { font-size: 11px; color: var(--text); font-family: var(--mono); }
  .note { font-size: 12.5px; line-height: 1.5; color: var(--text); background: var(--accent-bg); border: 1px solid var(--accent-border); border-radius: 8px; padding: 10px 12px; }
  .note strong { color: var(--text-h); }
  .you { color: var(--series-you); font-weight: 600; }
  .target { color: var(--series-trace); font-weight: 600; }
  .true { color: var(--series-spikes); font-weight: 600; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .params { display: flex; flex-direction: column; gap: 8px; }
  .slider { display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'lab out' 'rng rng'; gap: 4px 8px; align-items: center; }
  .slider > span { grid-area: lab; font-size: 12.5px; color: var(--text-h); }
  .slider > output { grid-area: out; font-family: var(--mono); font-size: 12px; text-align: right; color: var(--text); }
  .slider > input { grid-area: rng; width: 100%; }
  .cta { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 14px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .cta:hover { filter: brightness(1.05); }
  .minirow { display: flex; gap: 14px; }
  .skip { font: inherit; font-size: 12px; background: none; border: none; padding: 0; color: var(--text); cursor: pointer; text-decoration: underline; }
  .skip:hover { color: var(--text-h); }
  .score-row { display: flex; gap: 12px; }
  .score { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .score.you { border-color: var(--accent-border); background: var(--accent-bg); }
  .score .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text); }
  .score .v { font-family: var(--mono); font-size: 30px; color: var(--text-h); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .score .v small { font-size: 13px; color: var(--text); }
  .score .t { font-family: var(--mono); font-size: 12px; color: var(--text); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .verdict { margin-top: 14px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.45; border: 1px solid var(--border); }
  .verdict.good { background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-color: var(--accent-border); color: var(--text-h); }
  .verdict.ok { background: var(--code-bg); color: var(--text-h); }
  .reveal-note, .play-note { margin-top: 12px; font-size: 12.5px; color: var(--text); line-height: 1.5; }
  .muted { color: var(--text); opacity: 0.8; }
  .sq-label { font-size: 12px; font-weight: 500; color: var(--text-h); margin-bottom: 4px; flex: none; }
  .sq-body { flex: 1; min-height: 0; }
  .band { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: var(--bg); }
  .band-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; flex: none; }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }
</style>
