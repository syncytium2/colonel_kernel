<script>
  // Tab 0's premise figure, live and x-zoomable.
  //
  // The whole argument is that spikes and calcium correspond only SOMETIMES, and at 10,800
  // samples across 18 minutes a static render cannot show the evidence — the shape of an
  // AP-independent event is a couple of pixels wide until you can zoom into it. That is why
  // this is interactive.
  //
  // It ships NO DATA. The trace is generated in the browser by simulatePremise() — 1 ms for
  // the whole recording — so the payload is a few kB of code rather than a recording, and
  // the consent question that blocked an earlier interactive version does not arise. See
  // src/lib/core/premise-sim.js and docs/img/README.txt for how that came about.
  //
  // Two co-registered bands (ADR-0030): calcium on top, a thin spike raster beneath, sharing
  // one x-range and one cursor, so the eye drops from a tick straight up into the transient
  // it caused. uPlot draws bars from the y=0 baseline, so a tick band inside a single axes
  // is not available — and the stacked pair is what Tabs 1 and 2 already use.

  import Plot from './Plot.svelte';
  import { simulatePremise } from './core/premise-sim.js';
  import premisePng from './assets/premise_sim.png?url';

  // Synchronous on purpose. The generator costs ~1 ms and its core dependencies
  // (rasterize / buildKernel / convolveOnGrid / addAWGN) are already in the entry bundle
  // because Tab 1 imports them, so there is nothing to defer and no skeleton to flash.
  const sim = simulatePremise();

  const xs = Array.from(sim.times);
  const ys = Array.from(sim.calcium);
  const spikeXs = sim.spikes;
  const spikeYs = sim.spikes.map(() => 1);
  const full = [sim.times[0], sim.times[sim.times.length - 1]];

  // Y is PINNED to the whole-recording range, never autoscaled per zoom. Letting it rescale
  // made an earlier version actively misleading: zooming into a stretch redrew small events
  // on a tight axis and made them look like healthy signal. Amplitude is the argument here —
  // a five-spike burst is five times a one-spike burst, and the no-AP events are larger than
  // either — and ADR-0024/0029 already reject display scaling that misleads about magnitude.
  // Zooming changes WHICH samples you see, never how big they look.
  const yFixed = (() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of ys) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  })();

  let zoom = $state(null); // [min,max], or null = full view
  const xView = $derived(zoom ?? full);

  // Shade each event's ONSET on both bands, so it stays findable at any zoom and the raster
  // underneath is visibly empty there.
  //
  // Deliberately the onset only, not the whole event. Shading the slow one across its full
  // 30 s decay swallowed a later spike burst that rides on that tail, which read as if those
  // spikes belonged to the unexplained event — the opposite of the claim. The narrow band
  // marks where it STARTS, which is where "no spike caused this" is actually shown.
  const SHADE = 'rgba(240, 168, 0, 0.17)';
  const regions = sim.independentEvents.map((e) => ({
    x0: e.atS - 3,
    x1: e.atS + 9,
    color: SHADE,
  }));

  // Equal right-edge padding on both bands. uPlot only reserves right-edge space when an
  // x-axis is shown, and only the lower band shows one — without this the plot areas shear
  // and a tick no longer sits under its transient (ADR-0030).
  const PAD_R = 28;

  function onZoom(min, max) {
    zoom = min == null ? null : [min, max];
  }

  // Dragging is discoverable only if you already suspect there is something to find. These
  // put the payoff one click away — which matters because the events are a few pixels wide
  // in the full view, and a reader who never zooms never sees the point of the figure.
  const jumps = sim.independentEvents.map((e, i) => ({
    label: e.shape === 'slow' ? 'slow event' : `brief event ${i === 0 ? '1' : '2'}`,
    range: [e.atS - 14, e.atS + (e.shape === 'slow' ? 52 : 26)],
  }));

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(0) : '—');
  const spikesInView = $derived(
    sim.spikes.filter((s) => s >= xView[0] && s <= xView[1]).length,
  );
  const eventsInView = $derived(
    sim.independentEvents.filter((e) => e.atS >= xView[0] && e.atS <= xView[1]).length,
  );
</script>

