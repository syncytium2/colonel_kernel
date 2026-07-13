<script>
  // Tab 3 · Challenge mode — "Guess the spikes".
  //
  // Spike inference, played by hand. You place spikes to explain a calcium trace.
  // Two flavors:
  //   • Normal   — the kernel is GIVEN; you infer only the spikes, and race the
  //                machine (naive deconvolution + peak-pick, timed).
  //   • Advanced — the kernel is ALSO unknown; you tune it AND place the spikes,
  //                the true spike-inference problem where you know neither.
  // Scored by reconstruction R² (live) and spike-match F1 vs the hidden truth. On
  // reveal, your spikes (red) and the true spikes (black) are overlaid for contrast.
  import Shell from './Shell.svelte';
  import Plot from './Plot.svelte';
  import Celebration from './Celebration.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    convolveOnGrid,
    inferSpikes,
    addAWGN,
    sigmaForLevel,
    mulberry32,
    rSquared,
    poissonSpikes,
    spikeMatch,
    peakPickSpikes,
  } from './core/index.js';

  let { wide = false } = $props();

  const DURATION = 40;
  const RATE = 10;
  const SPIKE_RATE = 0.28;
  const WIN_S = 5;
  const MATCH_TOL = 0.3;
  const GOOD_F1 = 0.7;
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);

  let roundSeed = $state(1);
  let phase = $state('play');
  let advanced = $state(false); // kernel unknown too — you tune it AND place spikes
  let userSpikes = $state([]);
  let uTauRise = $state(0.12);
  let uTauDecay = $state(0.45);
  let uAmp = $state(0.1);
  let celebrateToken = $state(0);

  // your timer (live during play, frozen on reveal)
  let elapsedMs = $state(0);
  let yourTimeMs = $state(0);
  let timerStart = 0;
  $effect(() => {
    const _seed = roundSeed;
    const _adv = advanced; // restart the clock when the mode changes too
    if (phase !== 'play') return;
    timerStart = performance.now();
    elapsedMs = 0;
    const id = setInterval(() => (elapsedMs = performance.now() - timerStart), 100);
    return () => clearInterval(id);
  });
  const fmtTime = (ms) =>
    !Number.isFinite(ms) ? '—' : ms < 1000 ? ms.toFixed(ms < 10 ? 1 : 0) + ' ms' : (ms / 1000).toFixed(1) + ' s';

  const sliceGrid = (full, zeroIndex) => {
    const r = new Float64Array(grid.n);
    for (let i = 0; i < grid.n; i++) r[i] = full[zeroIndex + i] ?? 0;
    return r;
  };
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

  // round: hidden spikes + hidden kernel → target; plus the machine's timed guess.
  const round = $derived.by(() => {
    const rand = mulberry32(roundSeed * 2654435761 + 303);
    const spikes = poissonSpikes(rand, SPIKE_RATE, DURATION);
    const kernel = buildKernel(
      'calcium',
      { tauRise: 0.05 + rand() * 0.15, tauDecay: 0.3 + rand() * 0.7 },
      grid.dt,
      0.1,
    );
    const raster = rasterize(spikes, grid, { amplitudeMode: 'unit' });
    const clean = sliceGrid(convolveOnGrid(raster.samples, grid, kernel).samples, kernel.zeroIndex);
    const target = Float64Array.from(addAWGN(clean, sigmaForLevel(1.2), mulberry32(roundSeed * 6151 + 9)).slice(0, grid.n));

    // the machine: naive deconvolution → peak-pick → discrete spikes, TIMED.
    const tMach = performance.now();
    const naive = inferSpikes(target, kernel, { lambda: 0.02 });
    let maxA = 0;
    for (const v of naive) if (Math.abs(v) > maxA) maxA = Math.abs(v);
    const machineSpikes = peakPickSpikes(naive, grid.dt, { minHeight: 0.35 * maxA, minSepS: 0.25 });
    const machineTimeMs = performance.now() - tMach;
    const machineMatch = spikeMatch(machineSpikes, spikes, MATCH_TOL);

    return { spikes, kernel, target, nSpikes: spikes.length, machineSpikes, machineTimeMs, machineMatch };
  });

  // reconstruction uses the GIVEN kernel (normal) or YOUR kernel (advanced)
  const userKernel = $derived(buildKernel('calcium', { tauRise: uTauRise, tauDecay: uTauDecay }, grid.dt, uAmp));
  const activeKernel = $derived(advanced ? userKernel : round.kernel);
  const userRaster = $derived(rasterize(userSpikes, grid, { amplitudeMode: 'unit' }));
  const userRecon = $derived(sliceGrid(convolveOnGrid(userRaster.samples, grid, activeKernel).samples, activeKernel.zeroIndex));
  const userR2 = $derived(rSquared(userRecon, round.target, grid.n));
  const match = $derived(spikeMatch(userSpikes, round.spikes, MATCH_TOL));
  const beatMachine = $derived(!advanced && match.f1 > round.machineMatch.f1 + 1e-6);

  function addSpike(t) {
    if (t < 0 || t > DURATION) return;
    if (userSpikes.some((s) => Math.abs(s - t) < grid.dt / 2)) return;
    userSpikes = [...userSpikes, t].sort((a, b) => a - b);
  }
  const removeSpike = (idx) => (userSpikes = userSpikes.filter((_, i) => i !== idx));
  const moveSpike = (idx, t) => {
    if (t < 0 || t > DURATION) return;
    userSpikes = userSpikes.map((s, i) => (i === idx ? t : s));
  };
  const clearSpikes = () => (userSpikes = []);

  function reveal() {
    yourTimeMs = performance.now() - timerStart;
    phase = 'revealed';
    if (match.f1 >= GOOD_F1 || beatMachine) celebrateToken += 1;
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    userSpikes = [];
  }
  function toggleAdvanced() {
    advanced = !advanced;
    phase = 'play';
    userSpikes = [];
  }

  const reconSeries = $derived([
    { ys: Array.from(round.target), stroke: '#2a9d8f', width: 2 },
    { ys: Array.from(userRecon), stroke: '#d21f3c', width: 2 }, // "you" = red throughout this tab
  ]);
  const kernelPanelSeries = $derived.by(() => {
    const u = sampleOnLag(activeKernel);
    if (advanced && phase === 'revealed') {
      const tru = sampleOnLag(round.kernel);
      return { xs: u.t, list: [{ ys: tru.v, stroke: 'var(--text)', width: 2, dash: [3, 3] }, { ys: u.v, stroke: 'var(--accent)', width: 2 }] };
    }
    return { xs: u.t, list: [{ ys: u.v, stroke: advanced ? 'var(--accent)' : 'var(--text-h)', width: 2 }] };
  });
  const kernelXRange = [-WIN_S, WIN_S];
  const userRasterSamples = $derived(Array.from(userRaster.samples));
  // reveal comparison: your spikes UP (+1, red), true spikes DOWN (−1, black)
  const yourUp = $derived.by(() => {
    const a = new Float64Array(grid.n);
    for (const t of userSpikes) { const i = Math.round(t / grid.dt); if (i >= 0 && i < grid.n) a[i] = 1; }
    return Array.from(a);
  });
  const trueDown = $derived.by(() => {
    const a = new Float64Array(grid.n);
    for (const t of round.spikes) { const i = Math.round(t / grid.dt); if (i >= 0 && i < grid.n) a[i] = -1; }
    return Array.from(a);
  });
  const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) + '%' : '—');
  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Guess the spikes</strong>
      <span>{advanced ? 'kernel unknown · infer both' : 'kernel given · infer the input'}</span>
    </div>

    <div class="note">
      {#if advanced}
        <strong>Advanced.</strong> You know <em>neither</em> the kernel nor the spikes — the real
        inference problem. <strong>Tune the kernel</strong> and <strong>place spikes</strong> until
        <span class="you">your reconstruction</span> explains the <span class="target">trace</span>.
      {:else}
        You're <strong>given the kernel</strong> and a <span class="target">calcium trace</span>. Place
        spikes (click add · shift-click remove · drag move) so <span class="you">your reconstruction</span>
        explains it — and beat the <span class="mach">machine's</span> naive deconvolution.
      {/if}
    </div>

    {#if advanced}
      <div class="field">
        <label class="fieldlab">Your kernel</label>
        <div class="params">
          <label class="slider"><span>τ rise (s)</span><input type="range" min="0.01" max="0.3" step="0.01" bind:value={uTauRise} /><output>{uTauRise.toFixed(2)}</output></label>
          <label class="slider"><span>τ decay (s)</span><input type="range" min="0.05" max="2" step="0.05" bind:value={uTauDecay} /><output>{uTauDecay.toFixed(2)}</output></label>
          <label class="slider"><span>peak (dF/F₀)</span><input type="range" min="0.01" max="0.4" step="0.01" bind:value={uAmp} /><output>{uAmp.toFixed(2)}</output></label>
        </div>
      </div>
    {/if}

    {#if phase === 'play'}
      <button class="cta" onclick={reveal}>Reveal &amp; score →</button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <div class="minirow">
      <button class="skip" onclick={clearSpikes}>clear</button>
      <button class="skip" onclick={newRound}>skip</button>
    </div>

    <label class="advtoggle">
      <input type="checkbox" checked={advanced} onchange={toggleAdvanced} />
      Advanced — hide the kernel (tune it yourself)
    </label>

    <div class="tally">
      <span>Placed <strong>{userSpikes.length}</strong></span>
      {#if phase === 'revealed'}<span>Hits <strong>{match.matched}</strong>/{round.nSpikes}</span>{/if}
    </div>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">{phase === 'revealed' ? 'You — spike match (F1)' : 'Reconstruction (R²)'}</div>
        <div class="v">{phase === 'revealed' ? pct(match.f1) : pctR2(userR2)}</div>
        <div class="t">⏱ {fmtTime(phase === 'play' ? elapsedMs : yourTimeMs)}</div>
      </div>
      {#if advanced}
        <div class="score">
          <div class="k">Reconstruction (R²)</div>
          <div class="v">{pctR2(userR2)}</div>
          <div class="t">{phase === 'revealed' ? match.matched + ' / ' + round.nSpikes + ' spikes' : 'live'}</div>
        </div>
      {:else}
        <div class="score mach" class:hidden={phase !== 'revealed'}>
          <div class="k">Machine (F1)</div>
          <div class="v">{phase === 'revealed' ? pct(round.machineMatch.f1) : '·····'}</div>
          <div class="t">{phase === 'revealed' ? '⏱ ' + fmtTime(round.machineTimeMs) : '·····'}</div>
        </div>
      {/if}
    </div>

    {#if phase === 'revealed'}
      <div class="verdict {(beatMachine || match.f1 >= GOOD_F1) ? 'good' : 'ok'}">
        {#if advanced}
          {#if match.f1 >= 0.85}🏆 Outstanding — you nailed an unknown kernel <em>and</em> the spikes.
          {:else if match.f1 >= GOOD_F1}✅ Strong: {pct(match.recall)} of real spikes found with a kernel you had to guess.
          {:else}👍 The real problem is brutal — knowing neither is why this stays an open field.{/if}
        {:else if beatMachine}
          🏆 You beat the machine! F1 {pct(match.f1)} vs its {pct(round.machineMatch.f1)} — slower, but sharper.
        {:else if match.f1 >= GOOD_F1}
          ✅ Strong guess — F1 {pct(match.f1)}. The machine got {pct(round.machineMatch.f1)} in {fmtTime(round.machineTimeMs)}.
        {:else}
          👍 The machine got {pct(round.machineMatch.f1)} in {fmtTime(round.machineTimeMs)}; you got {pct(match.f1)}. Even naive deconvolution struggles — that's the point.
        {/if}
      </div>
      <p class="reveal-note">
        <span class="you">Your spikes</span> (red, up) and the <span class="true">true spikes</span>
        (black, down) are overlaid below. A good R² with the <em>wrong</em> spikes is exactly why
        inference is hard{#if advanced} — doubly so when the kernel is unknown too{/if}.
      </p>
    {:else}
      <p class="play-note">
        Reconstruction R² updates live. Every bump needs a spike near its onset.
        <br /><span class="muted">{round.nSpikes} true spikes hidden · match tolerance ±{MATCH_TOL}s{#if !advanced} · the machine also gets a go{/if}</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">{advanced ? (phase === 'revealed' ? 'Your kernel vs true (dashed)' : 'Your kernel — tune it') : 'Given kernel'} — lag (s)</div>
    <div class="sq-body">
      {#key advanced ? 'a' + (phase === 'revealed') : 'g'}
        <Plot fill xs={kernelPanelSeries.xs} seriesList={kernelPanelSeries.list} xRange={kernelXRange} xLabel="lag (s)" zeroLine />
      {/key}
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head"><span class="plot-label">Trace — <span class="target">target</span> vs <span class="you">your reconstruction</span></span></div>
      <div class="band-body">
        <Plot fill xs={gridTimes} seriesList={reconSeries} yAxisSize={48} padRight={32} syncKey="gts-x" cursorPoints={true} showXAxis={false} />
      </div>
    </div>

    {#if phase !== 'revealed'}
      <div class="band">
        <div class="band-head"><span class="plot-label">Your spikes ({userSpikes.length}) — click add · shift-click remove · drag move</span></div>
        <div class="band-body">
          <Plot
            fill xs={gridTimes} ys={userRasterSamples} kind="stems" color="var(--accent)"
            yAxisSize={48} padRight={32} syncKey="gts-x" xLabel="time (s)"
            editable spikeTimesForEdit={userSpikes} editSnapDt={grid.dt}
            onSpikeAdd={addSpike} onSpikeRemove={removeSpike} onSpikeMove={moveSpike}
          />
        </div>
      </div>
    {:else}
      <div class="band big">
        <div class="band-head"><span class="plot-label"><span class="you">Your spikes (red, up)</span> vs <span class="true">true spikes (black, down)</span> — {match.matched} hits · {match.falsePos} false · {match.missed} missed</span></div>
        <div class="band-body">
          <Plot
            fill xs={gridTimes} ys={yourUp} ys2={trueDown} kind="stems" ys2Bars
            color="#d21f3c" color2="#111111" barSize={[0.5, 5]} yRange={[-1.2, 1.2]}
            yAxisSize={48} padRight={32} syncKey="gts-x" cursorPoints={true} zeroLine xLabel="time (s)"
          />
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
  .you { color: #d21f3c; font-weight: 600; }
  .target { color: #2a9d8f; font-weight: 600; }
  .true { color: var(--text-h); font-weight: 600; }
  .mach { color: var(--accent); font-weight: 600; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .fieldlab { font-size: 12px; color: var(--text-h); font-weight: 600; }
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
  .advtoggle { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); cursor: pointer; padding: 8px 0; border-top: 1px solid var(--border); }
  .advtoggle input { cursor: pointer; }
  .tally { display: flex; gap: 14px; font-size: 12.5px; color: var(--text); }
  .tally strong { color: var(--text-h); font-family: var(--mono); }
  .score-row { display: flex; gap: 12px; }
  .score { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .score.you { border-color: var(--accent-border); background: var(--accent-bg); }
  .score.hidden { opacity: 0.55; }
  .score .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text); }
  .score .v { font-family: var(--mono); font-size: 28px; color: var(--text-h); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .score .t { font-family: var(--mono); font-size: 12px; color: var(--text); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .verdict { margin-top: 14px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.45; border: 1px solid var(--border); }
  .verdict.good { background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-color: var(--accent-border); color: var(--text-h); }
  .verdict.ok { background: var(--code-bg); color: var(--text-h); }
  .reveal-note, .play-note { margin-top: 12px; font-size: 12.5px; color: var(--text); line-height: 1.5; }
  .muted { color: var(--text); opacity: 0.8; }
  .sq-label { font-size: 12px; font-weight: 500; color: var(--text-h); margin-bottom: 4px; flex: none; }
  .sq-body { flex: 1; min-height: 0; }
  .band { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: var(--bg); }
  .band.big { flex: 1.7 1 0; } /* the reveal comparison plot gets more height */
  .band-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; flex: none; }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }
</style>
