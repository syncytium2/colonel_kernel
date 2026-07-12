<script>
  // Tab 0 — "Start here". The friendly on-ramp for first-time / non-specialist
  // users: what the tool is, what each tab does, and how to take a first run,
  // in plain language. It intentionally does NOT teach the mathematics — that
  // lives in the serious, citable Methods & Mathematical Reference
  // (public/methods.html), linked prominently below for scientific users.
  //
  // `onNavigate(tabNumber)` switches the parent's active tab so the "try it"
  // buttons drop the reader straight into Tab 1 / Tab 2.
  let { onNavigate } = $props();

  // Relative link (not root-absolute) so it resolves correctly under any base
  // path, and opens in a new tab so the reader keeps their place in the app.
  const METHODS_URL = 'methods.html';
</script>

<div class="help">
  <header class="hero">
    <p class="eyebrow">Start here</p>
    <h1>Colonel Kernel</h1>
    <p class="tagline">
      A friendly tool for a single idea: a burst of neural spikes gets turned into
      a smooth calcium signal, and we want to see the <em>shape</em> that links the two.
    </p>
  </header>

  <!-- Prominent path to the serious document — first thing a professional sees. -->
  <a class="methods-cta" href={METHODS_URL} target="_blank" rel="noopener">
    <span class="mc-left">
      <span class="mc-kicker">For scientists &amp; citation</span>
      <span class="mc-title">Methods &amp; Mathematical Reference</span>
      <span class="mc-sub">
        The full mathematics, algorithms, validation rules, and a suggested citation —
        a standalone, printable document you can reference in your work.
      </span>
    </span>
    <span class="mc-arrow" aria-hidden="true">↗</span>
  </a>

  <section class="plain">
    <h2>What is this?</h2>
    <p>
      When a neuron fires, a calcium indicator lights up and then fades — a quick rise
      and a slow decay. Fire several times close together and those little glows pile
      up into one wavy trace. The single glow-shape that gets stamped down for every
      spike is called the <strong>kernel</strong>.
    </p>
    <p>
      Colonel Kernel lets you work with that relationship in both directions: build a
      trace from spikes and a kernel, or — the main event — take a <em>real</em>
      recording where the spikes are already known and <strong>recover the kernel</strong>.
      Crucially, it will also tell you honestly when there <em>isn&rsquo;t</em> one clean
      shape that fits — which is often the scientifically interesting answer.
    </p>
  </section>

  <section class="cards">
    <h2>The three tabs</h2>
    <div class="grid">
      <button class="card" onclick={() => onNavigate?.(1)}>
        <span class="badge">Tab 1</span>
        <span class="c-title">Convolution</span>
        <span class="c-body">
          Start here to build intuition. Place some spikes, pick a kernel shape, and
          watch the calcium trace appear. This is the gentle warm-up.
        </span>
        <span class="c-go">Open Tab 1 →</span>
      </button>

      <button class="card featured" onclick={() => onNavigate?.(2)}>
        <span class="badge">Tab 2 · flagship</span>
        <span class="c-title">Kernel recovery</span>
        <span class="c-body">
          The real tool. Load a recording with known spikes and a measured trace, and
          Colonel Kernel works backwards to find the kernel — and scores how much to
          trust it.
        </span>
        <span class="c-go">Open Tab 2 →</span>
      </button>

      <div class="card static">
        <span class="badge">Tab 3</span>
        <span class="c-title">Spike inference</span>
        <span class="c-body">
          An honest demonstration of the <em>hard</em> reverse problem — guessing spikes
          from a trace — shown so you can see why specialized tools exist for it.
          <em>(In progress.)</em>
        </span>
      </div>
    </div>
  </section>

  <section class="plain steps">
    <h2>Your first run in 30 seconds</h2>
    <ol>
      <li>Open <button class="inline-link" onclick={() => onNavigate?.(1)}>Tab 1</button>
        and hit <strong>↻ random</strong> to scatter some spikes.</li>
      <li>Try different <strong>kernel</strong> shapes and sliders — see the output trace update live.</li>
      <li>Nudge <strong>Measurement noise</strong> up to make it look like real data.</li>
      <li>Jump to <button class="inline-link" onclick={() => onNavigate?.(2)}>Tab 2</button>
        to recover the kernel from that signal, or load your own recording.</li>
    </ol>
  </section>

  <section class="reassure">
    <div class="r-icon" aria-hidden="true">🔒</div>
    <div>
      <h3>Your data never leaves your computer</h3>
      <p>
        Everything runs inside your browser. There is no server, no upload, and no
        tracking — Colonel Kernel makes no network requests at all, so unpublished
        recordings stay entirely on your machine.
      </p>
    </div>
  </section>

  <p class="footnote">
    Want the rigorous version — equations, algorithms, and interpretation rules you can
    cite? Read the
    <a href={METHODS_URL} target="_blank" rel="noopener">Methods &amp; Mathematical Reference</a>.
  </p>
