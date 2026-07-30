<script>
  // Tab 0's premise figure, live — the real ROI 1 recording on a zoomable x-axis.
  //
  // This replaces a static PNG, and the difference is not cosmetic: the whole claim of
  // the figure is that spikes and calcium correspond only SOMETIMES, and at 10,673
  // samples across 1067 s a PNG cannot show you the evidence. The decoupling stretch at
  // 400–700 s is a few pixels wide until you can zoom into it.
  //
  // ⚠ SHIPS REAL UNPUBLISHED DATA. roi1_trace.json is the recording itself — per-sample
  // dF/F₀ — not a picture of it, so it is downloadable from the public site by anyone.
  // That is a deliberate, consent-gated decision (Tony, 2026-07-30); see
  // docs/img/README.txt and the repo-hygiene section of CLAUDE.md, both of which record
  // it. Do NOT add a second real-data series here without the same explicit decision.
  //
  // Two co-registered bands rather than one axes, following ADR-0030: the trace on top,
  // a thin red spike raster beneath, sharing one x-range and one cursor. uPlot draws
  // bars from the y=0 baseline, so a short tick band inside a single axes is not
  // available — and the stacked pair is the pattern Tabs 1 and 2 already use, so the
  // eye drops from a tick straight up into the transient it caused.

  import Plot from './Plot.svelte';
  import roi1Png from './assets/roi1_trace.png?url';

  // The trace is DYNAMICALLY imported, the same discipline load-xlsx.js follows for
  // SheetJS. Statically importing it inlined 10,673 samples into the entry bundle and
  // put ~28 kB gzip on the critical path of the landing page, ahead of the title. Now
  // the page paints immediately and the figure fills in a moment later.
  let trace = $state(null);
  let loadError = $state(null);

  $effect(() => {
    let cancelled = false;
    import('./assets/roi1_trace.json')
      .then((m) => {
        if (!cancelled) trace = m.default;
      })
      .catch((e) => {
        if (!cancelled) loadError = String(e && e.message ? e.message : e);
      });
    return () => {
      cancelled = true;
    };
  });

  // Time axis is stored as t0 + i·dt (regular to 1e-6 s, a ten-thousandth of a frame)
  // rather than 10,673 explicit floats — half the payload, exact at any visible zoom.
  const xs = $derived(
    trace ? Array.from({ length: trace.n }, (_, i) => trace.t0 + i * trace.dt) : [],
  );
  const ys = $derived(trace ? trace.y : []);

  // The raster band carries one unit-height stem per spike, on its own sparse x-array —
  // 140 points, not 10,673 — so the band stays cheap and the stems stay crisp.
  const spikeXs = $derived(trace ? trace.spikes : []);
  const spikeYs = $derived(trace ? trace.spikes.map(() => 1) : []);

  const full = $derived(trace ? [trace.t0, trace.t0 + (trace.n - 1) * trace.dt] : [0, 1]);

  // Y is PINNED to the whole-recording range, not autoscaled per zoom. Letting it
  // rescale made zooming actively misleading: the 400–700 s stretch — whose point is
  // that the response has collapsed — redrew with a 0–0.04 axis and looked like healthy
  // signal. Amplitude is the figure's entire argument, and ADR-0024/0029 already reject
  // display scaling that manufactures a false impression of magnitude. So zooming
  // changes WHICH samples you see, never how big they look.
  const yFixed = $derived.by(() => {
    if (!trace) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of trace.y) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const pad = (hi - lo) * 0.05;
    return [lo - pad, hi + pad];
  });
  let zoom = $state(null); // [min,max] or null = full view
  const xView = $derived(zoom ?? full);

  // Equal right-edge padding on both bands. uPlot only reserves right-edge space when an
  // x-axis is shown, and only the lower band shows one — without this the plot areas
  // shear and a tick no longer sits under its transient (ADR-0030).
  const PAD_R = 28;

  function onZoom(min, max) {
    zoom = min == null ? null : [min, max];
  }

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(0) : '—');
  const spikesInView = $derived(
    trace ? trace.spikes.filter((s) => s >= xView[0] && s <= xView[1]).length : 0,
  );
