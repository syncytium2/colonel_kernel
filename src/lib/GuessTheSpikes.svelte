<script>
  // Tab 3 · Challenge mode — "Guess the spikes".
  //
  // The hard inverse, played by hand. You're GIVEN the kernel and a calcium
  // trace; you place spikes (click add, shift-click remove, drag move) to explain
  // the trace. Scored two ways: reconstruction R² (does your guess reproduce the
  // trace?) and spike-match F1 against the hidden true spikes (did you find the
  // real ones?). It makes Tab 3's whole point — spike inference is HARD — visceral
  // instead of asserted, and pits you against the naive-deconvolution machine.
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
    spikeMatch,
  } from './core/index.js';
  // (inferSpikes — the machine's naive guess — is a planned reveal comparison; a
  // continuous deconvolution doesn't overlay cleanly on discrete spike stems, so
  // it's left out of the v1 display.)

  let { wide = false } = $props();

  const DURATION = 40; // shorter → a tractable number of spikes to place
  const RATE = 10;
  const SPIKE_RATE = 0.28;
  const WIN_S = 5;
  const MATCH_TOL = 0.3; // s — how close a guess must be to count as a hit
  const GOOD_F1 = 0.7;
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);

  let roundSeed = $state(1);
  let phase = $state('play');
  let userSpikes = $state([]);
  let celebrateToken = $state(0);

  // timer: how long you take to infer the spikes (live during play, frozen on reveal)
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

  // round: hidden spikes + a GIVEN kernel → target trace; plus the naive-deconvolution guess.
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
    return { spikes, kernel, target, nSpikes: spikes.length };
  });

  // your reconstruction uses the GIVEN kernel + your placed spikes
  const userRaster = $derived(rasterize(userSpikes, grid, { amplitudeMode: 'unit' }));
  const userRecon = $derived(sliceGrid(convolveOnGrid(userRaster.samples, grid, round.kernel).samples, round.kernel.zeroIndex));
  const userR2 = $derived(rSquared(userRecon, round.target, grid.n));
  const match = $derived(spikeMatch(userSpikes, round.spikes, MATCH_TOL));

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
    if (match.f1 >= GOOD_F1) celebrateToken += 1;
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    userSpikes = [];
  }

  const reconSeries = $derived([
    { ys: Array.from(round.target), stroke: '#2a9d8f', width: 2 },
    { ys: Array.from(userRecon), stroke: 'var(--accent)', width: 2 },
  ]);
  const kernelSeries = $derived.by(() => {
    const k = sampleOnLag(round.kernel);
    return { xs: k.t, list: [{ ys: k.v, stroke: 'var(--text-h)', width: 2 }] };
  });
  const kernelXRange = [-WIN_S, WIN_S];
  const userRasterSamples = $derived(Array.from(userRaster.samples));
  const trueRasterSamples = $derived(Array.from(rasterize(round.spikes, grid, { amplitudeMode: 'unit' }).samples));
  const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) + '%' : '—');
  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Guess the spikes</strong>
      <span>kernel given · infer the input</span>
    </div>

    <div class="note">
      You're <strong>given the kernel</strong> and a <span class="target">calcium trace</span>.
      Place spikes (click add · shift-click remove · drag move) so
      <span class="you">your reconstruction</span> explains the trace. This is the hard direction —
      real tools (CASCADE, MLspike, OASIS) do it for a living.
    </div>

    {#if phase === 'play'}
      <button class="cta" onclick={reveal}>Reveal &amp; score →</button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <div class="minirow">
      <button class="skip" onclick={clearSpikes}>clear</button>
      <button class="skip" onclick={newRound}>skip</button>
    </div>

    <div class="tally">
      <span>Placed <strong>{userSpikes.length}</strong></span>
      {#if phase === 'revealed'}<span>Hits <strong>{match.matched}</strong>/{round.nSpikes}</span>{/if}
    </div>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">Reconstruction (R²)</div>
        <div class="v">{pctR2(userR2)}</div>
        <div class="t">⏱ {fmtTime(phase === 'play' ? elapsedMs : yourTimeMs)}</div>
      </div>
      <div class="score" class:hidden={phase !== 'revealed'}>
        <div class="k">Spike match (F1)</div>
        <div class="v">{phase === 'revealed' ? pct(match.f1) : '·····'}</div>
        <div class="t">{phase === 'revealed' ? match.matched + ' hits · ' + match.falsePos + ' false' : '·····'}</div>
      </div>
    </div>

    {#if phase === 'revealed'}
      <div class="verdict {match.f1 >= GOOD_F1 ? 'good' : 'ok'}">
        {#if match.f1 >= 0.9}🏆 Superb inference — you found nearly every spike!
        {:else if match.f1 >= GOOD_F1}✅ Strong guess — {pct(match.recall)} of real spikes found, {pct(match.precision)} of yours correct.
        {:else}👍 Tough one. {match.matched} hits, {match.falsePos} false, {match.missed} missed — compare your spikes to the true ones below.{/if}
      </div>
      <p class="reveal-note">
        The <span class="true">true spikes</span> are shown below yours. Notice you can post a decent R²
        with the <em>wrong</em> spikes — that gap between "explains the trace" and "the real spikes" is
        exactly why spike inference is hard, and why dedicated tools exist for it.
      </p>
    {:else}
      <p class="play-note">
        Reconstruction R² updates live. Every bump in the target needs a spike near its onset; the given
        kernel sets the shape.
        <br /><span class="muted">{round.nSpikes} true spikes hidden · match tolerance ±{MATCH_TOL}s</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">Given kernel — lag (s)</div>
    <div class="sq-body">
      <Plot fill xs={kernelSeries.xs} seriesList={kernelSeries.list} xRange={kernelXRange} xLabel="lag (s)" zeroLine />
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head"><span class="plot-label">Trace — <span class="target">target</span> vs <span class="you">your reconstruction</span></span></div>
      <div class="band-body">
        <Plot fill xs={gridTimes} seriesList={reconSeries} yAxisSize={48} padRight={32} syncKey="gts-x" cursorPoints={true} showXAxis={false} />
      </div>
    </div>

    <div class="band">
      <div class="band-head"><span class="plot-label">Your spikes ({userSpikes.length}) — click add · shift-click remove · drag move</span></div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={userRasterSamples}
          kind="stems"
          color="var(--accent)"
          yAxisSize={48}
          padRight={32}
          syncKey="gts-x"
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
        <div class="band-head"><span class="plot-label"><span class="true">True spikes ({round.nSpikes})</span> — the ones that actually made the trace</span></div>
        <div class="band-body">
          <Plot fill xs={gridTimes} ys={trueRasterSamples} kind="stems" color="var(--text-h)" yAxisSize={48} padRight={32} syncKey="gts-x" cursorPoints={true} xLabel="time (s)" />
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
  .you { color: var(--accent); font-weight: 600; }
  .target { color: #2a9d8f; font-weight: 600; }
  .true { color: var(--text-h); font-weight: 600; }
  .cta { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 14px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .cta:hover { filter: brightness(1.05); }
  .minirow { display: flex; gap: 14px; }
  .skip { font: inherit; font-size: 12px; background: none; border: none; padding: 0; color: var(--text); cursor: pointer; text-decoration: underline; }
  .skip:hover { color: var(--text-h); }
  .tally { display: flex; gap: 14px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--text); }
  .tally strong { color: var(--text-h); font-family: var(--mono); }
  .score-row { display: flex; gap: 12px; }
  .score { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .score.you { border-color: var(--accent-border); background: var(--accent-bg); }
  .score.hidden { opacity: 0.6; }
  .score .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text); }
  .score .v { font-family: var(--mono); font-size: 30px; color: var(--text-h); margin-top: 4px; font-variant-numeric: tabular-nums; }
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