</div>

<style>
  .help {
    max-width: 860px;
    margin: 0 auto;
    padding: 8px 4px 60px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .hero { margin: 8px 0 24px; }
  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
    margin: 0 0 8px;
  }
  .hero h1 {
    font-size: 34px;
    color: var(--text-h);
    margin: 0 0 10px;
    letter-spacing: -0.01em;
  }
  .tagline {
    font-size: 19px;
    line-height: 1.5;
    color: var(--text);
    margin: 0;
    max-width: 60ch;
  }

  /* --- prominent CTA to the serious document --- */
  .methods-cta {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 4px 0 34px;
    padding: 20px 24px;
    border: 1px solid var(--accent-border);
    border-left: 4px solid var(--accent);
    border-radius: 12px;
    background: var(--accent-bg);
    text-decoration: none;
    color: var(--text-h);
    transition: transform 0.08s ease, box-shadow 0.12s ease;
  }
  .methods-cta:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow);
  }
  .mc-left { display: flex; flex-direction: column; gap: 4px; }
  .mc-kicker {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--accent);
  }
  .mc-title { font-size: 20px; font-weight: 650; color: var(--text-h); }
  .mc-sub { font-size: 14.5px; color: var(--text); line-height: 1.5; }
  .mc-arrow { margin-left: auto; font-size: 30px; color: var(--accent); flex: none; }

  section { margin: 30px 0; }
  h2 { font-size: 21px; color: var(--text-h); margin: 0 0 12px; }
  .plain p { font-size: 16.5px; line-height: 1.62; color: var(--text); max-width: 66ch; }

  /* --- three-tab cards --- */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    text-align: left;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
    font: inherit;
    color: var(--text);
    cursor: pointer;
  }
  .card.static { cursor: default; }
  button.card:hover {
    border-color: var(--accent-border);
    box-shadow: var(--shadow);
  }
  .card.featured { border-color: var(--accent-border); background: var(--accent-bg); }
  .badge {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .c-title { font-size: 18px; font-weight: 650; color: var(--text-h); }
  .c-body { font-size: 14.5px; line-height: 1.5; color: var(--text); }
  .c-go { margin-top: auto; font-size: 14px; font-weight: 600; color: var(--accent); }

  /* --- steps --- */
  .steps ol { margin: 0; padding-left: 22px; }
  .steps li { font-size: 16px; line-height: 1.55; color: var(--text); margin: 8px 0; }
  .inline-link {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .inline-link:hover { text-decoration: underline; }

  /* --- privacy reassurance --- */
  .reassure {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 18px 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg-soft, var(--code-bg));
  }
  .r-icon { font-size: 26px; flex: none; line-height: 1.2; }
  .reassure h3 { margin: 0 0 6px; font-size: 16px; color: var(--text-h); }
  .reassure p { margin: 0; font-size: 15px; line-height: 1.55; color: var(--text); max-width: 62ch; }

  .footnote {
    margin: 30px 0 0;
    font-size: 15px;
    color: var(--text-muted, var(--text));
  }

  @media (max-width: 620px) {
    .methods-cta { flex-direction: column; align-items: flex-start; gap: 10px; }
    .mc-arrow { margin-left: 0; }
  }
</style>
