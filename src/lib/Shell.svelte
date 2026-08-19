<script>
  // Shared plot shell for both tabs (2026-07-03 layout unification).
  // Left tools rail (20%) + right plot area (80%). The right area is a fixed-height
  // top row holding a summary panel (left) beside a SQUARE kernel (right), then
  // full-width, co-registered time-course bands filling the remaining height.
  //
  // The square kernel is pinned top-right; the slot beside it holds readouts, NOT a
  // time band — a narrower time band there would break the pixel-for-pixel x
  // co-registration invariant (ADR-0030 / FOUNDATIONS §11.5). Content comes in as
  // four snippets so each tab supplies its own controls/summary/kernel/bands while
  // sharing one structure.
  //
  // `wide` = the shared width preference: false caps the shell (comfortable line
  // lengths, sane kernel size on ultrawide); true lets it run full-bleed.
  // `compactTop` shrinks the fixed top row. The default height is sized for tabs whose
  // kernel square is the RESULT (Tab 2's recovered kernel, Tab 1's authored one) — there it
  // earns 42vh. On a tab where the square only shows an input the user already chose, that
  // 42vh is taken straight out of the time bands: Tab 3 measured 399px of top row against
  // 397px for THREE bands, which left its axis-carrying raster with a 0px plot. Opt-in, so
  // no existing tab moves.
  let { wide = false, compactTop = false, rail, summary, kernelPanel, bands } = $props();
</script>

<div class="shell" class:capped={!wide}>
  <aside class="rail">{@render rail?.()}</aside>
  <div class="plots">
    <div class="top-row" class:compact={compactTop}>
      <section class="summary">{@render summary?.()}</section>
      <section class="kernel-sq">{@render kernelPanel?.()}</section>
    </div>
    <div class="bands">{@render bands?.()}</div>
  </div>
</div>

<style>
  .shell {
    display: flex;
    gap: 18px;
    flex: 1;
    min-height: 0;
  }
  /* width preference: capped keeps traces from stretching + the kernel square sane */
  .shell.capped {
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
  }

  /* --- left tools: 20% (min 210 so controls don't crush, max 300) --- */
  .rail {
    flex: 0 0 20%;
    min-width: 210px;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-right: 16px;
    border-right: 1px solid var(--border);
    overflow-y: auto;
  }

  /* --- right plots: 80% --- */
  .plots {
    flex: 1 1 80%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* fixed-height top row: summary (fluid) + SQUARE kernel (its side = row height) */
  .top-row {
    display: flex;
    gap: 12px;
    flex: none;
    /* the kernel is primary — give the square a generous side (= this row's height) */
    height: clamp(300px, 42vh, 480px);
  }
  /* Compact: the square stays square and readable, and the height it gives up goes to the
     bands. Same clamp shape, scaled down — never a fixed px, which would stop yielding on a
     short viewport (ADR-0040's cap-not-fix lesson). */
  .top-row.compact {
    height: clamp(190px, 24vh, 300px);
  }
  /* SHORT viewport, not narrow: a 700px-tall window has ~360px for the bands once the nav,
     the AP-independent strip and this row are paid for, and on a three-band tab that is the
     difference between readable plots and 10px slivers. The floor yields here rather than
     holding a square nobody is looking at. (Width has its own breakpoint below.) */
  @media (max-height: 820px) {
    .top-row.compact {
      height: clamp(130px, 20vh, 200px);
    }
  }
  .summary {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    background: var(--bg);
    overflow: auto;
  }
  .kernel-sq {
    flex: none;
    height: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--bg);
  }

  /* full-width, co-registered time-course bands fill the remaining height */
  .bands {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* stack on narrow viewports; kernel keeps a fixed square */
  @media (max-width: 900px) {
    .shell {
      flex-direction: column;
    }
    .rail {
      flex-basis: auto;
      max-width: none;
      border-right: none;
      border-bottom: 1px solid var(--border);
      padding-right: 0;
      padding-bottom: 14px;
    }
    .top-row {
      flex-direction: column;
      height: auto;
    }
    .kernel-sq {
      width: min(320px, 100%);
      height: auto;
      align-self: center;
    }
  }
</style>
