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

  // "Bring your own recording" — the input contract, the template download, and the
  // quick start. Its own component because it owns real behaviour (a code-split
  // SheetJS import and two blob downloads), and Help.svelte is otherwise pure prose.
  import BringYourData from './BringYourData.svelte';

  // The premise figure — live and x-zoomable. It opens Tab 0 because the problem should
  // be the first thing a visitor meets: spikes and calcium correspond only SOMETIMES, and
  // FOUNDATIONS §3–4 treats that discrepancy as the project's core premise, not an artifact.
  //
  // Its own component because it owns real behaviour (two co-registered zoomable bands).
  // The trace is SIMULATED and generated in the browser, so no data ships — which is what
  // makes an interactive version possible at all; see src/lib/core/premise-sim.js.
  import PremiseFigure from './PremiseFigure.svelte';

  // Scroll to a section, opening the <details> fold it lives in first — otherwise the
  // scroll lands on a closed summary and the reader sees nothing they asked for. Exported
  // so App.svelte's `#lambda` hash handler uses the same path as the in-page jumps.
  export function revealAndScroll(id, { instant = false } = {}) {
    const el = document.getElementById(id);
    if (!el) return false;
    // openable ancestors first, outermost last — a nested fold needs its parent open too
    let d = el.closest('details');
    const outermost = (() => {
      let cur = d, last = null;
      while (cur) { last = cur; cur.open = true; cur = cur.parentElement?.closest('details') ?? null; }
      return last;
    })();
    // Scroll to the SUMMARY, not to the target inside it. Folding these sections moved their
    // <h2> into the <summary>, so scrolling to the section landed the reader past the only
    // heading — arriving from a slider's "?" straight into unheaded body prose.
    const anchor = outermost?.querySelector(':scope > summary') ?? el;

    // Scroll THE CONTAINER, not via scrollIntoView. Two measured defects, both invisible if
    // you happen to test with reduced motion (where scrollIntoView lands correctly at 0px):
    //   - smooth scrollIntoView overshot the anchor by 46-73px depending on viewport, so the
    //     reader still arrived below the heading;
    //   - it scrolls the WINDOW as well as `.help`, which pushed the app's tab bar off the
    //     top of the viewport — the reader landed with no chrome and no route back.
    // An explicit scrollTop on the scroll container cannot overshoot and cannot move the page.
    const box = /** @type {HTMLElement|null} */ (anchor.closest('.help'));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!box) {
      anchor.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return true;
    }
    const place = (behavior) => {
      const top = anchor.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTo({ top, behavior });
    };
    if (instant || reduce) {
      // Deep-link arrivals land INSTANTLY and then re-assert. Two things move the target out
      // from under a smooth animation on first paint: the browser's own fragment navigation
      // (it scrolls the WINDOW to #lambda before any of our code runs, which is what pushed
      // the tab bar off-screen), and the premise figure's uPlot bands sizing on mount above
      // the anchor. Both were measured landing the reader ~52px below the heading — and both
      // were invisible under prefers-reduced-motion, where the instant path already worked.
      // The window reset has to repeat with each re-assert: the browser's fragment scroll can
      // land AFTER our first frame, so resetting once left the page scrolled ~70px and the
      // tab bar above the fold even though the in-container position was correct.
      const settle = () => {
        window.scrollTo(0, 0);
        place('auto');
      };
      settle();
      requestAnimationFrame(settle);
      setTimeout(settle, 250);
    } else {
      place('smooth');
    }
    return true;
  }

  // "Already have a recording?" — the researcher path. The visible link promises "what the
  // file needs to look like", and that spec lives inside a SECOND <details> nested within
  // this fold. revealAndScroll only walks ANCESTORS, so the jump used to land on a card whose
  // spec was still shut: a one-click promise costing two. Open the descendant too.
  function jumpToOwnData() {
    revealAndScroll('bring-your-own');
    document.querySelector('#bring-your-own details.spec')?.setAttribute('open', '');
  }

  // The "help document" — the four-methods explainer figure. Same asset the
  // Tab 2 "?" modal uses (src/lib/assets/methods_explainer.svg), surfaced here
  // on Tab 0 so naive users meet it up front instead of hunting for it behind a
  // modal. Imported as a bundled, same-origin URL (CSP-safe, no egress).
  import methodsSvg from './assets/methods_explainer.svg?url';

  // Relative link (not root-absolute) so it resolves correctly under any base
  // path, and opens in a new tab so the reader keeps their place in the app.
  // Shared with the λ sliders on Tabs 2 and 3, which link to the same document.
  import { METHODS_URL, METHODS_REGULARIZATION_URL, METHODS_CHECKS_URL } from './methods-url.js';

  // Born-on / last-updated, baked in at build time from git (vite.config define).
  // The CSP forbids a runtime GitHub call, so these are fixed when the bundle is built.
  const bornISO = typeof __BUILD_BORN__ !== 'undefined' ? __BUILD_BORN__ : '';
  const updatedISO = typeof __BUILD_UPDATED__ !== 'undefined' ? __BUILD_UPDATED__ : '';
  const prettyDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