</script>

<figure class="premise">
  {#if loadError}
    <p class="loaderr" role="alert">
      Could not load the recording ({loadError}). The rendered figure is below.
      <img src={roi1Png} alt="ROI 1 of a real paired recording: 140 action potentials as red ticks beneath a blue calcium trace." />
    </p>
  {:else if !trace}
    <div class="skeleton" aria-hidden="true"></div>
  {:else}
  <div class="band trace">
    <Plot
      fill
      {xs}
      {ys}
      color="#1f77b4"
      xRange={xView}
      yRange={yFixed}
      yAxisSize={54}
      padRight={PAD_R}
      yLabel="dF/F₀"
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
      color="#d21f3c"
      xRange={xView}
      yRange={[0, 1]}
      yAxisSize={54}
      padRight={PAD_R}
      barSize={[0.35, 2]}
      yLabel="spikes"
      syncKey="premise-x"
      cursorPoints={false}
      zoomable
      {onZoom}
      dblClickReset
      xLabel="time (s)"
    />
  </div>

  <figcaption>
    <span class="hint">
      Drag across either band to zoom · double-click to reset
      <em>· the dF/F₀ axis stays fixed, so amplitudes stay comparable</em>
    </span>
    <span class="state">
      {#if zoom}
        showing {fmt(xView[0])}–{fmt(xView[1])} s · {spikesInView} of {trace.spikes.length} spikes
      {:else}
        full recording · {trace.n.toLocaleString()} samples at {(1 / trace.dt).toFixed(0)} Hz · {trace.spikes.length} spikes
      {/if}
    </span>
  </figcaption>
  {/if}

  <!-- The bands are canvas, so they carry no text for a screen reader and no zoom for a
       keyboard. This description is the accessible equivalent of the figure, and the
       rendered PNG is the non-interactive fallback. -->
  <p class="alt">
    ROI 1 of a real paired recording: 140 action potentials as red ticks beneath a blue
    calcium trace. Early on nearly every spike has its own calcium transient. Across
    roughly 400–700 s the spikes continue while the calcium response shrinks toward the
    noise. Near 790 s a handful of spikes produce a transient about five times larger
    than anything else in the recording.
    <a href={roi1Png} target="_blank" rel="noopener">Open the rendered figure ↗</a>
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

  /* Holds the figure's height while the trace chunk arrives, so the page below does
     not jump when it lands. Same total height as the two bands plus their caption. */
  .skeleton {
    height: calc(clamp(180px, 26vh, 300px) + 56px);
    border-radius: 8px;
    background: linear-gradient(90deg, var(--code-bg) 25%, var(--bg) 50%, var(--code-bg) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }
  @keyframes shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton { animation: none; }
  }

  .loaderr { font-size: 14px; color: var(--text); margin: 0; }
  .loaderr img { display: block; width: 100%; height: auto; margin-top: 10px; border-radius: 8px; }
  /* The trace carries the shape; the raster only needs to be legible as a tick row.
     A floor on both so neither collapses on a short viewport (the ≤900px failure the
     plot bands elsewhere in the app still have). */
  .trace { height: clamp(180px, 26vh, 300px); }
  /* The raster gets an EXPLICIT Plot height rather than `fill`. It owns the shared
     x-axis, and uPlot reserves ~50px for ticks plus the "time (s)" title; inside a short
     fill container it spent the whole box on that axis and left the plot area 0px tall,
     so the stems rendered into nothing and there was no surface to drag a zoom on. Tab 2
     pins its band heights for the same reason. */
  .raster { margin-top: 2px; }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--text);
  }
  .hint { font-weight: 500; }
  .state { font-family: var(--mono); font-size: 11.5px; }

  .alt {
    margin: 10px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text-muted, var(--text));
    max-width: 70ch;
  }
  .alt a { font-weight: 600; margin-left: 4px; white-space: nowrap; }
</style>
