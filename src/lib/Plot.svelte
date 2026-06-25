<script>
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

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
  } = $props();

  let wrap;
  let plot;
  let lastWidth = 0;

  function resolveColor(c) {
    if (!c.startsWith('var(')) return c;
    const name = c.slice(4, -1).trim();
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function makeOpts(width) {
    const stroke = resolveColor(color);
    const series =
      kind === 'stems'
        ? { stroke, fill: stroke, paths: uPlot.paths.bars({ size: [0.35, 4], align: 0 }) }
        : { stroke, width: 2 };
    // second overlaid line series (kernel/STA share one x and one y scale).
    const series2 =
      ys2 != null ? { points: { show: false }, stroke: resolveColor(color2), width: 2 } : null;
    const hooks = zeroLine
      ? {
          // mark the lag-0 (spike-aligned) line — central to the kernel panel.
          drawClear: [
            (u) => {
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
            },
          ],
        }
      : {};
    return {
      width,
      height,
      cursor: { y: false },
      legend: { show: false },
      scales: { x: { time: false } },
      hooks,
      axes: [
        { show: showXAxis, label: xLabel || undefined },
        {
          ...(yAxisSize != null ? { size: yAxisSize } : {}),
          ...(yLabel ? { label: yLabel, labelSize: 22, labelFont: '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--sans') } : {}),
        },
      ],
      series: [
        {},
        { points: { show: false }, ...series },
        ...(series2 ? [series2] : []),
      ],
    };
  }

  /** Data array for uPlot — adds the second y series when present. */
  function plotData() {
    return ys2 != null ? [xs, ys, ys2] : [xs, ys];
  }

  onMount(() => {
    lastWidth = wrap.clientWidth || 600;
    plot = new uPlot(makeOpts(lastWidth), plotData(), wrap);
    pinScale();
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth || 600;
      if (w !== lastWidth && plot) {
        lastWidth = w;
        plot.setSize({ width: w, height });
      }
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      plot?.destroy();
    };
  });

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
    if (!plot) return;
    plot.setData(data);
    pinScale();
  });
</script>

<div class="plot" bind:this={wrap}></div>

<style>
  .plot {
    width: 100%;
  }
</style>