</script>

<div class="help">
  <header class="hero">
    <p class="eyebrow">Start here</p>
    <h1>Colonel Kernel</h1>
    <!-- The one sentence most visitors judge the project on. It used to lead with a tone
         adjective ("A friendly tool"), never used the word "kernel" — the noun in the
         product's own name — and described the direction Tab 1 runs rather than the
         flagship's. Lead with the job, name the noun, keep the honest limit.

         No frequency word on that limit, either: "often the answer worth having" reads one
         way as a claim about how OFTEN no shape fits, and FOUNDATIONS §4 says plainly the
         project has no such number ("Prevalence is unknown because no one reports this
         approach"). Measuring it is the contribution; pre-announcing it is not. -->
    <p class="tagline">
      Measures the <strong>calcium kernel</strong> &mdash; the fluorescence shape a single
      action potential produces &mdash; from a recording where you already know the spike
      times. And tells you when no single shape fits, which is an answer worth having.
    </p>
    {#if bornISO || updatedISO}
      <p class="born">
        {#if bornISO}<span>Born {prettyDate(bornISO)}</span>{/if}
        {#if bornISO && updatedISO}<span class="sep">·</span>{/if}
        {#if updatedISO}<span>Last updated {prettyDate(updatedISO)}</span>{/if}
      </p>
    {/if}
  </header>

  <!-- The problem, before any explanation of the tool.
       Deliberately short. Most traffic here is skimming — someone curious, or reading a
       résumé — not a researcher working through an on-ramp. The figure is the argument;
       the prose only has to point at it and get out of the way. Everything that used to
       be spelled out here (the zoom walkthrough, the shape-by-shape reading of each
       event) is still in the figure's own caption and alt text, which is where a reader
       who is actually looking already is. -->
  <section class="problem">
    <h2>The problem, in one trace</h2>
    <p class="plain">
      When a neuron fires, a calcium indicator brightens and then fades. That single
      glow-shape, stamped down once per spike, is the <strong>kernel</strong> &mdash; the
      thing this tool measures. Below: simulated spikes as ticks along the bottom, and above
      them the calcium they produce, in <strong>dF/F₀</strong> (the fractional change in
      brightness from baseline). Mostly the two correspond. The
      <strong>three shaded stretches are where they do not</strong> &mdash;
      <!-- The instruction used to be "look at the tick row beneath each one, and it is
           empty". At the default full view each shaded band is ~7px of a ~660px axis inside
           a raster of 139 ticks, so the reader cannot actually do that, and the page's
           central claim is unverifiable at the only view it ships in. Zoomed, the evidence
           is unmistakable — so send them to the zoom instead of asking for the impossible. -->
      <strong>use a &ldquo;Jump to&rdquo; button below</strong> to zoom into one, and the tick
      row beneath it is empty.
    </p>
    <PremiseFigure />
    <p class="plain">
      Give a real trace like that to a tool that assumes every calcium event came from a
      spike, and it returns a kernel anyway: here, one whose decay is pulled short, and a fit
      that stops explaining the trace. Colonel Kernel <strong>measures</strong> the
      relationship instead &mdash; it recovers the shape linking spikes to calcium, and
      reports how far it can be trusted rather than pretending to a verdict.
    </p>
  </section>

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

  <section class="cards">
    <h2>The three working tabs</h2>
    <div class="grid">
      <button class="card" onclick={() => onNavigate?.(1)}>
        <span class="badge">Tab 1</span>
        <span class="c-title">Convolution</span>
        <span class="c-body">
          Place spikes, pick a kernel shape, watch the calcium trace appear.
        </span>
        <span class="c-go">Open Tab 1 →</span>
      </button>

      <button class="card featured" onclick={() => onNavigate?.(2)}>
        <span class="badge">Tab 2 · flagship</span>
        <span class="c-title">Kernel recovery</span>
        <span class="c-body">
          The real tool. Load a recording with known spikes, recover the kernel, and
          read the checks that say how much to trust it.
        </span>
        <span class="c-go">Open Tab 2 →</span>
      </button>

      <div class="card static">
        <span class="badge">Tab 3</span>
        <span class="c-title">Spike inference</span>
        <span class="c-body">
          The <em>hard</em> reverse problem — guessing spikes from a trace — kept as an
          honest demonstration of why specialized tools exist for it.
        </span>
      </div>
    </div>
    <p class="jump">
      Already have a recording of your own?
      <button class="inline-link" onclick={jumpToOwnData}>What the file needs to look like ↓</button>
    </p>
  </section>

  <!-- ── Everything below is FOLDED ────────────────────────────────────────────────
       Tab 0 ran to 1,649 words over 5,234px — roughly six screens — written as a
       patient on-ramp for a naive researcher. That reader is a small minority of the
       traffic; most arrivals are skimming to see what this is. So the page keeps the
       argument (problem → figure → what it does → where to go) visible and folds the
       rest away. RELOCATED, NOT DELETED: every word still ships, one click deep, and
       both `#lambda` and `#bring-your-own` deep links open their own fold on arrival
       (see App.svelte's hash effect and jumpToOwnData above).
       <details> is deliberate: it works with no JS, is keyboard-operable, and its
       open/closed state is exposed to assistive tech for free. -->
  <section class="more">
    <h2>More, if you want it</h2>

    <details class="fold">
      <summary>What is a kernel?</summary>
      <div class="fold-bd">
          <section class="plain">
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
      </div>
    </details>

    <!-- THREE recovery methods, not four. Canon is unambiguous — methods.html §6 is "Three
         parallel recovery methods" and §7 files spike-triggered averaging separately as the
         "validation partner", a thing that assumes no kernel and solves no inverse problem.
         Calling STA a fourth recovery method quietly converts an independence check into a
         fourth estimate, and it is what made the λ fold's correct "three" read as an error.
         ⚠ The SVG itself still says "Four ways…" and "all four roughly AGREE" in baked-in
         text; fixing that means regenerating the asset (see docs/reviews for the residual). -->
    <details class="fold" id="methods-fold">
      <summary>The three recovery methods, and the check they are read against</summary>
      <div class="fold-bd">
        <section class="explainer">
            <!-- Two corrections worth protecting here.
                 (1) The STA does NOT "just average the trace around each spike": the shipped
                 port (FOUNDATIONS §13 pins three fidelity facts) rejects any spike whose
                 neighbour is within half a window, skips the first and last, and subtracts
                 each snippet's own pre-spike baseline. It is a SUBSET of the data chosen by a
                 rule, which is exactly why §13 says the two methods use different effective
                 spike sets.
                 (2) "Independent" was too strong — all four read the same trace and the same
                 spike list, so their errors are correlated by construction. What STA brings
                 is a different estimator under a different assumption, not a second
                 measurement. And per ADR-0005 regime 2, disagreement at high spike rate is
                 EXPECTED and benign: at 5 Hz the STA accepts ~10 of 1515 spikes. Telling a
                 reader to treat that as a finding would be telling them to chase an artifact. -->
            <p class="plain">
              There are three ways here to ask &ldquo;is there a kernel?&rdquo; &mdash;
              <strong>free-vector</strong>, <strong>parametric</strong> and
              <strong>shaped</strong> &mdash; and the honest trick is to run them at once. A
              fourth panel, the <strong>spike-triggered average</strong> (STA), is not a
              recovery at all: it cuts a window of trace around each <em>isolated</em> spike
              &mdash; skipping any with a close neighbour &mdash; subtracts each one&rsquo;s own
              pre-spike baseline, and averages what is left. It shares the recording but none
              of the machinery, so where it agrees with the other three, the agreement is not
              built in. Where they disagree, that is usually the finding &mdash; with one
              exception worth knowing: at high spike rates the STA runs out of isolated spikes
              and degrades on its own, which is why Tab 2 shows the spike rate beside the
              checks.
            </p>
            <figure class="fig">
              <a href={methodsSvg} target="_blank" rel="noopener" title="Open full size in a new tab">
                <img src={methodsSvg} alt="Three ways to recover a calcium kernel — free-vector, parametric and shaped — shown beside the spike-triggered average (STA), which is a check on them rather than a fourth recovery. Illustrative sketches of each method's characteristic behaviour, drawn rather than computed by the solvers." />
              </a>
              <figcaption>
                The three methods, side by side with the STA they are checked against.
                <strong>Illustrative</strong> &mdash; the panels are drawn to show each
                method&rsquo;s characteristic behaviour, not computed by the solvers.
                <a class="out-link" href={methodsSvg} target="_blank" rel="noopener"
                  >Open full size <span aria-hidden="true">↗</span></a>
              </figcaption>
            </figure>
          </section>

          <!-- The one control a first-timer meets with no referent: λ, on Tab 2 (inside the
               Advanced fold) and on Tab 3. Both sliders route BACK here via onExplainLambda,
               and this section hands off onward to the equations — without it a naive reader
               met a Greek letter and a slider and nothing else.

               The claims here are load-bearing and were checked against the shipped solver,
               not against intuition. Three of them are counter-intuitive enough to be worth
               protecting from a well-meaning edit:
                 - λ does NOT visibly flatten the kernel anywhere on Tab 2's slider. Across the
                   whole exposed range (0.002–3) the recovered peak moves ~2% and the lag not
                   at all; a "bland bump" needs λ ≈ 3000, a thousandfold past the maximum.
                 - The Laplacian penalty is exactly zero at DC and grows as ω⁴, so λ has no
                   grip on slow structure. Measured: a 58% DC error sat unchanged across seven
                   orders of magnitude of λ. That is methods.html §12's "Laplacian low-frequency
                   blindness", and it is why "survives the sweep" cannot mean "is real".
                 - On Tab 3 the same machinery smooths the SPIKE TRAIN, not the kernel — the
                   opposite of the sparsity prior OASIS/MLspike use, which is why raising λ
                   there makes the answer worse rather than cleaner. -->
      </div>
    </details>

    <details class="fold" id="lambda-fold">
      <summary>The dial marked &lambda; (lambda) &mdash; the one setting the tool leaves to you</summary>
      <div class="fold-bd">
          <section class="plain lam" id="lambda">
            <p>
              Building a trace from spikes and a kernel is <strong>convolution</strong> &mdash; stamping
              the same calcium shape down once per spike. Going the other way, from the trace back to
              the kernel, is <strong>deconvolution</strong>, and it is not a clean reversal. A real
              trace carries noise, and undoing a convolution <em>amplifies</em> it. Left completely
              unchecked, the answer reproduces your recording almost perfectly and is still physically
              impossible: Tab 3 lets you watch that happen, and see that about half the numbers it
              hands back, frame by frame, are negative. A spike count cannot be negative &mdash; and
              raising &lambda; barely dents it.
            </p>
            <p>
              So the tool asks a narrower question &mdash; not &ldquo;which kernel reproduces this
              trace?&rdquo; but &ldquo;which reasonably <em>smooth</em> kernel reproduces this
              trace?&rdquo; That added insistence on smoothness is the tool&rsquo;s
              <strong>regularization</strong>, and <strong>&lambda;</strong> (lambda) sets how hard you
              insist. It ships with a working default, but its right value is genuinely yours to
              judge, which is why the tool shows it rather than burying it.
            </p>
            <p>Three things to know before you turn it:</p>
            <ul>
              <!-- "the picture above" was a dangling reference: the figure lives in a
                   different fold, and the primary way into THIS fold is the deep link from
                   Tab 2/3's λ slider, which used to open only this one. The button opens
                   that fold too, so the reference resolves however the reader arrived. -->
              <li>Of the three recovery methods &mdash; see
                <button class="inline-link" onclick={() => revealAndScroll('methods-fold')}
                  >the picture in <em>The three recovery methods</em></button
                > &mdash; it touches only the first:
                <strong>free-vector</strong>, which gives every lag of the kernel its own free value and assumes no shape at all.
                The <strong>parametric</strong> fit, which fits a rise-and-decay curve, has no &lambda;
                at all; the <strong>shaped</strong> method carries its own fixed penalties. The
                stability check sweeps &lambda; for you across the whole range, so it does not follow
                where you leave the slider.</li>
              <li>On Tab 2 it smooths the recovered <strong>kernel</strong>, on a log slider from
                0.002 to 3. On Tab 3 the same machinery is pointed at the <strong>spikes</strong>
                instead, from 0 to 1 &mdash; and smoothness is the wrong thing to want from a spike
                train, which is why no &lambda; there ever gives you a clean count. The dedicated tools
                take other routes: supervised training against ground truth (CASCADE), or a
                biophysical model of the indicator (MLspike). OASIS takes the <em>same</em>
                route with the opposite prior &mdash; instead of insisting the answer be
                smooth, it forces the count non-negative and penalises it for not being
                sparse, i.e. assumes most time points carry no spike at all. Which is the
                right thing to want from a spike train.</li>
              <!-- The ratio used to be quoted as "about ten thousand times smaller". It is not a
                   constant: recomputed at the shipped defaults it is ~616× on total energy (1,728×
                   on DC), and it moves between 6× and 15,000× across the kernel-peak slider alone.
                   No source in the repo carries the figure. The comparability point survives
                   without a number; the number did not survive being checked. -->
              <!-- This bullet and the one above name DIFFERENT things and read as a flat
                   contradiction if that is not said out loud: bullet 2 names what λ smooths,
                   this one names what its penalty has to compete against in the denominator
                   (|S|² on Tab 2, |K|² on Tab 3). Two reviewers independently read them as
                   self-contradicting three lines apart. -->
              <li>The two numbers are not comparable &mdash; and not for the reason the bullet
                above might suggest. &lambda; is not weighed against the thing it smooths; it
                competes with how strongly the <em>other</em> signal already pins the answer
                down (the spike train on Tab 2, the assumed kernel on Tab 3). Those differ by
                orders of magnitude, and the gap itself shifts with the recording. Read each
                slider on its own terms; carrying a value across means nothing.</li>
            </ul>
            <p>
              Sweeping &lambda; is part of the <strong>stability</strong> check, one of the four
              goodness-of-fit checks Tab 2 reports, and its job is narrower than it looks: a bump that
              shows up at one &lambda; and vanishes at the next is an artifact of the smoothing, not a
              finding. <strong>But steadiness is not proof.</strong> The penalty only ever pushes on
              fast wiggles: it has no grip at all on slow structure, so a drifting baseline, or a step
              that appears <em>before</em> the spike that supposedly caused it, sits unmoved from one
              end of the slider to the other. Those are exactly the artifacts a sweep cannot rule out.
              A steady sweep buys you the absence of one kind of error &mdash; whether there is a
              kernel here at all is what the other three checks are for.
            </p>
            <p>
              You will find the dial on Tab 3, and on Tab 2 inside the <strong>Advanced</strong> panel.
            </p>
            <p class="lam-more">
              <a class="out-link" href={METHODS_REGULARIZATION_URL} target="_blank" rel="noopener"
                >The equations behind &lambda; <span aria-hidden="true">↗</span></a
              >
              <a class="out-link" href={METHODS_CHECKS_URL} target="_blank" rel="noopener"
                >The four goodness-of-fit checks <span aria-hidden="true">↗</span></a
              >
            </p>
          </section>

      </div>
    </details>

    <details class="fold">
      <summary>Your first run, in 30 seconds</summary>
      <div class="fold-bd">
          <section class="plain steps">
            <ol>
              <li>Open <button class="inline-link" onclick={() => onNavigate?.(1)}>Tab 1</button>
                and hit <strong>↻ random 0.1 Hz</strong> to scatter some spikes.</li>
              <li>Try different <strong>kernel</strong> shapes and sliders — see the output trace update live.</li>
              <!-- Tab 1 opens at 3× cohort σ by design (ADR-0042 — a clean default made the
                   forward model look noiseless). Telling the reader to turn noise UP told
                   them to fix something already fixed, and implied the opposite default. -->
              <li>Drag <strong>Measurement noise</strong> to 0 and back &mdash; it starts at
                3× the cohort-typical level, so the trace already looks like real data.</li>
              <li>Jump to <button class="inline-link" onclick={() => onNavigate?.(2)}>Tab 2</button>
                to recover the kernel from that signal.</li>
              <li>Ready for real data? Grab the template from
                <button class="inline-link" onclick={jumpToOwnData}>Bring your own recording</button>,
                drop it into Tab 2 to watch the loop work, then paste your own over it.</li>
            </ol>
          </section>
      </div>
    </details>

    <details class="fold" id="byo-fold">
      <summary>Bring your own recording &mdash; the file format and a template</summary>
      <div class="fold-bd">
        <BringYourData {onNavigate} />
      </div>
    </details>
  </section>

  <section class="reassure">
    <div class="r-icon" aria-hidden="true">🔒</div>
    <div>
      <h3>Your data never leaves your computer</h3>
      <p>
        <!-- NOT "makes no network requests at all" — that was false and it overclaimed past
             the project's own canon. The app fetches its own code-split chunks (the 487 kB
             xlsx bundle behind the template button three lines above this, for one), and
             FOUNDATIONS §6 commits to no THIRD-PARTY requests, with a verification ritual
             that reads "confirm only same-origin requests" — i.e. canon expects same-origin
             traffic to exist. methods.html has always said this correctly. -->
        Everything runs inside your browser. There is <strong>no backend</strong>, no upload
        and no tracking: the only requests this page makes are for its own code, from the site
        it came from. Unpublished recordings stay entirely on your machine.
      </p>
    </div>
  </section>
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
    color: var(--link-accent, var(--accent));
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
  .born {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--text-muted, var(--text));
    font-family: var(--mono);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .born .sep { opacity: 0.5; }

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
    color: var(--link-accent, var(--accent));
  }
  .mc-title { font-size: 20px; font-weight: 650; color: var(--text-h); }
  .mc-sub { font-size: 14.5px; color: var(--text); line-height: 1.5; }
  .mc-arrow { margin-left: auto; font-size: 30px; color: var(--accent); flex: none; }

  section { margin: 30px 0; }
  h2 { font-size: 21px; color: var(--text-h); margin: 0 0 12px; }
  /* app.css zeroes `p` margins globally (tight control panels want that); prose does not,
     and without this every multi-paragraph section on this tab runs together into one slab. */
  .plain p, p.plain { font-size: 16.5px; line-height: 1.62; color: var(--text); max-width: 66ch; margin: 0 0 14px; }
  .plain p:last-child, p.plain:last-child { margin-bottom: 0; }

  /* --- explainer figure (the "help document") --- */
  .fig { margin: 16px 0 0; }
  /* the premise figure has prose after it (the explainer's is last in its
     section), so it needs the bottom margin the shared rule omits */
  .problem .fig { margin-bottom: 20px; }
  .fig a { display: block; }
  .fig img {
    display: block;
    width: 100%;
    height: auto;
    /* the figure is drawn on white with dark text — keep it light in either
       theme (same choice as the Tab 2 modal) rather than inverting it */
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    box-sizing: border-box;
  }
  .fig a:hover img { border-color: var(--accent-border); }
  /* Normal flow, NOT flex. This was `display: flex; gap: 12px`, which was fine while a
     caption was just "sentence + link" — two flex items — but it makes every inline child
     its own item, so any <strong>/<em> gets a 12px gap inserted before the punctuation
     after it ("Simulated , not a recording"). The link keeps its separation via a margin
     instead, which does not depend on the caption having exactly two children. */
  figcaption {
    margin-top: 8px;
    font-size: 13.5px;
    color: var(--text-muted, var(--text));
  }
  figcaption a { font-weight: 600; margin-left: 10px; white-space: nowrap; }

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
    color: var(--link-accent, var(--accent));
  }
  .c-title { font-size: 18px; font-weight: 650; color: var(--text-h); }
  .c-body { font-size: 14.5px; line-height: 1.5; color: var(--text); }
  .c-go { margin-top: auto; font-size: 14px; font-weight: 600; color: var(--link-accent, var(--accent)); }

  .jump {
    margin: 14px 0 0;
    font-size: 15px;
    color: var(--text);
  }

  /* --- "More, if you want it" — the folded remainder --- */
  .more h2 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text);
    margin: 0 0 10px;
  }
  .fold {
    border-top: 1px solid var(--border);
  }
  .more .fold:last-of-type {
    border-bottom: 1px solid var(--border);
  }
  .fold > summary {
    cursor: pointer;
    padding: 13px 4px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-h);
    list-style: none; /* the default triangle is replaced by the ▸ below */
    /* flex so a summary that wraps (narrow widths) hangs under its own first word
       rather than returning to the marker column */
    display: flex;
    align-items: baseline;
  }
  .fold > summary::-webkit-details-marker {
    display: none;
  }
  .fold > summary::before {
    /* `content: '▸' / ''` gives the glyph EMPTY alt text, keeping it out of the summary's
       accessible name — it was announced as "▸ What is a kernel?", duplicating the
       disclosure state the role already exposes. And --link-accent, not --accent: at this
       size it is text, and the UI accent measures 4.39:1 on white (see app.css). */
    content: '▸' / '';
    flex: none;
    width: 1.1em;
    color: var(--link-accent, var(--accent));
    transition: transform 0.12s ease;
  }
  .fold[open] > summary::before {
    transform: rotate(90deg);
  }
  .fold > summary:hover {
    color: var(--link-accent, var(--accent));
  }
  .fold-bd {
    padding: 0 4px 8px 1.1em;
  }
  /* The folded sections keep their own internal spacing; drop the top margin the standalone
     <section> rule gives them so they do not gap under the summary. No :global needed — the
     only non-Help section it could reach (BringYourData's .byod) has no margin to zero. */
  .fold-bd > section:first-child {
    margin-top: 0;
  }

  /* --- the λ section --- */
  .lam ul {
    margin: 4px 0 14px;
    padding-left: 22px;
    max-width: 66ch;
  }
  .lam li {
    font-size: 16.5px;
    line-height: 1.62;
    color: var(--text);
    margin: 6px 0;
  }
  /* Two exits (equations, the four checks). `.out-link` is the shared style in
     app.css — underlined, so it does not rest on the accent colour alone, which
     falls below AA contrast on the light background at this size. */
  .lam-more { margin: 14px 0 0; display: flex; flex-wrap: wrap; gap: 8px 26px; }

  /* --- steps --- */
  .steps ol { margin: 0; padding-left: 22px; }
  .steps li { font-size: 16px; line-height: 1.55; color: var(--text); margin: 8px 0; }
  .inline-link {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: var(--link-accent, var(--accent));
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

  @media (max-width: 620px) {
    .methods-cta { flex-direction: column; align-items: flex-start; gap: 10px; }
    .mc-arrow { margin-left: 0; }
  }
</style>