<figure class="premise">
  <div class="band trace">
    <Plot
      fill
      {xs}
      {ys}
      color="var(--series-trace)"
      xRange={xView}
      yRange={yFixed}
      yAxisSize={54}
      padRight={PAD_R}
      yLabel="dF/F₀"
      {regions}
      syncKey="premise-x"
      cursorPoints={true}
      zoomable
      {onZoom}
      dblClickReset
      showXAxis={false}
    />
  </div>

  <div class="band raster">
    <Plot
      height={136}
      xs={spikeXs}
      ys={spikeYs}
      kind="stems"
      color="var(--series-spikes)"
      xRange={xView}
      yRange={[0, 1]}
      yAxisSize={54}
      padRight={PAD_R}
      barSize={[0.35, 2]}
      yLabel="spikes"
      {regions}
      syncKey="premise-x"
      cursorPoints={false}
      zoomable
      {onZoom}
      dblClickReset
      xLabel="time (s)"
    />
  </div>

  <div class="controls">
    <span class="hint">Drag either band to zoom · double-click to reset</span>
    <span class="jump">
      Jump to:
      {#each jumps as j}
        <button type="button" onclick={() => (zoom = j.range)}>{j.label}</button>
      {/each}
      {#if zoom}
        <button type="button" class="reset" onclick={() => (zoom = null)}>whole trace</button>
      {/if}
    </span>
  </div>

  <figcaption>
    <span class="cap-text">
      <strong>Simulated</strong>, not a recording — the model the tool assumes, plus three
      violations of it. The shaded events have no action potentials beneath them. The dF/F₀
      axis stays fixed as you zoom, so amplitudes remain comparable.
    </span>
    <span class="state">
      {#if zoom}
        {fmt(xView[0])}–{fmt(xView[1])} s · {spikesInView} spikes · {eventsInView} shaded
      {:else}
        {sim.calcium.length.toLocaleString()} samples · {sim.spikes.length} spikes in
        {sim.clusters.length} bursts · {sim.independentEvents.length} unexplained events
      {/if}
    </span>
  </figcaption>

  <!-- The bands are canvas: no text for a screen reader, no keyboard path to the zoom.
       This is the accessible equivalent, and the rendered figure is the static fallback. -->
  <p class="alt">
    A simulated recording: {sim.spikes.length} action potentials in {sim.clusters.length}
    bursts of one to five, shown as ticks in a band beneath the calcium trace. Each burst
    produces a transient roughly proportional to the number of spikes in it. Three further
    calcium events have no action potentials beneath them at all — one tall, brief and
    symmetric, one rising slowly and decaying for most of a minute, and a third brief one.
    Neither shape matches the spike-driven transients.
    <a href={premisePng} target="_blank" rel="noopener">Open the rendered figure ↗</a>
  </p>
</figure>

<style>
  .premise {
    margin: 16px 0 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px 10px;
    background: var(--bg);
  }
  .band { min-height: 0; }
  .trace { height: clamp(190px, 27vh, 310px); }
  /* The raster takes an EXPLICIT Plot height rather than `fill`: it owns the shared x-axis,
     and uPlot reserves ~50px for ticks plus the title, so inside a short fill container it
     spent the whole box on the axis and left the plot area 0px tall — the stems rendered
     into nothing and there was no surface to drag on. Tab 2 pins its band heights likewise. */
  .raster { margin-top: 2px; }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 14px;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--text);
  }
  .hint { font-weight: 500; }
  .jump { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .jump button {
    font: inherit;
    font-size: 12.5px;
    padding: 2px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .jump button:hover { border-color: var(--accent-border); }
  .jump button.reset { color: var(--text); font-weight: 500; }

  /* NOT display:flex — the shared figcaption rule in Help.svelte is a flex row, which turns
     every inline child into a flex item and inserts a gap before punctuation ("Simulated ,
     not a recording"). This caption carries inline emphasis, so it must be normal flow. */
  figcaption {
    display: block;
    margin-top: 10px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-muted, var(--text));
  }
  .cap-text { max-width: 78ch; }
  .state {
    display: block;
    margin-top: 4px;
    font-family: var(--mono);
    font-size: 11.5px;
  }

  .alt {
    margin: 10px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-muted, var(--text));
    max-width: 78ch;
  }
  .alt a { font-weight: 600; margin-left: 4px; white-space: nowrap; }
</style>
