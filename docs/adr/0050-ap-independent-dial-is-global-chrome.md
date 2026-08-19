# ADR-0050: The AP-independent dial is global, and lives in the chrome — one control, one place

## Status

Accepted
(**Supersedes [ADR-0049](0049-ap-independent-calcium-slider.md) §5** — its per-tab scope and
per-rail placement. Everything else in ADR-0049 stands unchanged: the mixing model, the
derived onsets, the fade-in, the `_80` amplitudes and morphologies, and Tab 0's exclusion.
FOUNDATIONS §11.2's AP-independent bullet is rewritten to match.)

## Context

ADR-0049 scoped the dial to the signal: Tabs 1 and 3 shared one bound value, Tab 2 kept its
own, and each tab drew its own slider in its own rail. Shipped and used, that produced three
different answers to "where is it?" — Tab 1's at the **bottom** of the rail under the noise
tool, Tab 3's in the **middle** under λ, and Tab 2's inside the **collapsed Advanced fold**,
which is the one place a control you are meant to reach for cannot be. Tony's report was
exact: *"slider should be in the same place for all tabs. no hunting for it. always present.
always ready to interfere with ap-dependent interpretation."*

The last clause is the argument, not a preference. This dial is not a per-tab convenience
like λ or a display toggle. It breaks the premise **all three tabs share** — Tab 1
synthesizes from `calcium = spikes ⊗ kernel`, Tab 2 recovers assuming it, Tab 3 inverts it —
and the whole point of putting it in a user's hand is that the assumption is *always*
available to break. A control that has to be found does not say that. Worse, the split scope
made the same rail slot lie: contamination authored on Tab 1 rode into Tab 2 inside the
handoff, so Tab 2's own slider could read **0.00** over a trace that was visibly full of
AP-independent events.

## Decision

1. **One global value**, owned by `App.svelte` and passed to every tab. There is no per-tab
   AP-independent state left anywhere.

2. **The control is app chrome, not a rail control.** `ApIndependentBar.svelte` renders a
   full-width strip directly under the tab row — identical markup, identical position
   (measured: same x/y/width/height on Tabs 1, 2 and 3), never inside a fold, never scrolled
   away with a rail. Hidden on Tab 0 alone, whose premise figure is a composed argument
   rather than a signal this governs.

3. **The strip always says what its position MEANS**, because a bare 0…1 does not: end
   captions (`all kernel` / `all AP-indep.`), the value, and a status phrase that changes —
   *"off — every calcium event is the kernel, stamped once per spike"* at zero, *"the spike
   train explains none of this trace"* at one. Off zero it turns accent-colored and grows a
   `⚠`, because every number on the page below it is then describing a doctored trace. The
   `clear` button is always rendered and merely hidden at zero: appearing and disappearing
   would resize every plot band underneath each time the dial crossed zero.

4. **Applied exactly once, wherever the signal is.** Tab 1 mixes events into its synthesis;
   Tab 2 mixes them into whatever it has loaded. So the **Tab 1 → Tab 2 handoff now carries
   the UNCONTAMINATED trace** — the noisy `spikes ⊗ kernel` fluorescence — and Tab 2 places
   the events itself, from the same spike train, on the same span, at the same dial position.
   Shipping it pre-contaminated *and* applying the global dial would place every event twice.

5. **Tab 1 places events over the OUTPUT's span, not the grid's.** The convolution tail runs
   past the authored window and the handoff CSV carries that tail, so measuring the span from
   the grid alone would let Tab 1's last event land where Tab 2's copy of the same signal
   would not. Verified live: at mix 0.40 both tabs report **4 events**, in the same places.

6. **Each tab keeps its own statement of consequence**, now that it no longer keeps a
   control: Tab 1's output band names the events in its label, Tab 2 badges the reconstruction
   band `⚠ AP-independent mix N.NN — synthetic` and says so again in Advanced, Tab 3 reports
   how many events the inversion is about to invent spikes under. Provenance travels with the
   numbers; only the knob is centralized.

## Consequences

- **The dial is unmissable and unambiguous.** One value, one place, one reading of it on
  every tab — and no rail slot can any longer report 0.00 over a contaminated trace.
- **A global dial reaches real recordings by design.** Set it on Tab 1, load your own file in
  Tab 2, and the contamination applies there too. That is the intent ("always ready to
  interfere"), and it is why the badge sits beside the §3 numbers and the strip is loud: this
  must never be mistakable for a measurement of the loaded file.
- **One fidelity caveat, recorded rather than hidden.** Because Tab 2 re-derives the events
  from the handoff instead of receiving them, its reference amplitude is measured on the
  *noisy* trace where Tab 1's was measured on the clean one — so a hump can differ by a few
  percent in height between the two views. Times, count, shapes and the spike train are
  identical; the recovered kernel is unaffected. The alternative (transporting the events)
  would mean the handoff was no longer byte-identical to a real file load, which ADR-0034
  deliberately made it.
- **Rail space came back.** Tab 1's timebase fold and Tab 3's λ hint now sit above the fold
  on a 950px viewport, which the removed field had pushed down.
- **~44px of vertical space** leaves the plot area on Tabs 1–3. Paid once, from the shell,
  not from any band's share.
