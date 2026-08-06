<script>
  // Tab 1 · Challenge mode — "Stamp the kernel".
  //
  // The FORWARD problem, played by hand, and the only challenge that runs in its
  // own tab's direction (ADR-0046). Tab 2 recovers a kernel from known spikes;
  // Tab 3 infers spikes from a known kernel. Tab 1 is input ⊗ kernel → output, so
  // here BOTH the spikes and the kernel are given and you build the OUTPUT.
  //
  // The interaction is literally the algorithm in convolve.js (ADR-0044): "stamp
  // and sum" — drop a copy of the kernel at each spike and let the copies add.
  // Your stamps are rasterized and convolved with the SAME given kernel, so your
  // assembled trace is a real convolution of your own placements, not a mock-up.
  //
  //   Normal   — the target output is VISIBLE; match it. A checking exercise.
  //   Advanced — the target is HIDDEN until you commit; predict it, then reveal.
  //
  // The round always contains one tight pair and one triplet, because overlapping
  // stamps SUM: that is the one thing a learner gets wrong, and the only way to
  // score well on a burst is to stamp every spike in it (FOUNDATIONS §1).
  import Shell from './Shell.svelte';
  import Plot from './Plot.svelte';
  import Celebration from './Celebration.svelte';
  import {
    makeGrid,
    rasterize,
    buildKernel,
    convolveOnGrid,
    rSquared,
    mulberry32,
  } from './core/index.js';

  let { wide = false } = $props();

  const DURATION = 30; // s — short enough that every spike is reachable by mouse
  const RATE = 10;
  const WIN_S = 5;
  // R² that earns a celebration, set from the measured score distribution rather than by
  // feel. On a representative round: every spike stamped exactly = 1.000, one stamp a single
  // sample off = 0.990, three off = 0.970 — but MISSING a spike = 0.907, and one spurious
  // extra = 0.907. 0.97 is the gap between those two populations, so "you got them all,
  // roughly placed" passes and "you missed one" cannot. A looser 0.9 would have celebrated a
  // missed spike, which is precisely the mistake this challenge exists to expose.
  const GOOD_FIT = 0.97;
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);
  const KERNEL_PEAK = 0.1; // every round's kernel amplitude (dF/F₀)
  // The output band's y-axis is PINNED, for two reasons. With no stamps yet the series is all
  // zeros and uPlot would auto-range to 0–100, which reads as a broken plot. And in Advanced
  // the axis must not adapt to the hidden target — a range that grew to fit it would hand over
  // the burst peak, which is exactly the quantity being predicted. The bound is derived from
  // the kernel peak and the largest group (3), so it is identical in every round and leaks
  // nothing round-specific.
  const Y_RANGE = [-0.03, KERNEL_PEAK * 3.5];

  let roundSeed = $state(1);
  let phase = $state('play');
  let advanced = $state(false); // target hidden until you commit
  let userStamps = $state([]); // times (s) where the player has stamped a kernel copy
  let celebrateToken = $state(0);

  // timer (live during play, frozen on reveal) — same idiom as the other two challenges
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

  // The round. NOT a Poisson draw: a Poisson train at this length is mostly isolated
  // spikes, and isolated spikes make the exercise a clicking chore that never shows
  // superposition. Instead the spikes are placed as deliberate groups — singles, one
  // PAIR and one TRIPLET, each group's members within a kernel decay of one another —
  // so the summed peaks differ visibly by group size and stamping only one of a burst
  // is immediately wrong in the trace.
  const round = $derived.by(() => {
    const rand = mulberry32(roundSeed * 2654435761 + 517);
    const kernel = buildKernel(
      'calcium',
      { tauRise: 0.1 + rand() * 0.1, tauDecay: 0.35 + rand() * 0.35 },
      grid.dt,
      0.1,
    );
    const sizes = [1, 1, 2, 1, 3, 1]; // one pair, one triplet, four singles
    const slot = DURATION / sizes.length;
    const spikes = [];
    sizes.forEach((n, i) => {
      const start = i * slot + 0.8 + rand() * (slot - 2.6);
      for (let k = 0; k < n; k++) spikes.push(+(start + k * (0.25 + rand() * 0.1)).toFixed(1));
    });
    spikes.sort((a, b) => a - b);
    const raster = rasterize(spikes, grid, { amplitudeMode: 'unit' });
    // The target is CLEAN: this challenge is about the operator, not about noise.
    const target = sliceGrid(convolveOnGrid(raster.samples, grid, kernel).samples, kernel.zeroIndex);
    return { spikes, kernel, target, nSpikes: spikes.length, sizes };
  });

  // Your assembled trace IS a convolution — your stamps ⊗ the same given kernel.
  const userRaster = $derived(rasterize(userStamps, grid, { amplitudeMode: 'unit' }));
  const userOut = $derived(
    sliceGrid(convolveOnGrid(userRaster.samples, grid, round.kernel).samples, round.kernel.zeroIndex),
  );
  const userR2 = $derived(rSquared(userOut, round.target, grid.n));
  const targetVisible = $derived(!advanced || phase === 'revealed');

  // --- stamping (the shared editable Plot) ---
  function addStamp(t) {
    if (t < 0 || t > DURATION) return;
    if (userStamps.some((s) => Math.abs(s - t) < grid.dt / 2)) return; // one per frame
    userStamps = [...userStamps, t].sort((a, b) => a - b);
  }
  const removeStamp = (idx) => (userStamps = userStamps.filter((_, i) => i !== idx));
  const moveStamp = (idx, t) => {
    if (t < 0 || t > DURATION) return;
    userStamps = userStamps.map((s, i) => (i === idx ? t : s));
  };
  const clearStamps = () => (userStamps = []);

  function reveal() {
    yourTimeMs = performance.now() - timerStart;
    phase = 'revealed';
    if (Number.isFinite(userR2) && userR2 >= GOOD_FIT) celebrateToken += 1;
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    userStamps = [];
  }
  function toggleAdvanced() {
    advanced = !advanced;
    phase = 'play';
    userStamps = [];
  }

  // --- series ---
  const outSeries = $derived.by(() => {
    const list = [];
    if (targetVisible) list.push({ ys: Array.from(round.target), stroke: 'var(--series-trace)', width: 2 });
    list.push({ ys: Array.from(userOut), stroke: 'var(--series-you)', width: 2 });
    return list;
  });
  const kernelPanelSeries = $derived.by(() => {
    const k = sampleOnLag(round.kernel);
    return { xs: k.t, list: [{ ys: k.v, stroke: 'var(--series-truth)', width: 2 }] };
  });
  const kernelXRange = [-WIN_S, WIN_S];
  // Given spikes UP, your stamps DOWN — direction carries whose, so the two never
  // occlude each other where it matters most (a stamp sitting on its spike).
  const givenUp = $derived.by(() => {
    const a = new Float64Array(grid.n);
    for (const t of round.spikes) {
      const i = Math.round(t / grid.dt);
      if (i >= 0 && i < grid.n) a[i] = 1;
    }
    return Array.from(a);
  });
  const stampsDown = $derived.by(() => {
    const a = new Float64Array(grid.n);
    for (const t of userStamps) {
      const i = Math.round(t / grid.dt);
      if (i >= 0 && i < grid.n) a[i] = -1;
    }
    return Array.from(a);
  });

  // How many spikes sit in bursts — the part that superposition actually tests.
  const inBursts = $derived(round.sizes.filter((n) => n > 1).reduce((a, b) => a + b, 0));
  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Stamp the kernel</strong>
      <span>spikes + kernel given · build the output</span>
    </div>

    <div class="note">
      Convolution is <strong>stamp and sum</strong>: drop a copy of the
      <span class="given">kernel</span> at every <span class="given">spike</span> and let the copies
      add. <strong>Click the spike band</strong> to stamp (shift-click removes, drag moves).
      {#if advanced}
        The <span class="target">target</span> is <strong>hidden</strong> — predict it, then reveal.
      {:else}
        Match <span class="you">your trace</span> to the <span class="target">target</span>.
      {/if}
    </div>

    {#if phase === 'play'}
      <button class="cta" onclick={reveal}>{advanced ? 'Reveal & score →' : 'Score it →'}</button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <div class="minirow">
      <button class="skip" onclick={clearStamps}>clear stamps</button>
      <button class="skip" onclick={newRound}>skip</button>
    </div>

    <label class="adv"><input type="checkbox" checked={advanced} onchange={toggleAdvanced} />
      Advanced — hide the target (predict it)</label>

    <p class="hint">
      Bursts are the point: {inBursts} of the {round.nSpikes} spikes sit close enough that their
      transients overlap. Stamp only one and the peak comes out short.
    </p>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">Your trace (R²)</div>
        <div class="v">{pctR2(userR2)}</div>
        <div class="t">⏱ {fmtTime(phase === 'play' ? elapsedMs : yourTimeMs)}</div>
      </div>
      <div class="score">
        <div class="k">Stamps placed</div>
        <div class="v">{userStamps.length}{#if phase === 'revealed'}&nbsp;<small>/ {round.nSpikes}</small>{/if}</div>
      </div>
    </div>
    {#if phase === 'revealed'}
      <div class="verdict {userR2 >= GOOD_FIT ? 'good' : 'ok'}">
        {#if userR2 >= 0.995}🏆 Exact — you rebuilt the convolution by hand.
        {:else if userR2 >= GOOD_FIT}✅ Close. Check the bursts: every spike needs its own copy.
        {:else}👍 Not yet. Where your trace is short, a stamp is missing underneath.{/if}
      </div>
      <p class="reveal-note">
        Your trace is <em>your stamps ⊗ the same kernel</em> — a real convolution, so any gap is a
        placement, never the arithmetic.
      </p>
    {:else}
      <p class="play-note">
        {#if advanced}
          The target is hidden. Stamp every spike, then reveal to see how the sum lands.
        {:else}
          R² updates live. A peak taller than the rest has more than one spike under it.
        {/if}
        <br /><span class="muted">click to stamp · shift-click to remove · drag to move</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">Given kernel — lag (s)</div>
    <div class="sq-body">
      <Plot fill xs={kernelPanelSeries.xs} seriesList={kernelPanelSeries.list} xRange={kernelXRange} xLabel="lag (s)" zeroLine />
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head">
        <span class="plot-label">
          <!-- trailing &nbsp;: Svelte trims an {#if} block's edge whitespace (ADR-0042) -->
          Output — {#if targetVisible}<span class="target">target</span> vs&nbsp;{/if}<span class="you">your stamps summed</span>
        </span>
        {#if !targetVisible}<span class="caption">target hidden (advanced)</span>{/if}
      </div>
      <div class="band-body">
        {#key targetVisible}
          <Plot fill xs={gridTimes} seriesList={outSeries} yRange={Y_RANGE} yAxisSize={48} padRight={32}
                syncKey="stk-x" cursorPoints={true} yLabel="dF/F₀" showXAxis={false} />
        {/key}
      </div>
    </div>

    <div class="band axis">
      <div class="band-head">
        <span class="plot-label">Spikes ({round.nSpikes}) &amp; your stamps ({userStamps.length})</span>
        <span class="legend">
          <span class="key"><i class="given"></i>given spikes (up)</span>
          <span class="key"><i class="you"></i>your stamps (down)</span>
        </span>
      </div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={givenUp}
          ys2={stampsDown}
          ys2Bars
          kind="stems"
          color="var(--series-spikes)"
          color2="var(--series-you)"
          barSize={[0.5, 5]}
          yRange={[-1.2, 1.2]}
          yAxisSize={48}
          padRight={32}
          syncKey="stk-x"
          cursorPoints={true}
          zeroLine
          xLabel="time (s)"
          editable
          spikeTimesForEdit={userStamps}
          editSnapDt={grid.dt}
          onSpikeAdd={addStamp}
          onSpikeRemove={removeStamp}
          onSpikeMove={moveStamp}
        />
      </div>
    </div>
  {/snippet}
</Shell>

<Celebration trigger={celebrateToken} />

<style>
  .rail-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .rail-title strong { font-size: 15px; color: var(--text-h); }
  .rail-title span { font-size: 11px; color: var(--text); font-family: var(--mono); }

  .note {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text);
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .note strong { color: var(--text-h); }
  .you { color: var(--series-you); font-weight: 600; }
  .target { color: var(--series-trace); font-weight: 600; }
  .given { color: var(--series-spikes); font-weight: 600; }

  .hint { font-size: 12px; line-height: 1.5; color: var(--text); margin: 0; }
  .adv { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); }

  .cta {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 14px;
    border: 1px solid var(--accent); border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer;
  }
  .minirow { display: flex; gap: 14px; }
  .skip { font: inherit; font-size: 12.5px; color: var(--text); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
  .skip:hover { color: var(--text-h); }

  .score-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .score { flex: 1 1 0; min-width: 120px; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
  .score.you { border-color: var(--accent-border); background: var(--accent-bg); }
  .score .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text); }
  .score .v { font-family: var(--mono); font-size: 30px; color: var(--text-h); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .score .t { font-family: var(--mono); font-size: 11px; color: var(--text); }

  .verdict { margin-top: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }
  .verdict.good { background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-color: var(--accent-border); color: var(--text-h); }
  .verdict.ok { background: var(--code-bg); color: var(--text-h); }
  .reveal-note, .play-note { font-size: 12.5px; line-height: 1.5; color: var(--text); margin: 10px 0 0; }
  .muted { color: var(--text); opacity: 0.8; }

  .sq-label { font-size: 12px; font-weight: 500; color: var(--text-h); margin-bottom: 4px; flex: none; }
  .sq-body { flex: 1; min-height: 0; }

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
  /* The band drawing the x-axis pays ~31px of uPlot chrome out of its share; an equal
     flex-grow with a matching basis head start equalizes the PLOTS (ADR-0043/0045). */
  .band.axis { flex: 1 1 31px; }
  .band-head {
    display: flex; flex-wrap: wrap; align-items: baseline;
    justify-content: space-between; gap: 8px; flex: none;
  }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .caption { font-weight: 400; color: var(--text); font-size: 11px; }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }

  /* Inline key — two series in one band, so identity is never color-alone (the
     up/down direction is the secondary encoding). Classes, never inline styles (ADR-0045). */
  .band-head .legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 11px; color: var(--text); }
  .band-head .key { display: inline-flex; align-items: center; gap: 5px; }
  .band-head .key i { width: 3px; height: 9px; border-radius: 1px; display: inline-block; }
  .band-head .key i.given { background: var(--series-spikes); }
  .band-head .key i.you { background: var(--series-you); }
</style>
