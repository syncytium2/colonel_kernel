<script>
  // Tab 2 · Challenge mode — "Beat the Colonel".
  //
  // The gamified inverse of the flagship: the SPIKES ARE KNOWN (Tab 2's premise),
  // and a target calcium trace is shown. You hand-design a kernel to reconstruct
  // that trace; the tool ("the Colonel") recovers a kernel by regularized
  // deconvolution from the same known spikes. Both are scored by reconstruction
  // R² against the target — beat the Colonel's R² and you win.
  //
  // The teaching payoff is the UNCOUPLED round: a target with a calcium event
  // that no spike explains (and a gain drop), so NO single kernel fits. Neither
  // you nor the Colonel can win — which is exactly the project's core premise
  // (FOUNDATIONS §3/§4), delivered as a punchline instead of a paragraph.
  //
  // Everything reuses the shipped core (forward convolution + the same
  // recoverKernel the real Tab 2 uses); this component only adds the game loop.
  import Shell from './Shell.svelte';
  import Plot from './Plot.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    convolveOnGrid,
    recoverKernel,
    nextPow2,
    addAWGN,
    sigmaForLevel,
    mulberry32,
    rSquared,
    poissonSpikes,
  } from './core/index.js';

  let { wide = false } = $props();

  // Fixed, game-sized timebase (short recording → snappy + readable).
  const DURATION = 60; // s
  const RATE = 10; // Hz
  const SPIKE_RATE = 0.4; // Hz — a lively-but-legible train
  const WIN_S = 5; // kernel half-window (lag axis + the Colonel's recovery window)
  const LAMBDA = 0.02; // the Colonel's regularization strength (regularized deconvolution)
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);
  const N = nextPow2(grid.n);
  const winSamples = Math.round(WIN_S / grid.dt);

  // --- game state ---
  let roundSeed = $state(1);
  let phase = $state('play'); // 'play' | 'revealed'
  let scored = $state(false); // guard: a round updates the tally exactly once
  let tally = $state({ you: 0, colonel: 0, ties: 0 });

  // the player's kernel (calcium family; they shape rise/decay/peak)
  let uTauRise = $state(0.15);
  let uTauDecay = $state(0.5);
  let uAmp = $state(0.1);

  function sampleOnLag(kernel) {
    const len = 2 * winSamples + 1;
    const t = new Array(len);
    const v = new Array(len);
    for (let oi = 0; oi < len; oi++) {
      const lag = oi - winSamples;
      const ki = kernel.zeroIndex + lag;
      t[oi] = lag * grid.dt;
      v[oi] = ki >= 0 && ki < kernel.samples.length ? kernel.samples[ki] : 0;
    }
    return { t, v };
  }

  // --- the round (regenerates ONLY on roundSeed; independent of the player) ---
  const round = $derived.by(() => {
    const rand = mulberry32(roundSeed * 2654435761);
    const spikes = poissonSpikes(rand, SPIKE_RATE, DURATION);
    const hiddenParams = { tauRise: 0.05 + rand() * 0.2, tauDecay: 0.3 + rand() * 0.9 };
    const hiddenAmp = 0.08 + rand() * 0.06;
    const uncoupled = rand() < 0.34; // ~1 in 3 rounds have no clean kernel

    const raster = rasterize(spikes, grid, { amplitudeMode: 'binned-count' });
    const hiddenKernel = buildKernel('calcium', hiddenParams, grid.dt, hiddenAmp);
    const conv = convolveOnGrid(raster.samples, grid, hiddenKernel).samples;

    // target on the recording window (drop the convolution tail for display+scoring)
    const target = new Float64Array(grid.n);
    for (let i = 0; i < grid.n; i++) target[i] = conv[i] ?? 0;

    if (uncoupled) {
      // 1–2 spurious calcium transients with NO spike (calcium without APs)...
      const bumps = 1 + (rand() < 0.5 ? 1 : 0);
      for (let b = 0; b < bumps; b++) {
        const at = Math.floor(rand() * grid.n);
        const z = hiddenKernel.zeroIndex;
        for (let k = 0; k < hiddenKernel.samples.length; k++) {
          const idx = at + (k - z);
          if (idx >= 0 && idx < grid.n) target[idx] += hiddenKernel.samples[k] * (1.2 + rand());
        }
      }
      // ...and a gain drop over a stretch (APs without proportional calcium).
      const s0 = Math.floor(rand() * grid.n * 0.5);
      const s1 = Math.min(grid.n, s0 + Math.floor(grid.n * 0.25));
      for (let i = s0; i < s1; i++) target[i] *= 0.3;
    }

    // measurement noise (calibrated cohort σ; a level that bites at this peak)
    const noisy = addAWGN(target, sigmaForLevel(2.5), mulberry32(roundSeed * 40503 + 7));
    const targetTrace = Float64Array.from(noisy.slice(0, grid.n));

    // the Colonel: regularized deconvolution from the SAME known spikes + target
    const targetPad = new Float64Array(N);
    targetPad.set(targetTrace);
    const sdPad = new Float64Array(N);
    sdPad.set(raster.samples.subarray(0, Math.min(raster.samples.length, N)));
    const colonelKernel = recoverKernel(targetPad, sdPad, { windowSamples: winSamples, dt: grid.dt, lambda: LAMBDA });
    const colonelReconFull = convolveOnGrid(raster.samples, grid, colonelKernel).samples;
    const colonelRecon = new Float64Array(grid.n);
    for (let i = 0; i < grid.n; i++) colonelRecon[i] = colonelReconFull[i] ?? 0;
    const colonelR2 = rSquared(colonelRecon, targetTrace, grid.n);

    return {
      spikes, raster, hiddenKernel, uncoupled,
      target: targetTrace,
      colonelKernel, colonelRecon, colonelR2,
      nSpikes: spikes.length,
    };
  });

  // --- the player's reconstruction (recomputes on the sliders, cheap) ---
  const userKernel = $derived(
    buildKernel('calcium', { tauRise: uTauRise, tauDecay: uTauDecay }, grid.dt, uAmp),
  );
  const userRecon = $derived.by(() => {
    const full = convolveOnGrid(round.raster.samples, grid, userKernel).samples;
    const r = new Float64Array(grid.n);
    for (let i = 0; i < grid.n; i++) r[i] = full[i] ?? 0;
    return r;
  });
  const userR2 = $derived(rSquared(userRecon, round.target, grid.n));

  // --- verdict + tally ---
  const verdict = $derived.by(() => {
    if (round.uncoupled) return 'uncoupled';
    if (!Number.isFinite(userR2) || !Number.isFinite(round.colonelR2)) return 'tie';
    if (userR2 > round.colonelR2 + 1e-4) return 'you';
    if (round.colonelR2 > userR2 + 1e-4) return 'colonel';
    return 'tie';
  });

  function reveal() {
    if (!scored) {
      const v = verdict;
      if (v === 'you') tally.you += 1;
      else if (v === 'colonel') tally.colonel += 1;
      else tally.ties += 1;
      tally = { ...tally };
      scored = true;
    }
    phase = 'revealed';
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    scored = false;
  }

  // --- plot series (seriesList keyed on phase so the count-change remounts) ---
  const reconSeries = $derived.by(() => {
    const s = [
      { ys: Array.from(round.target), stroke: '#2a9d8f', width: 2 }, // target
      { ys: Array.from(userRecon), stroke: 'var(--accent)', width: 2 }, // you
    ];
    if (phase === 'revealed')
      s.push({ ys: Array.from(round.colonelRecon), stroke: 'var(--text)', width: 1.5, dash: [4, 3] }); // Colonel
    return s;
  });
  const kernelSeries = $derived.by(() => {
    const u = sampleOnLag(userKernel);
    if (phase !== 'revealed') return { xs: u.t, list: [{ ys: u.v, stroke: 'var(--accent)', width: 2 }] };
    const tru = sampleOnLag(round.hiddenKernel);
    const col = sampleOnLag(round.colonelKernel);
    return {
      xs: u.t,
      list: [
        { ys: tru.v, stroke: 'var(--text)', width: 2, dash: [2, 2] }, // true (hidden)
        { ys: col.v, stroke: '#2a9d8f', width: 2, dash: [5, 3] }, // Colonel
        { ys: u.v, stroke: 'var(--accent)', width: 2 }, // you
      ],
    };
  });
  const kernelXRange = [-WIN_S, WIN_S];
  const rasterSamples = $derived(Array.from(round.raster.samples));

  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Beat the Colonel</strong>
      <span>design a kernel · known spikes</span>
    </div>

    <div class="note">
      The <strong>spikes are known</strong>. Shape a kernel so <span class="you">your reconstruction</span>
      matches the <span class="target">target trace</span> — then reveal how the
      <strong>Colonel's</strong> deconvolution did. Beat its R² and you win.
    </div>

    <div class="field">
      <div class="params">
        <label class="slider"><span>τ rise (s)</span>
          <input type="range" min="0.01" max="0.3" step="0.01" bind:value={uTauRise} />
          <output>{uTauRise.toFixed(2)}</output></label>
        <label class="slider"><span>τ decay (s)</span>
          <input type="range" min="0.05" max="2" step="0.05" bind:value={uTauDecay} />
          <output>{uTauDecay.toFixed(2)}</output></label>
        <label class="slider"><span>peak (dF/F₀)</span>
          <input type="range" min="0.01" max="0.4" step="0.01" bind:value={uAmp} />
          <output>{uAmp.toFixed(2)}</output></label>
      </div>
    </div>

    {#if phase === 'play'}
      <button class="cta" onclick={reveal}>Reveal &amp; score →</button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <button class="skip" onclick={newRound}>skip this round</button>

    <div class="tally">
      <span>You <strong>{tally.you}</strong></span>
      <span>Colonel <strong>{tally.colonel}</strong></span>
      <span>Ties <strong>{tally.ties}</strong></span>
    </div>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">Your fit (R²)</div>
        <div class="v">{pctR2(userR2)}</div>
      </div>
      <div class="score colonel" class:hidden={phase !== 'revealed'}>
        <div class="k">Colonel (R²)</div>
        <div class="v">{phase === 'revealed' ? pctR2(round.colonelR2) : '·····'}</div>
      </div>
    </div>

    {#if phase === 'revealed'}
      <div class="verdict {verdict}">
        {#if verdict === 'uncoupled'}
          🤝 Uncoupled round — the trace holds a calcium event no spike explains, so
          <strong>no single kernel explains the whole thing</strong> and this round counts for nobody.
          The Colonel's free-vector deconvolution over-fit the rogue event into a noisy kernel (see its
          R²); a good-looking score of your own only captures the coupled part. That's the science: sometimes
          there is no clean kernel to find — which is exactly what the real tool exists to surface.
        {:else if verdict === 'you'}
          🏆 You beat the Colonel! Your kernel reconstructs the trace better.
        {:else if verdict === 'colonel'}
          🎖️ The Colonel wins this round — regularized deconvolution edged you out.
        {:else}
          🤝 Dead heat.
        {/if}
      </div>
      <p class="reveal-note">
        Kernel panel now overlays the <span class="true">hidden true kernel</span>,
        the <span class="col">Colonel's</span>, and <span class="you">yours</span>.
      </p>
    {:else}
      <p class="play-note">
        Adjust the sliders and watch <span class="you">your trace</span> track the
        <span class="target">target</span>. The Colonel's result is hidden until you reveal.
        <br /><span class="muted">{round.nSpikes} spikes · {DURATION}s · the Colonel uses regularized deconvolution (λ = {LAMBDA})</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">Kernel — lag (s)</div>
    <div class="sq-body">
      {#key phase}
        <Plot
          fill
          xs={kernelSeries.xs}
          seriesList={kernelSeries.list}
          xRange={kernelXRange}
          xLabel="lag (s)"
          zeroLine
        />
      {/key}
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head">
        <span class="plot-label">Reconstruction — <span class="target">target</span> vs <span class="you">your kernel</span>{#if phase === 'revealed'} vs <span class="col">Colonel (dashed)</span>{/if}</span>
      </div>
      <div class="band-body">
        {#key phase}
          <Plot
            fill
            xs={gridTimes}
            seriesList={reconSeries}
            yAxisSize={48}
            padRight={32}
            syncKey="btc-x"
            cursorPoints={true}
            showXAxis={false}
          />
        {/key}
      </div>
    </div>

    <div class="band">
      <div class="band-head"><span class="plot-label">Known spikes ({round.nSpikes})</span></div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={rasterSamples}
          kind="stems"
          color="var(--text-h)"
          yAxisSize={48}
          padRight={32}
          syncKey="btc-x"
          cursorPoints={true}
          xLabel="time (s)"
        />
      </div>
    </div>
  {/snippet}
</Shell>

<style>
  .rail-title { display: flex; flex-direction: column; gap: 1px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .rail-title strong { font-size: 15px; color: var(--text-h); }
  .rail-title span { font-size: 11px; color: var(--text); font-family: var(--mono); }

  .note { font-size: 12.5px; line-height: 1.5; color: var(--text); background: var(--accent-bg); border: 1px solid var(--accent-border); border-radius: 8px; padding: 10px 12px; }
  .note strong { color: var(--text-h); }

  .you { color: var(--accent); font-weight: 600; }
  .target { color: #2a9d8f; font-weight: 600; }
  .col, .true { color: var(--text-h); font-weight: 600; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .params { display: flex; flex-direction: column; gap: 8px; }
  .slider { display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'lab out' 'rng rng'; gap: 4px 8px; align-items: center; }
  .slider > span { grid-area: lab; font-size: 12.5px; color: var(--text-h); }
  .slider > output { grid-area: out; font-family: var(--mono); font-size: 12px; text-align: right; color: var(--text); }
  .slider > input { grid-area: rng; width: 100%; }

  .cta { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 14px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  .cta:hover { filter: brightness(1.05); }
  .skip { font: inherit; font-size: 12px; background: none; border: none; padding: 0; color: var(--text); cursor: pointer; text-decoration: underline; align-self: flex-start; }
  .skip:hover { color: var(--text-h); }

  .tally { display: flex; gap: 12px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--text); flex-wrap: wrap; }
  .tally strong { color: var(--text-h); font-family: var(--mono); font-size: 14px; }

  /* summary / scoreboard */
  .score-row { display: flex; gap: 12px; }
  .score { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
  .score.you { border-color: var(--accent-border); background: var(--accent-bg); }
  .score.hidden { opacity: 0.6; }
  .score .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text); }
  .score .v { font-family: var(--mono); font-size: 30px; color: var(--text-h); margin-top: 4px; font-variant-numeric: tabular-nums; }

  .verdict { margin-top: 14px; padding: 12px 14px; border-radius: 10px; font-size: 14px; line-height: 1.45; border: 1px solid var(--border); }
  .verdict.you { background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-color: var(--accent-border); color: var(--text-h); }
  .verdict.colonel { background: color-mix(in srgb, #2a9d8f 12%, var(--bg)); border-color: color-mix(in srgb, #2a9d8f 45%, var(--bg)); color: var(--text-h); }
  .verdict.uncoupled, .verdict.tie { background: var(--code-bg); color: var(--text-h); }
  .verdict strong { color: var(--text-h); }
  .reveal-note, .play-note { margin-top: 12px; font-size: 12.5px; color: var(--text); line-height: 1.5; }
  .muted { color: var(--text); opacity: 0.8; }

  .sq-label { font-size: 12px; font-weight: 500; color: var(--text-h); margin-bottom: 4px; flex: none; }
  .sq-body { flex: 1; min-height: 0; }

  .band { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: var(--bg); }
  .band-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; flex: none; }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }
</style>
