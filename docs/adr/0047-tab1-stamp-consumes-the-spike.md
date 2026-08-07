# ADR-0047: Stamping consumes the spike — the challenge shows the transformation

## Status

Accepted
(Reworks the interaction of [ADR-0046](0046-tab1-stamp-the-kernel-challenge.md); that ADR's
framing — Tab 1's challenge runs in Tab 1's forward direction, spikes and kernel given, you build
the output — is unchanged and still the reason this challenge exists. Display/interaction only,
no core change.)

## Context

ADR-0046 shipped "Stamp the kernel" as a *placement* game: the given spikes stayed on screen, you
clicked anywhere to drop a kernel copy, and R² scored how well your placements matched. It worked,
but Tony's read was that it was not the best representation of what convolution does, and he named
the better one: **clicking a spike should take it away and replace it with the kernel.**

That is right, and it is right for a reason worth writing down. Convolution does not *add stamps
alongside* an input that persists — it **replaces** every delta with a scaled copy of the kernel.
The old interaction left the input sitting there while a separate output accumulated, which reads
as two independent things rather than one being transformed into the other. It also asked for an
instruction the UI never gave: nothing on screen said *click each spike to stamp a kernel*.

## Decision

1. **A click consumes the nearest un-stamped spike** and puts a kernel copy in the output at that
   time. The input drains as the output fills. Shift-click puts one back.
2. **Say it in the UI.** The spike band is labelled *"Spikes — click each one to stamp its kernel
   into the output"*, with a live *(n left)*, and the rail leads with *"Convolution replaces each
   spike with a copy of the kernel, and the copies add."*
3. **Nearest-wins, not a tight hit box.** A burst's deltas are a few pixels apart; requiring a
   precise hit would make it a dexterity test. Clicking the same pixel three times consumes all
   three, because the first is gone by the second click — you still click once per spike, which is
   the point, but you are never fighting the mouse.
4. **You can no longer misplace a kernel — deliberately.** That removes the old R² score as a
   measure of skill, and replaces it with the failure mode that actually teaches: **leaving a
   spike behind**. So Advanced now hides the **count** as well as the target, making *"have I
   found them all?"* a real question answered by reading the spike train. Normal shows `n / total`
   and ends the round automatically when the input is empty; Advanced waits for an explicit Done.
5. **Stamped deltas remain as short grey stubs**, not removed outright. Literally vanishing would
   leave a burst's second spike with nothing to shift-click back and no sense of progress. They
   are drawn **short as well as grey**: at 3px wide, ink-versus-grey alone was too fine to act on,
   and "which are still to do" is the one question this band must answer at a glance. Height is
   the channel that reads instantly.

## Consequences

- **The tab now demonstrates the definition rather than testing aim.** Each click moves one delta
  out of the input and one kernel into the output; when the input is empty the output *is* the
  convolution. The band label states that in words.
- **Superposition is still the difficulty, and now it is the only one.** In a burst you see two
  deltas but one growing peak, and the one spike left unstamped stands tall among the stubs.
  Verified: stamping 8 of 9 in Advanced reports *"1 spike left unstamped"* and the tall stub sits
  inside the triplet.
- **Verified by driving the deployed interaction**, not by reasoning: all nine stamped → `9 / 9`
  with the completion verdict and auto-finish in Normal; three clicks on a single burst pixel →
  `3 / 9` (nearest-wins works); Advanced shows a bare count while playing and `8 / 9` after reveal.
  No console errors.
- **Two completion checks read the state they just set** rather than a `$derived` refreshed in the
  same call. That is not a Svelte quirk worth relying on either way, and counting `stamped.length`
  against `round.nSpikes` is simply unambiguous.
- **R² is kept as a live "output match" readout**, blanked while the target is hidden. It is no
  longer a skill score — with placement impossible to get wrong it only measures completeness —
  so the headline readout is now the stamped count.
- **A scored round is frozen.** Shipped without this and caught it in the end-of-session
  sweep: after scoring you could keep clicking, taking a locked `3 / 9` to `6 / 9` while
  its verdict still read three. That is the same defect the 2026-07-30 review logged
  against Beat the Colonel and Guess the spikes — a new challenge inherited it by simply
  not thinking about the revealed phase. Both handlers now return unless `phase === 'play'`.
  The other two remain open (NEXT_SESSION "Next action" item 1).
- 240/240, machinery-check and template-acceptance pass; no core change.
- Relates to: [ADR-0046](0046-tab1-stamp-the-kernel-challenge.md) (the challenge this reworks),
  [ADR-0044](0044-convolution-scatter-form.md) (the stamp-and-sum formulation being enacted),
  [ADR-0041](0041-plot-series-palette-one-color-per-quantity.md) (the series tokens),
  [ADR-0045](0045-close-axis-tax-and-csp-style-attrs.md) (the axis-tax rule its bands follow).

## Still open

The **slide-and-multiply animation** remains undischarged, as ADR-0046 noted. This is closer to it
than the placement version was — the learner now performs the replacement — but nothing yet
animates the kernel sliding across the signal.
