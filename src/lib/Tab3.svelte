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
  import { LAMBDA_EXPLAINER_URL } from './methods-url.js';
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
  // Co-registration (ADR-0030) is held by IDENTICAL axis geometry on every band, and a
  // y-LABEL is part of that geometry, not decoration: labelling two of the three bands and
  // not the first shifted its plot 22px left of the others (measured 408…1435 vs 430…1435)
  // and a spike stopped dropping straight onto its response. All three carry a y-label.
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

<!-- compactTop: this tab's square shows the ASSUMED kernel — an input the user picked on Tab 1,
     not a result — so it does not earn 42vh of the viewport while the recovered input, which is
     what this tab exists to show, is squeezed underneath it. -->
<Shell {wide} compactTop>
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
        <!-- Tab 0's plain-language λ section, not the equations: the reader who asks
             "what is λ?" at a slider is by construction the naive reader that section
             was written for, and it hands off to the maths itself. Opens in a new
             browser tab so this tab's signal and settings survive the trip. -->
        <a class="lam-link out-link" href={LAMBDA_EXPLAINER_URL} target="_blank" rel="noopener"
          >What is λ? <span aria-hidden="true">↗</span></a
        >
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
    <!-- Kept short on purpose: this panel shares a compacted top row with the kernel square,
         so prose that runs long scrolls out of sight instead of being read. -->
    <p class="sum-foot">
      A real spike count can't be negative — yet naive inversion returns
      <strong>{pct(report.negativeFraction)}</strong> negative samples.
      {#if apIndepMix > 0}
        And {apIndepEvents} event{apIndepEvents === 1 ? '' : 's'} here had no spike beneath
        {apIndepEvents === 1 ? 'it' : 'them'}: every spike recovered there is invented.
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
          yLabel="dF/F₀"
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

    <!-- THE SHOWPIECE — the recovered input, on its own y-scale and the tallest band here.
         ADR-0043 had superimposed it on the true spikes to make one point (naive inversion
         returns ~0.3 of a unit spike) and paid for it with another: unit-height stems own the
         shared axis, so the recovered trace — the whole output of this tab — was drawn inside
         its bottom third, and the ringing and NEGATIVE LOBES that are the tab's actual lesson
         (FOUNDATIONS §2) were a few pixels of wobble at the baseline. The magnitude point
         does not need the axis to make it: it is a number in the readout above (peak/true)
         and is stated in this band's own header. The ringing does need the axis.

         Separate does NOT mean unlabeled: the header says the scale is this band's own, so
         nothing here implies the recovered input is as tall as a spike (ADR-0024/0029). -->
    <div class="band showpiece">
      <div class="band-head">
        <span class="plot-label">Recovered input — naive deconvolution</span>
        <span class="caption">
          own y-scale{#if Number.isFinite(report.peakRatio)}&nbsp;· peaks at ×{fx(report.peakRatio, 1)} of a unit spike{/if}
        </span>
      </div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={recovered}
          color="var(--series-you)"
          xRange={xView}
          yAxisSize={48}
          yLabel="recovered"
          padRight={PLOT_PAD_R}
          syncKey="tab3-rec-x"
          cursorPoints={true}
          zoomable
          onZoom={handleZoom}
          dblClickReset
          zeroLine
          showXAxis={false}
        />
      </div>
    </div>

    <!-- The truth, as a short strip. It carries one bit per sample, so height beyond
         legibility buys nothing — the same reasoning (and the same capped-not-fixed strip)
         as Tab 1's raster and Tab 0's premise figure. It draws the x-axis for all three
         bands; co-registration is held by identical padRight/yAxisSize, not by every band
         drawing an axis (ADR-0030), so a spike still drops straight onto its response. -->
    <div class="band raster">
      <div class="band-head">
        <span class="plot-label">Input — true spikes ({spikeCount})</span>
        <span class="caption">the answer the deconvolution above is trying to reach</span>
      </div>
      <div class="band-body">
        <Plot
          fill
          xs={gridTimes}
          ys={rasterSamples}
          kind="stems"
          color="var(--series-spikes)"
          xRange={xView}
          yAxisSize={48}
          yLabel="spikes"
          padRight={PLOT_PAD_R}
          syncKey="tab3-rec-x"
          cursorPoints={true}
          zoomable
          onZoom={handleZoom}
          dblClickReset
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
  /* Colour + underline come from the global .out-link (app.css); only the no-wrap
     is local, so the "↗" cannot orphan onto its own line at the end of the hint. */
  .lam-link { white-space: nowrap; }
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
    /* flex is set below, with the basis-is-chrome rule */
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

  /* THE PROPORTION IS THE ARGUMENT. This tab exists to show what naive inversion returns,
     so the recovered input gets the most height of the three; the measured trace is context;
     the spike raster carries one bit per sample and needs only enough to be read.

     A CAP on the raster, not a fixed height — Tab 1's lesson (ADR-0040): these bands divide a
     viewport, so a fixed strip would hold its height while the plots above shrank, inverting
     the priority on a short screen. Capping lets all three shrink together.

     The cap counts the AXIS. This band draws the x-axis and its "time (s)" label, plus the
     band's own header and padding — chrome that comes out of its own share (ADR-0043/0045),
     so the cap buys markedly less plot than its number suggests. Measure `.u-over`, never
     the container.

     `flex: 0 1 auto` does NOT work here, measured: the band body is `min-height: 0`, so a
     content-sized basis collapses the plot to 3px.

     BASIS = CHROME, GROW = PLOT. Equal flex-grow on three bands does not give three
     comparable plots, because chrome is not equal between them — measured here: 82px for a
     band with no x-axis (26px header + 4 margin + 16 padding + 2 border + 34 inside uPlot)
     and 145px for the one that draws the x-axis and its "time (s)" label. With `flex: 1 1 0`
     the raster's whole 149px share vanished into chrome and its stems got 4px. So each band
     declares its own chrome as the flex BASIS and its share of what is left over as the
     GROW: the ratios below (1 : 2.4 : 0.7) are then ratios of actual PLOT height, which is
     the thing being argued about. Generalizes ADR-0043's `flex: 1 1 60px` head start.
     Verify by measuring `.u-over`, never the container. */
  .band { flex: 1 1 82px; }
  .band.showpiece { flex: 2.4 1 82px; }
  .band.raster { flex: 0.7 1 145px; }

  /* On a short viewport the chrome IS the problem — three bands spend ~309px of a ~360px
     band area on headers, padding and the x-axis before a single sample is drawn. So the
     chrome shrinks (and the basis with it), rather than the plots going to slivers. */
  @media (max-height: 820px) {
    .band { padding: 4px 12px; flex-basis: 62px; }
    .band.showpiece { flex-basis: 62px; }
    .band.raster { flex-basis: 125px; }
    .band-head { font-size: 11px; line-height: 1.25; }
    .band-head .caption { display: none; }
    .band-body { margin-top: 2px; }
  }
</style>
