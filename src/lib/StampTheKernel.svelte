<script>
  // Tab 1 · Challenge mode — "Stamp the kernel".
  //
  // The FORWARD problem, played forward (ADR-0046), rebuilt around the transformation
  // itself (ADR-0047): clicking a spike CONSUMES it and puts a copy of the kernel in
  // the output at that time. Convolution replaces every delta with a scaled copy of
  // the kernel and adds the copies; here you perform that replacement one delta at a
  // time and watch the input drain into the output.
  //
  // Because a click snaps to the nearest un-stamped spike, you cannot misplace a
  // kernel — which is deliberate. The only way to be wrong is to LEAVE ONE BEHIND,
  // and the place that happens is a burst, where two deltas sit a few pixels apart.
  // That is the superposition lesson, and it is the whole difficulty:
  //
  //   Normal   — target visible, and the running count shows N / total.
  //   Advanced — target hidden AND the total withheld, so "have I got them all?" is
  //              a real question you answer by reading the spike train.
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

  const DURATION = 30; // s
  const RATE = 10;
  const WIN_S = 5;
  const GRAB_S = 1.0; // click tolerance: nearest un-stamped spike within this window wins
  const grid = makeGrid({ sampleRate: RATE, duration: DURATION });
  const gridTimes = Array.from(grid.times);
  const KERNEL_PEAK = 0.1;
  // Pinned y-axis. An empty series would auto-range to 0–100 and read as broken, and in
  // Advanced an axis that grew to fit the hidden target would hand over the burst peak
  // being predicted. Derived from constants, so identical in every round (ADR-0046).
  const Y_RANGE = [-0.03, KERNEL_PEAK * 3.5];

  let roundSeed = $state(1);
  let phase = $state('play');
  let advanced = $state(false);
  let stamped = $state([]); // spike times already turned into kernels
  let celebrateToken = $state(0);

  let elapsedMs = $state(0);
  let yourTimeMs = $state(0);
  let timerStart = 0;
  $effect(() => {
    const _seed = roundSeed;
    const _adv = advanced;
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

  // Groups, not a Poisson draw: an even sprinkle of isolated spikes would never show
  // superposition, and leaving one behind is only possible where two sit close (ADR-0046).
  const round = $derived.by(() => {
    const rand = mulberry32(roundSeed * 2654435761 + 517);
    const kernel = buildKernel(
      'calcium',
      { tauRise: 0.1 + rand() * 0.1, tauDecay: 0.35 + rand() * 0.35 },
      grid.dt,
      KERNEL_PEAK,
    );
    const sizes = [1, 1, 2, 1, 3, 1];
    const slot = DURATION / sizes.length;
    const spikes = [];
    sizes.forEach((n, i) => {
      const start = i * slot + 0.8 + rand() * (slot - 2.6);
      for (let k = 0; k < n; k++) spikes.push(+(start + k * (0.25 + rand() * 0.1)).toFixed(1));
    });
    spikes.sort((a, b) => a - b);
    const raster = rasterize(spikes, grid, { amplitudeMode: 'unit' });
    const target = sliceGrid(convolveOnGrid(raster.samples, grid, kernel).samples, kernel.zeroIndex);
    return { spikes, kernel, target, nSpikes: spikes.length };
  });

  const remaining = $derived(round.spikes.filter((s) => !stamped.includes(s)));
  // Your output IS a convolution — the stamped deltas ⊗ the same given kernel.
  const userOut = $derived(
    sliceGrid(
      convolveOnGrid(rasterize(stamped, grid, { amplitudeMode: 'unit' }).samples, grid, round.kernel).samples,
      round.kernel.zeroIndex,
    ),
  );
  const userR2 = $derived(rSquared(userOut, round.target, grid.n));
  const targetVisible = $derived(!advanced || phase === 'revealed');
  const totalVisible = $derived(!advanced || phase === 'revealed');
  const allDone = $derived(remaining.length === 0);

  // Click = stamp the NEAREST un-stamped spike. Nearest-wins (rather than a tight hit
  // box) keeps a burst clickable: click the same pixel twice and you consume both, since
  // the first is gone by the second click. You still have to click once per spike.
  function stampNearest(t) {
    let best = -1;
    let bestD = GRAB_S;
    remaining.forEach((s) => {
      const d = Math.abs(s - t);
      if (d < bestD) { bestD = d; best = s; }
    });
    if (best < 0) return;
    stamped = [...stamped, best].sort((a, b) => a - b);
    // Count the state we just set rather than re-reading the derived `remaining`, whose
    // freshness inside the same call is not something to depend on. In Normal the round
    // ends the moment the input is empty; Advanced always waits for an explicit Done,
    // because there the whole question is whether you believe you have found them all.
    if (!advanced && stamped.length === round.nSpikes) finish();
  }
  // Shift-click puts one back, so a misread burst is recoverable without a full reset.
  function unstamp(idx) {
    if (idx >= 0 && idx < stamped.length) stamped = stamped.filter((_, i) => i !== idx);
  }
  const startOver = () => { stamped = []; phase = 'play'; };

  function finish() {
    yourTimeMs = performance.now() - timerStart;
    phase = 'revealed';
    if (stamped.length === round.nSpikes) celebrateToken += 1;
  }
  function newRound() {
    roundSeed += 1;
    phase = 'play';
    stamped = [];
  }
  function toggleAdvanced() {
    advanced = !advanced;
    phase = 'play';
    stamped = [];
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
  const stems = (times, h) => {
    const a = new Float64Array(grid.n);
    for (const t of times) {
      const i = Math.round(t / grid.dt);
      if (i >= 0 && i < grid.n) a[i] = h;
    }
    return Array.from(a);
  };
  const remainingStems = $derived(stems(remaining, 1));
  // Already-stamped deltas stay on the axis as a recessive stub rather than vanishing
  // outright: literally "taken away" would leave a burst's second spike with nothing to
  // shift-click back, and no way to see how far you have got. They are drawn SHORT as well
  // as grey — at 3px wide, ink-vs-grey alone is too fine a distinction to act on, and
  // height is the channel that reads at a glance. Which is still to do is the one thing
  // this band has to answer instantly.
  const stampedStems = $derived(stems(stamped, 0.45));
  const pctR2 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Stamp the kernel</strong>
      <span>turn every spike into its kernel</span>
    </div>

    <div class="note">
      Convolution <strong>replaces each spike with a copy of the kernel</strong>, and the copies add.
      <strong>Click each spike in the spike plot to stamp a kernel into the output.</strong>
      The spike is used up as you go; shift-click a
      <span class="done">stamped</span> one to put it back.
      {#if advanced}
        The <span class="target">target</span> and the spike <strong>count</strong> are hidden —
        find them all yourself, then finish.
      {/if}
    </div>

    {#if phase === 'play'}
      <button class="cta" onclick={finish} disabled={stamped.length === 0}>
        {advanced ? "Done — reveal & check →" : 'Finish →'}
      </button>
    {:else}
      <button class="cta" onclick={newRound}>New round →</button>
    {/if}
    <div class="minirow">
      <button class="skip" onclick={startOver}>start over</button>
      <button class="skip" onclick={newRound}>skip</button>
    </div>

    <label class="adv"><input type="checkbox" checked={advanced} onchange={toggleAdvanced} />
      Advanced — hide the target and the count</label>

    <p class="hint">
      Watch a burst: the second kernel lands on the first one's tail, so the peak grows instead of
      repeating. That is superposition — and it is why a missed spike shows up as a short peak.
    </p>
  {/snippet}

  {#snippet summary()}
    <div class="score-row">
      <div class="score you">
        <div class="k">Spikes stamped</div>
        <div class="v">{stamped.length}{#if totalVisible}&nbsp;<small>/ {round.nSpikes}</small>{/if}</div>
        <div class="t">⏱ {fmtTime(phase === 'play' ? elapsedMs : yourTimeMs)}</div>
      </div>
      <div class="score">
        <div class="k">Output match (R²)</div>
        <div class="v">{targetVisible ? pctR2(userR2) : '—'}</div>
      </div>
    </div>
    {#if phase === 'revealed'}
      <div class="verdict {allDone ? 'good' : 'ok'}">
        {#if allDone}🏆 Every spike stamped — your output IS the convolution.
        {:else}👍 {remaining.length} spike{remaining.length === 1 ? '' : 's'} left unstamped. Look at
          the bursts: two deltas a few pixels apart still need two kernels.{/if}
      </div>
      <p class="reveal-note">
        Your trace is <em>the stamped deltas ⊗ the same kernel</em> — a real convolution, so where it
        falls short of the <span class="target">target</span>, a spike is still un-stamped underneath.
      </p>
    {:else}
      <p class="play-note">
        {#if advanced}
          The target and the total are hidden. Stamp every spike you can find, then reveal.
        {:else}
          Each click moves one delta out of the input and one kernel into the output.
        {/if}
        <br /><span class="muted">click a spike to stamp it · shift-click a stamped one to undo</span>
      </p>
    {/if}
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">The kernel each spike becomes — lag (s)</div>
    <div class="sq-body">
      <Plot fill xs={kernelPanelSeries.xs} seriesList={kernelPanelSeries.list} xRange={kernelXRange} xLabel="lag (s)" zeroLine />
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head">
        <!-- trailing &nbsp;: Svelte trims an {#if} block's edge whitespace (ADR-0042) -->
        <span class="plot-label">
          Output — {#if targetVisible}<span class="target">target</span> vs&nbsp;{/if}<span class="you">your stamped kernels, summed</span>
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
        <span class="plot-label">
          Spikes — click each one to stamp its kernel into the output{#if remaining.length}&nbsp;({remaining.length} left){/if}
        </span>
        <span class="legend">
          <span class="key"><i class="todo"></i>still to stamp (tall)</span>
          <span class="key"><i class="done"></i>stamped (short)</span>
        </span>
      </div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={remainingStems}
          ys2={stampedStems}
          ys2Bars
          kind="stems"
          color="var(--series-spikes)"
          color2="var(--series-truth)"
          barSize={[0.5, 5]}
          yRange={[0, 1.2]}
          yAxisSize={48}
          padRight={32}
          syncKey="stk-x"
          cursorPoints={true}
          xLabel="time (s)"
          editable
          spikeTimesForEdit={stamped}
          editSnapDt={grid.dt}
          onSpikeAdd={stampNearest}
          onSpikeRemove={unstamp}
        />
      </div>
    </div>
  {/snippet}
</Shell>

<Celebration trigger={celebrateToken} />

<style>
  .rail-title {
    display: flex; flex-direction: column; gap: 1px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .rail-title strong { font-size: 15px; color: var(--text-h); }
  .rail-title span { font-size: 11px; color: var(--text); font-family: var(--mono); }

  .note {
    font-size: 12.5px; line-height: 1.5; color: var(--text);
    background: var(--accent-bg); border: 1px solid var(--accent-border);
    border-radius: 8px; padding: 10px 12px;
  }
  .note strong { color: var(--text-h); }
  .you { color: var(--series-you); font-weight: 600; }
  .target { color: var(--series-trace); font-weight: 600; }
  .done { color: var(--series-truth); font-weight: 600; }

  .hint { font-size: 12px; line-height: 1.5; color: var(--text); margin: 0; }
  .adv { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); }

  .cta {
    font: inherit; font-size: 14px; font-weight: 600; padding: 9px 14px;
    border: 1px solid var(--accent); border-radius: 8px;
    background: var(--accent); color: #fff; cursor: pointer;
  }
  .cta:disabled { opacity: 0.45; cursor: default; }
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
    flex: 1 1 0; min-height: 0; display: flex; flex-direction: column;
    border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; background: var(--bg);
  }
  /* The band drawing the x-axis pays ~31px of uPlot chrome; a matching basis head start
     equalizes the PLOTS rather than the containers (ADR-0043/0045). */
  .band.axis { flex: 1 1 31px; }
  .band-head {
    display: flex; flex-wrap: wrap; align-items: baseline;
    justify-content: space-between; gap: 8px; flex: none;
  }
  .plot-label { font-size: 12px; font-weight: 500; color: var(--text-h); }
  .caption { font-weight: 400; color: var(--text); font-size: 11px; }
  .band-body { flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 4px; }

  /* Inline key — two series in one band; classes, never inline styles (ADR-0045). */
  .band-head .legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 11px; color: var(--text); }
  .band-head .key { display: inline-flex; align-items: center; gap: 5px; }
  .band-head .key i { width: 3px; height: 9px; border-radius: 1px; display: inline-block; }
  .band-head .key i.todo { background: var(--series-spikes); }
  .band-head .key i.done { background: var(--series-truth); height: 5px; }
</style>
