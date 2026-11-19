<script>
  // Panel C (jsMLspike ADR 3dfe): the stage-5 error over the allowed box, a across, tau up, as % above
  // the minimum, with the unit's own minimum (filled) and the kernel currently chosen (ring).
  // surface[j * n + i] is the error at a = aAxis[i], tau = tauAxis[j] (jsmlspike-result/1).
  let { surface = null, aAxis = [], tauAxis = [], own = null, chosen = null, width = 300, height = 220 } = $props();

  let canvas = $state(null);
  const pad = { l: 48, r: 10, t: 8, b: 34 };

  $effect(() => {
    if (!canvas || !surface || !aAxis.length) return;
    const n = aAxis.length, ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
    let lo = Infinity, hi = -Infinity;
    for (const v of surface) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    const cw = W / n, ch = H / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const t = (surface[j * n + i] - lo) / span;               // 0 at the minimum, 1 at the maximum
      const g = Math.round(40 + 200 * t);
      ctx.fillStyle = `rgb(${g}, ${Math.round(70 + 150 * t)}, ${Math.round(140 + 80 * (1 - t))})`;
      ctx.fillRect(pad.l + i * cw, pad.t + (n - 1 - j) * ch, Math.ceil(cw), Math.ceil(ch));
    }
    const css = getComputedStyle(canvas), ink = css.getPropertyValue('--text-h').trim() || '#222';
    const x = (a) => pad.l + ((a - aAxis[0]) / (aAxis[n - 1] - aAxis[0])) * W;
    const y = (tau) => pad.t + H - ((tau - tauAxis[0]) / (tauAxis[n - 1] - tauAxis[0])) * H;
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(pad.l, pad.t, W, H);
    ctx.fillStyle = ink; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`a (fraction of baseline), ${aAxis[0].toPrecision(2)}–${aAxis[n - 1].toPrecision(2)}`, pad.l + W / 2, height - 8);
    ctx.save(); ctx.translate(12, pad.t + H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(`τ (s), ${tauAxis[0].toPrecision(2)}–${tauAxis[n - 1].toPrecision(2)}`, 0, 0); ctx.restore();
    if (own) { ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x(own.a), y(own.tau), 4, 0, 2 * Math.PI); ctx.fill(); }
    if (chosen && chosen.a != null) {
      ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(Math.min(Math.max(x(chosen.a), pad.l), pad.l + W), Math.min(Math.max(y(chosen.tau), pad.t), pad.t + H), 7, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.fillStyle = ink;
    ctx.fillText(`range ${(100 * span / lo).toFixed(1)}% above min`, pad.l + 4, pad.t + 12);
  });
</script>

<canvas bind:this={canvas} style={`width:${width}px;height:${height}px`} aria-label="error surface"></canvas>
