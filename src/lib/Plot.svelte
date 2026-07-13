<script>
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

  // Min pointer travel (px) that counts as a zoom-drag rather than a click. Shared
  // by uPlot's drag.dist (when a select begins) and the click-vs-drag split on
  // release, so a drag never triggers the single-click reset (ADR-0026).
  const ZOOM_DRAG_MIN = 6;

  // Max gap (ms) between two clicks to count as a double-click (ADR-0027). A single click
  // is held this long before it acts (reset), so it is NOT mistaken for the first half of a
  // double-click; a second click inside the window cancels the pending single. PROVISIONAL.
  const DBLCLICK_MS = 280;

  // A thin reactive uPlot wrapper. `kind` selects stems (input spike train)
  // vs. a continuous line (kernel, output). Data is passed as parallel
  // xs / ys arrays and pushed to the chart whenever it changes.
  //
  // Alignment props let two stacked plots share an x-axis exactly:
  //   xRange    — pin the x scale to [min, max] (else autorange)
  //   yAxisSize — fix the left y-gutter in px so plot areas left-align
  //   showXAxis — hide the x-axis on the upper of a stacked pair
  let {
    xs = [],
    ys = [],
    color = 'var(--accent)',
    kind = 'line',
    height = 150,
    zeroLine = false,
    xRange = null,
    yRange = null,
    yAxisSize = null,
    showXAxis = true,
    xLabel = '',
    // Vertical y-axis title (uPlot draws it rotated along the left gutter). Static per
    // panel — carries the QUANTITY (e.g. "dF/F₀", "spikes / bin"); live qualifiers stay
    // in reactive notes outside the canvas so the label never needs a re-init.
    yLabel = '',
    // Optional overlaid second line series, sharing xs (the kernel/STA overlay:
    // STA is pre-aligned onto the kernel lag grid, NaN outside its ±window).
    ys2 = null,
    color2 = 'var(--accent)',
    // ADR-0026: fill the parent's height (co-equal flex plot bands) instead of a
    // fixed pixel height; measured from the container and kept in sync on resize.
    fill = false,
    // Bar sizing for kind='stems' — [widthFactor, maxPx]. The raster needs wider
    // bars than the line default so sparse, low-count cells read (ADR-0026).
    barSize = [0.35, 4],
    // Pin the right-edge padding (px) of the plot AREA. uPlot auto-reserves space
    // on the right only when an x-axis is shown (for the last tick label), so a
    // stacked pair where one plot hides its x-axis ends up with mismatched right
    // edges and the shared-x lock shears. Setting an equal padRight on both forces
    // identical right edges regardless of x-axis presence (ADR-0026 co-registration).
    padRight = null,
    // Opt-in cursor link (ADR-0026): plots sharing a syncKey link their cursor on
    // the x scale by DATA value (not pixel), so the crosshair tracks the same
    // recording-time across stacked bands even if gutters/widths ever diverge.
    // Off by default — Tab 1 and the lag-axis kernel band pass nothing.
    syncKey = undefined,
    // Cursor value-dots (ADR-0026): per-series points snapped to the actual data
    // value at the cursor index — the dashed line shows WHERE in time, the dot
    // shows the VALUE there. Tri-state: undefined = uPlot default (Tab 1 untouched);
    // true = show styled dots (recon/raster); false = explicitly off (kernel band).
    cursorPoints = undefined,
    // VIEW-ONLY x-zoom (ADR-0026). When zoomable, drag-select a recording-time range
    // and onZoom(min,max) is called; double-click calls onZoom(null) to reset. The
    // PARENT owns the resulting range and feeds it back as xRange to BOTH synced
    // bands, so they stay co-registered at every zoom level. Zoom changes only the
    // visible slice — it never recomputes recovery (the data arrays are whole-recording).
    // Off by default — Tab 1 and the kernel band pass nothing.
    zoomable = false,
    onZoom = null,
    // ADR-0030: reset gesture for a zoomable plot with NO regions (Tab 1). When true,
    // DOUBLE-click restores full view (onZoom(null)) and a single click does nothing —
    // matching the familiar drag-zoom / double-click-restore idiom. Default false keeps
    // Tab 2's single-click reset (ADR-0026) untouched.
    dblClickReset = false,
    // ADR-0027: metadata-region background shading on the recording-time bands. Array of
    // { x0, x1, color } in DATA-x (recording-time s); `color` is a low-alpha rgba in the
    // region's Okabe-Ito hue. Drawn BEHIND the data (drawClear hook). Off by default — Tab 1
    // and the lag-axis kernel band pass nothing. The kernel band carries region identity in
    // its line colors instead (it shares no recording-time x).
    regions = null,
    // ADR-0027: double-click-to-region. When provided (i.e. metadata regions exist), a
    // double-click calls onRegionDblClick(dataX) — the parent zooms to the region under the
    // cursor. ARMED ONLY when this is set: without it, a click is the immediate single-click
    // zoom reset (no double handling). Off by default — Tab 1 / kernel band pass nothing.
    onRegionDblClick = null,
    // ADR-0027 kernel-band overlay: render an arbitrary list of line series sharing `xs`
    // (the lag grid), each { ys, stroke, width, dash }. Used for the all-regions kernel+STA
    // overlay (≤4 regions → ≤8 lines), each in its region's Okabe-Ito hue, STA dashed.
    // When set it REPLACES the ys/ys2 path. The series COUNT is fixed at init, so the parent
    // remounts (via {#key}) when the count changes. Off by default — only the kernel band uses it.
    seriesList = null,
    // EDIT mode (challenge tabs): click empty space to ADD a spike, shift-click the
    // nearest to REMOVE it, drag one to MOVE it. Emits data-time (snapped to
    // editSnapDt when given). Disables zoom while on. Off by default — every existing
    // plot passes nothing, so behavior is unchanged.
    editable = false,
    onSpikeAdd = null,
    onSpikeRemove = null,
    onSpikeMove = null,
    spikeTimesForEdit = [],
    editSnapDt = null,
    editHitPx = 10,
  } = $props();

  let wrap;
  let plot;
  let lastWidth = 0;
  let lastHeight = 0;

  function resolveColor(c) {
    if (!c.startsWith('var(')) return c;
    const name = c.slice(4, -1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  // Current pixel height: the container's measured height in fill mode (falling
  // back to the `height` prop before layout settles), else the fixed prop.
  function curHeight() {
    if (!fill) return height;
    const h = wrap?.clientHeight || 0;
    return h > 1 ? h : height;
  }

  function makeOpts(width, h) {
    const stroke = resolveColor(color);
    const series =
      kind === 'stems'
        ? { stroke, fill: stroke, paths: uPlot.paths.bars({ size: barSize, align: 0 }) }
        : { stroke, width: 2 };
    // second overlaid line series (kernel/STA share one x and one y scale).
    const series2 =
      ys2 != null ? { points: { show: false }, stroke: resolveColor(color2), width: 2 } : null;
    const hooks = {};
    const drawClear = [];
    // ADR-0027: region background shading, drawn first so it sits BEHIND the data. Reads the
    // live `regions` prop each draw (refreshed by the $effect on view-mode switch).
    drawClear.push((u) => {
      if (!regions || !regions.length) return;
      const { ctx } = u;
      ctx.save();
      for (const r of regions) {
        const xa = u.valToPos(r.x0, 'x', true);
        const xb = u.valToPos(r.x1, 'x', true);
        const left = Math.max(u.bbox.left, Math.min(xa, xb));
        const right = Math.min(u.bbox.left + u.bbox.width, Math.max(xa, xb));
        if (right <= left) continue;
        ctx.fillStyle = r.color;
        ctx.fillRect(left, u.bbox.top, right - left, u.bbox.height);
      }
      ctx.restore();
    });
    if (zeroLine) {
      // mark the lag-0 (spike-aligned) line — central to the kernel panel.
      drawClear.push((u) => {
        const cx = u.valToPos(0, 'x', true);
        if (cx < u.bbox.left || cx > u.bbox.left + u.bbox.width) return;
        const { ctx } = u;
        ctx.save();
        ctx.strokeStyle = resolveColor('var(--border)');
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, u.bbox.top);
        ctx.lineTo(cx, u.bbox.top + u.bbox.height);
        ctx.stroke();
        ctx.restore();
      });
    }
    hooks.drawClear = drawClear;
    // ADR-0028: in-band region LABELS, drawn on TOP of the data (the `draw` hook fires after
    // series) so each treatment epoch is named on the plot itself, in its region hue. Anchored
    // at the region start, clamped into view so a region scrolled off the left keeps its label.
    if (regions && regions.some((r) => r.label)) {
      const sans = getComputedStyle(document.documentElement).getPropertyValue('--sans') || 'sans-serif';
      // uPlot's draw hook ctx is in DEVICE pixels (bbox/valToPos are device px and the ctx is
      // not pre-scaled), so a CSS-px font size must be multiplied by the device pixel ratio —
      // otherwise "12px" renders at ~6 CSS px on a 2× display (the unreadable-labels bug). 12px
      // CSS matches the band axis-label scale (legibility is the point — ADR-0028).
      const pr = uPlot.pxRatio || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      const fontPx = Math.round(12 * pr);
      const padX = Math.round(4 * pr);
      const padY = Math.round(4 * pr);
      hooks.draw = [
        (u) => {
          if (!regions) return;
          const { ctx } = u;
          const L = u.bbox.left;
          const R = u.bbox.left + u.bbox.width;
          ctx.save();
          ctx.font = '600 ' + fontPx + 'px ' + sans;
          ctx.textBaseline = 'top';
          for (const r of regions) {
            if (!r.label) continue;
            const xa = u.valToPos(r.x0, 'x', true);
            const xb = u.valToPos(r.x1, 'x', true);
            if (xb < L || xa > R) continue; // region entirely off-screen
            const reserve = ctx.measureText(r.label).width + padX;
            const x = Math.max(L + padX, Math.min(xa + padX, R - reserve));
            ctx.fillStyle = r.labelColor || resolveColor('var(--text-h)');
            ctx.fillText(r.label, x, u.bbox.top + padY);
          }
          ctx.restore();
        },
      ];
    }
    if (zoomable && onZoom) {
      // a completed drag-select carries a recording-time range; lift it to the
      // parent (which re-pins BOTH bands via xRange) then clear the selection. The
      // `false` suppresses re-firing this hook, so no recursion. Tiny drags (<6px,
      // i.e. a click) are ignored so a stray click doesn't zoom.
      hooks.setSelect = [
        (u) => {
          const { left, width } = u.select;
          if (width > ZOOM_DRAG_MIN) {
            const min = u.posToVal(left, 'x');
            const max = u.posToVal(left + width, 'x');
            if (max > min) onZoom(min, max);
          }
          u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        },
      ];
    }
    return {
      width,
      height: h,
      cursor: {
        y: false,
        // value-dots snapped to each series' datum at the cursor index. uPlot's
        // cursor.points.show is a FACTORY that must return the point element, so we
        // keep the default factory and only size it up to show dots; show:()=>false
        // (a falsy-returning factory) hides them. Tri-state: an unset prop leaves
        // uPlot's default untouched (Tab 1) (ADR-0026).
        ...(cursorPoints === true
          ? { points: { size: 9, width: 2 } }
          : cursorPoints === false
            ? { points: { show: () => false } }
            : {}),
        // VIEW-ONLY x-zoom: drag selects an x range (y untouched) but does NOT
        // rescale here (setScale:false) — the parent owns the range. `dist` is the
        // min px to count as a drag, so anything below it is a click (→ reset, wired
        // below); uPlot only fires setSelect past `dist`, so a zoom-drag's release
        // never resets. Disable uPlot's own dblclick so it can't autorange behind the
        // parent (ADR-0026).
        ...(editable
          // EDIT mode: no uPlot drag/select or mousedown handling — our own listeners
          // (added in onMount) own the pointer for add/remove/move.
          ? { drag: { x: false, y: false }, bind: { mousedown: () => null, dblclick: () => null } }
          : zoomable
          ? { drag: { x: true, y: false, setScale: false, dist: ZOOM_DRAG_MIN }, bind: { dblclick: () => null } }
          // Non-zoomable plots are parent-scale-controlled: kill uPlot's native drag-zoom
          // and dblclick-autorange so an interaction can't knock the pinned range loose and
          // desync co-registered bands (ADR-0030 — the Tab 1 uncoupling bug).
          : { drag: { x: false, y: false }, bind: { dblclick: () => null } }),
        // link the cursor by DATA-x across same-syncKey plots (scales: ['x', null]
        // syncs only the x scale, by value); match on the x-scale key so only the
        // recording-time bands link (ADR-0026).
        ...(syncKey
          ? {
              sync: {
                key: syncKey,
                setSeries: false,
                scales: ['x', null],
                match: [(own, ext) => own === ext, (own, ext) => own === ext],
              },
            }
          : {}),
      },
      legend: { show: false },
      scales: { x: { time: false } },
      // pin only the right padding (others stay auto) so stacked plots share an
      // identical right edge even when one hides its x-axis (ADR-0026).
      ...(padRight != null ? { padding: [null, padRight, null, null] } : {}),
      hooks,
      axes: [
        { show: showXAxis, label: xLabel || undefined },
        {
          ...(yAxisSize != null ? { size: yAxisSize } : {}),
          ...(yLabel ? { label: yLabel, labelSize: 22, labelFont: '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--sans') } : {}),
        },
      ],
      series: seriesList
        ? [
            {},
            ...seriesList.map((s) => ({
              points: { show: false },
              stroke: resolveColor(s.stroke),
              width: s.width ?? 2,
              ...(s.dash ? { dash: s.dash } : {}),
            })),
          ]
        : [
            {},
            { points: { show: false }, ...series },
            ...(series2 ? [series2] : []),
          ],
    };
  }

  /** Data array for uPlot — multi-series list, or the ys (+ optional ys2) pair. */
  function plotData() {
    if (seriesList) return [xs, ...seriesList.map((s) => s.ys)];
    return ys2 != null ? [xs, ys, ys2] : [xs, ys];
  }

  onMount(() => {
    lastWidth = wrap.clientWidth || 600;
    lastHeight = curHeight();
    plot = new uPlot(makeOpts(lastWidth, lastHeight), plotData(), wrap);
    pinScale();
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth || 600;
      const h = curHeight();
      if ((w !== lastWidth || h !== lastHeight) && plot) {
        lastWidth = w;
        lastHeight = h;
        plot.setSize({ width: w, height: h });
      }
    });
    ro.observe(wrap);
    // SINGLE-CLICK on a zoomed band resets to full (ADR-0026). A click is a
    // mousedown→mouseup with travel below ZOOM_DRAG_MIN; a zoom-drag exceeds it and
    // must NOT reset. We measure pointer travel on the gesture that STARTED on this
    // band (mousedown on wrap, mouseup on window so a drag ending off-band still
    // resolves). onZoom(null) is a no-op at full range, so a click there does nothing.
    let onDown = null, onUp = null, clickTimer = null;
    if (zoomable && onZoom) {
      let dx0 = 0, dy0 = 0, armed = false;
      onDown = (e) => { dx0 = e.clientX; dy0 = e.clientY; armed = true; };
      onUp = (e) => {
        if (!armed) return;
        armed = false;
        if (Math.hypot(e.clientX - dx0, e.clientY - dy0) >= ZOOM_DRAG_MIN) return; // a drag, not a click
        // ADR-0030 (Tab 1): DOUBLE-click restores full view; a lone click does nothing (no regions
        // to select). Coupled drag-zoom still flows through setSelect → onZoom → parent xRange.
        if (dblClickReset) {
          if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; onZoom(null); }
          else { clickTimer = setTimeout(() => { clickTimer = null; }, DBLCLICK_MS); }
          return;
        }
        // No double-click-to-region armed (no regions): immediate single-click reset (ADR-0026).
        if (!onRegionDblClick) { onZoom(null); return; }
        // Discriminate single vs double by DBLCLICK_MS (ADR-0027): a second click inside the
        // window cancels the pending single and zooms to the region under the cursor; a lone
        // click resets after the delay. The first click's data-x is what a double zooms to.
        const dataX = clickDataX(e);
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
          onRegionDblClick(dataX);
        } else {
          clickTimer = setTimeout(() => { clickTimer = null; onZoom(null); }, DBLCLICK_MS);
        }
      };
      wrap.addEventListener('mousedown', onDown);
      window.addEventListener('mouseup', onUp);
    }

    // EDIT mode: own the pointer for spike add/remove/move. Click empty → add;
    // shift-click the nearest within editHitPx → remove; drag one → move. All emit
    // DATA-time (snapped to editSnapDt). Reads the live spikeTimesForEdit each event.
    let editDown = null, editMove = null, editUp = null;
    if (editable) {
      // Click vs. drag: a plain click ALWAYS adds (so you can place spikes right next
      // to each other), and only an actual drag moves a spike. The nearest spike is a
      // candidate to drag, resolved only once the pointer travels past EDIT_DRAG_MIN.
      const EDIT_DRAG_MIN = 4; // px
      let grab = -1, pressed = false, moved = false, dx0 = 0, dy0 = 0;
      const overX = (e) => e.clientX - plot.over.getBoundingClientRect().left;
      const snap = (x) => (editSnapDt ? Math.round(x / editSnapDt) * editSnapDt : x);
      const dataX = (e) => snap(plot.posToVal(overX(e), 'x'));
      const nearest = (e) => {
        const px = overX(e);
        let best = -1, bestD = editHitPx;
        for (let i = 0; i < spikeTimesForEdit.length; i++) {
          const d = Math.abs(plot.valToPos(spikeTimesForEdit[i], 'x') - px);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      };
      editDown = (e) => {
        pressed = true;
        moved = false;
        dx0 = e.clientX;
        dy0 = e.clientY;
        grab = nearest(e); // only used if this press becomes a drag
      };
      editMove = (e) => {
        if (!pressed) return;
        if (!moved && Math.hypot(e.clientX - dx0, e.clientY - dy0) >= EDIT_DRAG_MIN) moved = true;
        if (moved && grab >= 0 && onSpikeMove) onSpikeMove(grab, dataX(e));
      };
      editUp = (e) => {
        if (!pressed) return;
        pressed = false;
        if (moved) { grab = -1; return; } // was a drag — the move is already applied
        // a CLICK: shift-click removes the nearest; a plain click ADDS (never blocked by a
        // nearby spike). To move, drag; to remove, shift-click.
        if (e.shiftKey) { if (grab >= 0 && onSpikeRemove) onSpikeRemove(grab); }
        else if (onSpikeAdd) onSpikeAdd(dataX(e));
        grab = -1;
      };
      plot.over.style.cursor = 'crosshair';
      plot.over.addEventListener('mousedown', editDown);
      window.addEventListener('mousemove', editMove);
      window.addEventListener('mouseup', editUp);
    }

    return () => {
      ro.disconnect();
      if (clickTimer) clearTimeout(clickTimer);
      if (onDown) wrap.removeEventListener('mousedown', onDown);
      if (onUp) window.removeEventListener('mouseup', onUp);
      if (editDown) plot.over.removeEventListener('mousedown', editDown);
      if (editMove) window.removeEventListener('mousemove', editMove);
      if (editUp) window.removeEventListener('mouseup', editUp);
      plot?.destroy();
    };
  });

  /** Recording-time (data-x) under a mouse event, via the plot's over-layer origin. */
  function clickDataX(e) {
    if (!plot || !plot.over) return null;
    const rect = plot.over.getBoundingClientRect();
    return plot.posToVal(e.clientX - rect.left, 'x');
  }

  function pinScale() {
    if (!plot) return;
    // xRange pins a shared recording-time / lag axis; yRange pins a shared
    // amplitude axis so kernels (and STAs) are comparable across columns by
    // construction. Either may be null (uPlot autoscales that axis).
    if (xRange) plot.setScale('x', { min: xRange[0], max: xRange[1] });
    if (yRange) plot.setScale('y', { min: yRange[0], max: yRange[1] });
  }

  // Live update: re-feed data and re-pin the ranges whenever inputs change.
  $effect(() => {
    const data = plotData();
    const _ = xRange; // track for reactivity
    const __ = yRange;
    const ___ = ys2;
    const ____ = regions; // track so region shading refreshes on view-mode switch
    const _____ = seriesList; // track so overlay series values refresh (count changes remount via {#key})
    if (!plot) return;
    plot.setData(data); // redraws → the drawClear hook reads the current `regions`
    pinScale();
  });
</script>

<div class="plot" class:fill bind:this={wrap}></div>

<style>
  .plot {
    width: 100%;
  }
  /* fill mode: take the parent flex band's full height (ADR-0026 co-equal bands) */
  .plot.fill {
    height: 100%;
  }
</style>
