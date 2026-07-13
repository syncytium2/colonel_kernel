<script>
  // Celebration overlay for "Beat the Colonel" — fires when the player out-scores
  // the Colonel. Deliberately UNPREDICTABLE: each win rolls a random style,
  // emoji set, palette, and taunt, so it never pops the same way twice.
  //
  // Self-contained canvas particle system — NO external library (the strict CSP
  // forbids CDNs; FOUNDATIONS §6). requestAnimationFrame + Math.random are fine
  // in the app (the no-random rule is for workflow scripts, not runtime UI).
  //
  // `trigger` is a monotonic token: bump it and a fresh celebration fires.
  let { trigger = 0 } = $props();

  const MESSAGES = [
    'You beat the Colonel!',
    'Colonel outgunned! 🫡',
    'Human 1 — Machine 0',
    'Kernel master!',
    'The Colonel tips his cap.',
    'Deconvolution, who?',
    'Out-fit the algorithm!',
    'Intuition > regularized least squares',
    'The Colonel demands a rematch.',
    'Flawless recovery!',
    'You cracked the kernel.',
    'Better than the machine!',
  ];
  const EMOJI_SETS = [
    ['🎉', '🎊', '✨', '🥳', '🏆'],
    ['🧠', '⚡', '🔬', '📈', '🎯'],
    ['🎆', '💥', '🌟', '💫', '🔥'],
    ['👑', '🏅', '🎖️', '💪', '🙌'],
    ['🚀', '⭐', '🎇', '🏆', '😎'],
  ];
  const PALETTES = [
    ['#aa3bff', '#c084fc', '#e9d5ff', '#7a1fb8'],
    ['#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
    ['#0072b2', '#56b4e9', '#009e73', '#f0e442'],
    ['#ff5da2', '#ffd166', '#06d6a0', '#118ab2'],
  ];

  let canvas;
  let raf = 0;
  let seen = 0; // last trigger value acted on
  let msg = $state('');
  let showMsg = $state(false);
  let msgTimer = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function spawn(mode, W, H, dpr, palette, emoji) {
    const P = [];
    const add = (o) => P.push({ shape: 'rect', rot: rand(0, 6.28), vr: rand(-0.3, 0.3), life: 1, ...o });
    if (mode === 0) {
      // confetti rain from the top
      for (let i = 0; i < 180; i++)
        add({ x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-40, 40) * dpr, vy: rand(80, 260) * dpr,
          size: rand(5, 11) * dpr, color: pick(palette), shape: Math.random() < 0.25 ? 'circle' : 'rect' });
    } else if (mode === 1) {
      // twin cannons from the bottom corners
      for (const cx of [0.04 * W, 0.96 * W]) {
        const dir = cx < W / 2 ? 1 : -1;
        for (let i = 0; i < 110; i++)
          add({ x: cx, y: H * 0.98, vx: (rand(120, 520) * dir) * dpr, vy: rand(-520, -160) * dpr,
            size: rand(5, 12) * dpr, color: pick(palette), shape: Math.random() < 0.2 ? 'circle' : 'rect' });
      }
    } else if (mode === 2) {
      // emoji burst from the center
      for (let i = 0; i < 46; i++) {
        const a = rand(0, 6.28), s = rand(120, 460) * dpr;
        add({ x: W / 2, y: H * 0.42, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120 * dpr,
          size: rand(20, 40) * dpr, shape: 'emoji', emoji: pick(emoji) });
      }
    } else if (mode === 3) {
      // fireworks: several radial bursts at random points
      const bursts = 3 + ((Math.random() * 3) | 0);
      for (let b = 0; b < bursts; b++) {
        const bx = rand(0.15, 0.85) * W, by = rand(0.15, 0.6) * H, col = pick(palette), n = 26 + ((Math.random() * 20) | 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.28, s = rand(80, 300) * dpr;
          add({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rand(3, 7) * dpr, color: col, shape: 'circle' });
        }
      }
    } else {
      // mixed: confetti rain + a few emoji
      for (let i = 0; i < 120; i++)
        add({ x: rand(0, W), y: rand(-H * 0.3, 0), vx: rand(-40, 40) * dpr, vy: rand(80, 240) * dpr,
          size: rand(5, 11) * dpr, color: pick(palette), shape: Math.random() < 0.25 ? 'circle' : 'rect' });
      for (let i = 0; i < 22; i++) {
        const a = rand(0, 6.28), s = rand(120, 380) * dpr;
        add({ x: W / 2, y: H * 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100 * dpr, size: rand(20, 36) * dpr, shape: 'emoji', emoji: pick(emoji) });
      }
    }
    return P;
  }

  function fire() {
    if (!canvas) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const W = (canvas.width = Math.max(1, canvas.clientWidth * dpr));
    const H = (canvas.height = Math.max(1, canvas.clientHeight * dpr));
    const ctx = canvas.getContext('2d');
    const palette = pick(PALETTES);
    const emoji = pick(EMOJI_SETS);
    const mode = (Math.random() * 5) | 0;

    // random taunt pop
    msg = pick(MESSAGES);
    showMsg = true;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (showMsg = false), 1900);

    const parts = spawn(mode, W, H, dpr, palette, emoji);
    const grav = 520 * dpr;
    const drag = 0.985;
    let prev = performance.now();
    const start = prev;
    cancelAnimationFrame(raf);

    const frame = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      ctx.clearRect(0, 0, W, H);
      const age = now - start;
      let alive = 0;
      for (const p of parts) {
        p.vx *= drag;
        p.vy = p.vy * drag + grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr;
        if (age > 1400) p.life -= dt * 0.9; // fade out after ~1.4s
        if (p.life <= 0 || p.y > H + 40) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'emoji') {
          ctx.font = `${p.size}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.emoji, 0, 0);
        } else if (p.shape === 'circle') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, 6.2832);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        }
        ctx.restore();
      }
      if (alive > 0 && age < 4500) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
  }

  $effect(() => {
    if (trigger !== seen && trigger > 0) {
      seen = trigger;
      fire();
    }
  });
  $effect(() => () => {
    cancelAnimationFrame(raf);
    clearTimeout(msgTimer);
  });
</script>

<div class="celebration" aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
  {#if showMsg}
    <div class="msg" role="status">{msg}</div>
  {/if}
</div>

<style>
  .celebration {
    position: fixed;
    inset: 0;
    z-index: 3000;
    pointer-events: none;
    overflow: hidden;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .msg {
    position: absolute;
    top: 26%;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--heading, system-ui, sans-serif);
    font-size: clamp(26px, 5vw, 54px);
    font-weight: 800;
    letter-spacing: -0.01em;
    text-align: center;
    color: var(--text-h, #111);
    background: color-mix(in srgb, var(--bg, #fff) 82%, transparent);
    padding: 10px 22px;
    border-radius: 14px;
    box-shadow: var(--shadow, 0 10px 30px rgba(0, 0, 0, 0.2));
    white-space: nowrap;
    animation: pop 1.9s cubic-bezier(0.2, 1.4, 0.3, 1) forwards;
  }
  @keyframes pop {
    0% { transform: translateX(-50%) scale(0.4) rotate(-4deg); opacity: 0; }
    12% { transform: translateX(-50%) scale(1.12) rotate(2deg); opacity: 1; }
    24% { transform: translateX(-50%) scale(1) rotate(0deg); }
    80% { opacity: 1; }
    100% { transform: translateX(-50%) scale(1) rotate(0deg); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .msg { animation-duration: 0.01s; }
  }
</style>
