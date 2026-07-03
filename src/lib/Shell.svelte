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
  let { wide = false, rail, summary, kernelPanel, bands } = $props();
</script>

<div class="shell" class:capped={!wide}>
  <aside class="rail">{@render rail?.()}</aside>
  <div class="plots">
    <div class="top-row">
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
    height: clamp(240px, 34vh, 340px);
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
