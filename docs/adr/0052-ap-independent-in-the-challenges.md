# ADR-0052: The AP-independent dial reaches the three challenges — and the model learns a timescale

## Status

Accepted
(Extends [ADR-0049](0049-ap-independent-calcium-slider.md) / [ADR-0050](0050-ap-independent-dial-is-global-chrome.md)
to the challenge modes. Replaces the ad-hoc "spurious transient" generator inside
`BeatTheColonel`; its `uncoupled` round type survives as a floor. Adds `timescale` to
`core/ap-independent.js`.)

## Context

ADR-0050 put the dial in the app chrome, which renders it on every tab — **including in
challenge mode**, where none of the three games read it. A visible control that does nothing
is worse than an absent one. Tony: *"the games need the ap independent calcium too."*

They need it for a stronger reason than consistency. Each game teaches the forward model by
having you *use* it, and each is therefore built on the assumption the dial exists to break:

- **Stamp the kernel** — every calcium event is a stamp you can place.
- **Guess the spikes** — every bump has a spike near its onset. That is literally the
  instruction printed in the rail.
- **Beat the Colonel** — some kernel, yours or the machine's, fits this trace.

Beat the Colonel already knew this and had rolled its own: on ~1 in 3 rounds it dropped 1–2
copies of **the round's own kernel** at a **random sample**. Both details are wrong for the
job — an event that fits the kernel is precisely the event a kernel fit *can* explain, and a
random sample can land on a spike, where the bump reads as a large coupled event rather than
as a violation.

## Decision

1. **All three games take `apIndepMix`** and mix AP-independent calcium into their target
   before measurement noise, through the shared `mixApIndependent`.

2. **`timescale` is added to the model.** Its numbers were measured on `_80` — τ ≈ 2.7 s over
   18 minutes — and the games run **30–60 s rounds with sub-second kernels**, where those
   numbers fail *silently and in both directions*: the 5 s pre-onset clearance rejects every
   gap a fast round has, so **nothing is placed**, and the `slow` morphology (12 s decay,
   ~86 s of support) stops being an event and becomes a **baseline shift across the round**.
   `timescale` scales the shape constants and the three clearances together, preserving the
   ratios that make the morphologies mean anything; each game sets it from its own kernel
   (`tauDecay / 2.7`). Explicit options still win over it.

3. **Beat the Colonel's bumps go through the shared model**, so they are the `_80`
   morphologies in spike-free stretches. `uncoupled` becomes a **floor, not a switch**
   (`effMix = max(dial, uncoupled ? 0.3 : 0)`): ~1 in 3 rounds stays decoupled whatever the
   dial says, because "does this recording even have a kernel?" is this game's question and it
   must keep being asked at dial 0. The verdict reads the *effective* mix, so a round the dial
   decoupled is called uncoupled too. Its gain-drop stretch (APs *without* proportional
   calcium) is a different violation and is left alone.

4. **The copy that the dial makes false is withdrawn.** Three claims were true only under the
   null model and are now conditional:
   - Stamp's reveal — *"where it falls short of the target, a spike is still un-stamped
     underneath"* — becomes "it cannot match however you play: N events had no spike to stamp."
   - Guess's play note — *"every bump needs a spike near its onset"* — becomes a warning that
     not every bump has one, without giving the count away; the count is revealed at scoring.
   - Beat's uncoupled verdict now counts the events instead of assuming one.

5. **Stamp's pinned y-axis makes room from constants and the dial only** — never from the
   round's data, which in Advanced would hand over the hidden burst peak the pin exists to
   conceal (ADR-0046).

## Consequences

- **Scoring is untouched in all three.** Stamp scores spikes *left behind* (ADR-0047), not
  R², so an unmatchable target cannot fail a player who stamped everything — the shortfall is
  the lesson, not a penalty. Guess scores F1 against the true spikes, so events with no spike
  under them cost you false positives, which is exactly what they cost a real analysis. Beat
  scores R² for both sides, and neither side can fit what no kernel explains.
- **Beat the Colonel's uncoupled rounds got better**, not just different: its bumps can no
  longer land on a spike, and are no longer kernel-shaped.
- **Five new tests** (265 total) pin the timescale behaviour, including the two silent
  failures above: that a 30 s round places nothing at timescale 1, that it places events when
  scaled, that scaled events still clear every spike, that a scaled `slow` event ends inside
  the round, and that an explicit clearance is not scaled twice.
- **Verified by driving all three games** with the dial at 0 and 0.6: each target changes, no
  console errors, and the strip is present in every challenge view.
