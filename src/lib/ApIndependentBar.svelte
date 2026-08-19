<script>
  // The AP-independent calcium dial — ONE control, in ONE place, on every working tab.
  //
  // It started as three per-tab sliders in three different rail positions, one of them
  // inside a collapsed fold, which is three places to hunt for the same idea and one place
  // to never find it. The point of this control is that the tool's whole premise —
  // `calcium = spikes ⊗ kernel` — is an assumption, and the assumption is always available
  // to break. A knob that has to be found does not say that; a knob that is always on
  // screen, in the same spot, above whatever tab you are reading, does.
  //
  // It lives in the app chrome beside the tabs rather than in any tab's rail, because it is
  // now a GLOBAL value (ADR-0050): one number, applied once, wherever the signal is.
  // Hidden on Tab 0 only — that tab's premise figure is a composed argument, not a signal
  // this dial governs.

  let { mix = $bindable(0), tab = 1 } = $props();

  const TIP =
    'Calcium with no action potential beneath it — slow humps and big near-symmetric ' +
    'events, modeled on _80 ROI 1 (FOUNDATIONS §3). At 0 every sample is input ⊗ kernel, ' +
    'the assumption this whole tool tests. Raising it fades the AP-linked signal out and ' +
    'places events in the widest spike-free stretches, so at 1 the spike train explains ' +
    'nothing. Synthetic, and applied to whatever signal the tab is showing.';

  // One phrase that always says what THIS position means. A bare 0…1 does not.
  const status = $derived(
    mix === 0
      ? 'off — every calcium event is the kernel, stamped once per spike'
      : mix >= 0.995
        ? 'the spike train explains none of this trace'
        : 'on — part of this trace is calcium no spike caused (synthetic)',
  );
</script>

<div class="apbar" class:on={mix > 0} title={TIP}>
  <span class="lab">
    {#if mix > 0}<span class="warn" aria-hidden="true">⚠</span>{/if}
    AP-independent calcium
  </span>

  <span class="end">all kernel</span>
  <input
    class="dial"
    type="range"
    min="0"
    max="1"
    step="0.01"
    bind:value={mix}
    aria-label="AP-independent calcium mix — 0 is all kernel-explained, 1 is all AP-independent"
  />
  <span class="end">all AP-indep.</span>

  <output class="val">{mix.toFixed(2)}</output>
  <span class="status">{status}</span>

  <!-- Always rendered, hidden at zero rather than removed: the strip sits directly above the
       plots, so a button that appears and disappears would resize every band underneath it
       each time the dial crosses zero. -->
  <button class="clear" class:hidden={mix === 0} disabled={mix === 0} onclick={() => (mix = 0)}>
    clear
  </button>
</div>

<style>
  /* Always present, never scrolled away: a strip in the app chrome directly under the tab
     row, identical on every tab that carries a signal. `flex: none` so it costs its ~34px
     from the shell once, not from any plot band's share. */
  .apbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-size: 12px;
    color: var(--text);
    min-width: 0;
  }
  /* Off-zero is a loud state on purpose: every number on the page below is then describing
     a doctored trace, and that must never be a thing you have to remember. */
  .apbar.on {
    border-color: var(--accent-border);
    background: var(--accent-bg);
    color: var(--text-h);
  }
  .lab {
    font-weight: 600;
    color: var(--text-h);
    white-space: nowrap;
  }
  .warn {
    margin-right: 2px;
  }
  .end {
    font-size: 10.5px;
    opacity: 0.75;
    white-space: nowrap;
  }
  .dial {
    flex: 0 1 220px;
    min-width: 90px;
  }
  .val {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-h);
    font-variant-numeric: tabular-nums;
    min-width: 3.2em;
  }
  .status {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .clear {
    margin-left: auto;
    font: inherit;
    font-size: 11px;
    padding: 2px 9px;
    border: 1px solid var(--accent-border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--accent);
    cursor: pointer;
    white-space: nowrap;
  }
  .clear:hover {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .clear.hidden {
    visibility: hidden;
    pointer-events: none;
  }

  /* Narrow viewports: the explanatory phrase is the first thing to go — the label, the
     dial and its value are what must survive. */
  @media (max-width: 900px) {
    .status,
    .end {
      display: none;
    }
  }
</style>
