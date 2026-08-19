<script>
  // Tab 3 — spike inference (HONEST ILLUSTRATION, FOUNDATIONS §2).
  //
  // The deliberately-demoted tab: given a measured trace + an ASSUMED kernel,
  // recover the input spikes by naive deconvolution — and show how badly that
  // goes. It is the inverse direction of Tab 2 (which recovers the kernel from
  // known spikes) and reuses the SAME regularized deconvolution spine
  // (inferSpikes → deconvolveCircular). Real spike inference is a separate,
  // harder project (CASCADE / MLspike / OASIS); this tab exists so a learner
  // SEES why, not to compete with it.
  //
  // The signal flows in from Tab 1 (FOUNDATIONS §11.3 / kernel shared between
  // Tabs 1 and 3): the chosen kernel is the "assumed" kernel, and Tab 1's
  // synthesized fluorescence is the "measured" trace. Nothing here is clamped —
  // the ringing and negative lobes are the lesson.
  import Shell from './Shell.svelte';
  import Plot from './Plot.svelte';
  import { inferSpikes, inferenceReport } from './core/index.js';

  let {
    wide = false,
    grid,
    kernel,
    kernelDisplay,
    kernelXRange,
    traceTimes = [],
    traceValues = [],
    gridTimes = [],
    rasterSamples = [],
    spikeCount = 0,
    // AP-independent calcium — read-only here. The dial is global app chrome (ADR-0050);
    // this tab reports what it did to the signal it is inverting.
    apIndepMix = 0,
    apIndepEvents = 0,
    apIndepShare = 0,
  } = $props();

  // Regularization for the naive inverse. λ = 0 is the pure noise-amplifying
  // failure; a small default shows a recovered train with obvious ringing that
  // the user can push to 0 ("watch it fail") or raise (blur the deltas away).
  let lambda = $state(0.05);

  // The trace we actually deconvolve is the measured fluorescence sampled on the
  // recording grid (drop the convolution tail so it aligns with the input grid).
  const traceOnGrid = $derived.by(() => {
    const n = grid?.n ?? gridTimes.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = traceValues[i] ?? 0;
    return out;
  });

  const recovered = $derived.by(() =>
    kernel ? Array.from(inferSpikes(traceOnGrid, kernel, { lambda })) : [],
  );
  const report = $derived.by(() => inferenceReport(recovered, rasterSamples));

  // --- co-registered recording-time x (ADR-0030), same idiom as Tab 1 ---
  const PLOT_PAD_R = 32;
  let zoomRange = $state(null);
  function handleZoom(min, max) {
    zoomRange = min == null ? null : [min, max];
  }
  const leftXRange = $derived.by(() => {
    const min = Math.min(gridTimes[0] ?? 0, traceTimes[0] ?? 0);
    const max = Math.max(
      gridTimes[gridTimes.length - 1] ?? 1,
      traceTimes[traceTimes.length - 1] ?? 1,
    );
    return [min, max];
  });
  const xView = $derived(zoomRange ?? leftXRange);

  const pct = (x) => (Number.isFinite(x) ? Math.round(x * 100) + '%' : '—');
  const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
</script>

