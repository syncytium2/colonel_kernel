<script>
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';

  // A thin reactive uPlot wrapper. `kind` selects stems (input spike train)
  // vs. a continuous line (kernel, output). Data is passed as parallel
  // xs / ys arrays and pushed to the chart whenever it changes.
  let {
    title = '',
    xs = [],
    ys = [],
    color = 'var(--accent)',
    kind = 'line',
    height = 150,
    zeroLine = false,
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
    const hooks = zeroLine
      ? {
          // mark the t=0 (spike-aligned) line — matters for symmetric kernels.
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
      title,
      width,
      height,
      cursor: { y: false },
      legend: { show: false },
      scales: { x: { time: false } },
      hooks,
      series: [{}, { label: title, points: { show: false }, ...series }],
    };
  }

  onMount(() => {
    lastWidth = wrap.clientWidth || 600;
    plot = new uPlot(makeOpts(lastWidth), [xs, ys], wrap);
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

  // Live update: re-feed data whenever xs/ys change.
  $effect(() => {
    const data = [xs, ys];
    if (plot) plot.setData(data);
  });
</script>

<div class="plot" bind:this={wrap}></div>

<style>
  .plot {
    width: 100%;
  }
</style>