<Shell {wide}>
  {#snippet rail()}
    <div class="rail-title">
      <strong>Tab 3 · Spike inference</strong>
      <span>output, kernel → input</span>
    </div>

    <div class="note">
      <strong>Honest illustration.</strong> This runs naive deconvolution to
      guess the spikes from the trace and an <em>assumed</em> kernel. It is
      kept to show <em>why</em> spike inference is hard — not as a workflow.
      Dedicated tools (CASCADE, MLspike, OASIS) live elsewhere.
    </div>

    <div class="field">
      <label for="lam">Regularization λ</label>
      <div class="params">
        <label class="slider">
          <span>λ</span>
          <input id="lam" type="range" min="0" max="1" step="0.01" bind:value={lambda} />
          <output>{fx(lambda, 2)}</output>
        </label>
      </div>
      <p class="hint">
        λ = 0 is the raw inverse — watch it explode into noise. Raising λ tames
        the ringing but blurs the spikes and never restores a clean count.
      </p>
    </div>

    <!-- The dial itself is in the strip above the tabs, the same place on every tab. What
         belongs HERE is its consequence, which is starkest on this tab: naive inversion has
         no way to say "no spike caused this", so it answers a hump with spikes that were
         never fired, and nothing in its output marks which ones. -->
    {#if apIndepMix > 0}
      <div class="note">
        <strong>AP-independent calcium is mixed in ({fx(apIndepMix, 2)}).</strong>
        {apIndepEvents} event{apIndepEvents === 1 ? '' : 's'} in this trace had no spike
        underneath, carrying {Math.round(apIndepShare * 100)}% of its variance. The
        deconvolution is not told, and cannot be — it has only the trace and the kernel.
      </div>
    {/if}

    <div class="note subtle">
      Trace + kernel come from <strong>Tab 1</strong>. Change the spikes, kernel,
      or noise there, then return here to see how recovery copes. The
      <em>AP-independent calcium</em> dial above the tabs works on this trace from
      any tab — one signal, one dial.
    </div>
  {/snippet}

  {#snippet summary()}
    <div class="sum-eq">input ≈ deconv( trace ; kernel )</div>
    <div class="sum-sub">Naive spike inference — the recovered input vs. the truth.</div>
    <div class="readouts">
      <div class="ro"><div class="k">λ</div><div class="v">{fx(lambda, 2)}</div></div>
      <div class="ro"><div class="k">Recovered &lt; 0</div><div class="v">{pct(report.negativeFraction)}</div></div>
      <div class="ro"><div class="k">Peak / true</div><div class="v">{Number.isFinite(report.peakRatio) ? '×' + fx(report.peakRatio, 1) : '—'}</div></div>
      <div class="ro"><div class="k">Corr. w/ truth</div><div class="v">{fx(report.correlation, 2)}</div></div>
    </div>
    <p class="sum-foot">
      A real spike count can't be negative — yet naive inversion produces
      <strong>{pct(report.negativeFraction)}</strong> negative samples. That, and
      the ringing below, is why honest spike inference needs more than a division.
      {#if apIndepMix > 0}
        With the AP-independent dial at <strong>{fx(apIndepMix, 2)}</strong>,
        {apIndepEvents} event{apIndepEvents === 1 ? '' : 's'} in this trace had no spike
        underneath at all — every spike the inversion returns there is invented, and
        nothing in the output marks which ones.
      {/if}
    </p>
  {/snippet}

  {#snippet kernelPanel()}
    <div class="sq-label">Assumed kernel — lag (s)</div>
    <div class="sq-body">
      <Plot
        fill
        xs={kernelDisplay.t}
        ys={kernelDisplay.v}
        color="var(--series-you)"
        xRange={kernelXRange}
        xLabel="lag (s)"
        zeroLine
      />
    </div>
  {/snippet}

  {#snippet bands()}
    <div class="band">
      <div class="band-head"><span class="plot-label">Measured trace — fed to the deconvolution</span></div>
      <div class="band-body">
        <Plot
          fill
          xs={traceTimes}
          ys={traceValues}
          color="var(--series-trace)"
          xRange={xView}
          yAxisSize={48}
          padRight={PLOT_PAD_R}
          syncKey="tab3-rec-x"
          cursorPoints={true}
          zoomable
          onZoom={handleZoom}
          dblClickReset
          showXAxis={false}
        />
      </div>
    </div>

    <!-- TRUE vs RECOVERED, superimposed. They were two stacked bands, which cost a third of
         the column and — because the bottom band is the one carrying the x-axis and its label,
         ~60px out of an equal share — left the recovered trace with an 8px-tall plot: too
         short to read, and short enough to make a positive peak look like a negative one.
         Overlaying them is also the better comparison: the recovered estimate is in the SAME
         units as the input it estimates, so on one shared y-axis the reader sees directly that
         naive deconvolution returns ~30% of a unit spike's height, smeared, with ringing
         between the spikes. That gap IS the lesson (FOUNDATIONS §2) and two separate y-axes
         were hiding it. -->
    <div class="band axis">
      <div class="band-head">
        <span class="plot-label">Input — true spikes vs recovered</span>
        <span class="legend">
          <span class="key"><i class="stem"></i>true spikes ({spikeCount})</span>
          <span class="key"><i class="line"></i>recovered — naive deconvolution</span>
        </span>
      </div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={rasterSamples}
          kind="stems"
          color="var(--series-spikes)"
          ys2={recovered}
          color2="var(--series-you)"
          xRange={xView}
          yAxisSize={48}
          padRight={PLOT_PAD_R}
          syncKey="tab3-rec-x"
          cursorPoints={true}
          zoomable
          onZoom={handleZoom}
          dblClickReset
          zeroLine
          xLabel="time (s)"
        />
      </div>
    </div>
  {/snippet}
</Shell>

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
  .note.subtle { background: none; border-color: var(--border); }
  .note strong { color: var(--text-h); }

  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: 14px; color: var(--text-h); font-weight: 500; }
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
  .sum-foot { margin-top: 14px; font-size: 12.5px; color: var(--text); }
  .sum-foot strong { color: var(--text-h); }

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

  /* The band carrying the x-axis pays for it out of its own share. uPlot spends ~60px on the
     tick row plus the "time (s)" label, so with a plain equal split the axis band's PLOT ends
     up that much shorter than its neighbour's — which is how the recovered trace came to be
     drawn 8px tall. Equal flex-grow with a 60px head start on the basis hands that back, so
     the two PLOTS match rather than the two containers. */
  .band.axis { flex: 1 1 60px; }

  /* Inline key — two series in one band, so identity is never left to color alone. */
  .band-head .legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 11px; color: var(--text); }
  .band-head .key { display: inline-flex; align-items: center; gap: 5px; }
  .band-head .key i { width: 14px; display: inline-block; }
  .band-head .key i.stem { height: 9px; width: 3px; border-radius: 1px; background: var(--series-spikes); }
  .band-head .key i.line { height: 3px; border-radius: 2px; background: var(--series-you); }
</style>
