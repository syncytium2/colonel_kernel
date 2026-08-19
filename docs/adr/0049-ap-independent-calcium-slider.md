# ADR-0049: An AP-independent calcium dial on every working tab

## Status

Accepted
(**Extends canon.** FOUNDATIONS §11.2's control-scope list gains a second signal-model dial
beside noise injection; §3's AP-independent phenomenon becomes something the app can *do*, not
only something it documents. Changes no earlier decision. Tab 0's premise figure is deliberately
**not** included — see Consequences.)

## Context

**The app's null model was the only model any tab could show.** Every tab was built on one
identity — `calcium = spikes ⊗ kernel` — and nothing in the running app could break it. Tab 1
synthesizes from it, Tab 2 recovers a kernel assuming it, Tab 3 inverts it. The single place the
tool admitted that the identity fails was Tab 0's premise figure, where three AP-independent
events are baked in at fixed times and amplitudes and cannot be varied, examined, or carried
anywhere. A visitor could read that the assumption fails; they could not *watch it fail*.

That gap matters most on the flagship. FOUNDATIONS §3 makes the tool's deliverable "is there a
kernel, or isn't there?", and §7 warns against deconvolution that is **deceptively easy** — the
same argument ADR-0042 used to switch noise on by default. Noise, though, is the *benign*
departure from the model: it is zero-mean, it averages out, regularization is designed for it,
and the STA exists precisely to beat it. AP-independent calcium is the departure that does none
of those things. No λ removes it, no amount of averaging shrinks it, and the four §3 checks were
never watched degrading against a known amount of it.

**The phenomenon is already characterized here.** FOUNDATIONS §3 anatomizes it on `_80`
(`APs_v1_20241004`, ROI 1): a transient beginning 0.46 s after the last AP, rising for six
seconds, cresting at **0.247 dF/F₀**, with **not one AP between 786.25 s and 800 s** — against
**0.037 dF/F₀** for the ordinary 10-AP burst seconds earlier. Two properties carry over: these
events are **big** relative to anything the spikes produce, and they are the **wrong shape** for
the AP kernel (too symmetric, or far too slow). Tab 0's simulation had already turned that into
two morphologies (`narrow`, `slow`); they were sitting in `premise-sim.js`, usable by one figure.

## Decision

1. **One dial, 0 → 1, on Tabs 1, 2 and 3.** `0` = every sample is calcium a kernel explains (the
   null model, and the default everywhere); `1` = the spike train explains none of it. The ends
   are labeled in the UI, because a bare 0…1 does not say which way is which.

2. **The model is a mix, not an addition.** `trace(mix) = (1 − mix)·AP-linked + Σ events(mix)`.
   The AP-linked component **fades** as the dial rises — without that, `1` would mean
   "kernel-explained calcium *plus* humps", which is not what the top of the slider claims.

3. **Events accumulate, most-defensible first, and fade in.** Onsets are **derived** from the
   spike train (widest spike-free stretches first, ranked by clearance), never authored: an event
   that lands on a spike demonstrates a big response, not AP-independent calcium. The newest
   event carries a fractional weight, so the dial is continuous rather than a staircase of pops,
   and amplitude/shape are keyed to an event's **rank** — raising the dial only ever adds, it
   never reshuffles what is already on screen.

4. **Modeled on `_80`.** Amplitudes are drawn at **1.2–2.7×** the trace's own robust event
   amplitude (the real ratio there is nearer 6.7×; this is cut back so the humps dominate without
   flattening the AP-linked transients into the axis), and shapes alternate between the two
   morphologies. Those morphologies now live in `core/ap-independent.js` and are **re-exported**
   by `premise-sim.js`: one definition, so the figure that *argues* the phenomenon and the
   control that *demonstrates* it cannot drift apart.

5. **Scope follows the signal, not the tab.** Tabs 1 and 3 **share one value** (bound, not
   copied) because Tab 3 deconvolves the very signal Tab 1 synthesizes (§11.3) — the slider
   appears in both rails and moves one number. Tab 2's is **tab-local and default 0**, exactly
   like its noise slider, and applies to whatever is loaded. Contamination authored in Tab 1
   rides into Tab 2 through the existing handoff, because it is in the signal, not in the plot.

6. **Tab 2 says so where the numbers are.** The dial lives in the collapsed Advanced fold, and
   once it is off zero every number on the page — the kernel, all four §3 checks — describes a
   doctored trace. A badge in the reconstruction band's head reads
   `⚠ AP-independent mix N.NN — synthetic`, with a one-click **clear**, and Tab 2's displayed
   trace shows the contamination rather than only feeling it in the statistics. A contaminated
   recovery must never be mistakable for a measurement of the loaded file.

## Consequences

- **The §3 checks can now be watched failing against a known cause.** At mix 0.45 on the default
  Tab 1 → Tab 2 handoff, retained-kernel R² goes to **−0.56** and the acausal ratio to **1.93**
  — the recovered "kernel" is mostly a pre-spike lobe. That is the failure signature §3 exists to
  name, produced on demand instead of waited for.
- **Tab 3's illustration gets sharper.** Naive inversion has no way to say "no spike caused
  this", so it answers a hump with spikes that were never fired, and nothing in its output marks
  which ones. Correlation with the truth falls to ~0 by mix 0.8.
- **The readout runs ahead of the dial, and should.** The reported AP-independent share is of
  *variance*, so two minute-long humps outweigh thirty one-second transients: mix 0.35 already
  reads ~90%. That gap is the lesson, not a scaling bug — it is how much of a sparse-spiking
  trace a handful of unexplained events can own.
- **This is a what-if dial, never a correction.** It adds a known violation to real data so its
  cost can be measured; it never removes or repairs anything. FOUNDATIONS §3's premise stands —
  calcium unexplained by the targeted cell's APs is physiology to be measured, not an artifact to
  correct — and this ADR models the *signal* those readings share, not a verdict about a cell.
- **Tab 0 is deliberately excluded.** Its premise figure is a composed argument with a caption
  that counts its three events, and the dial's zero point is "no AP-independent events at all" —
  so the figure's default would have to sit mid-scale, contradicting the convention on every
  other tab, or the shipped figure would stop making its point. Changing what that figure argues
  is a FOUNDATIONS-level decision, not a UI one.
- **Guarded by 20 tests** in `core.test.mjs`, on the properties the dial's claims rest on: both
  ends of the range, monotone accumulation, no reshuffling, at most one event mid-fade, no step
  larger than an event, every onset in a spike-free stretch, `_80`-scaled amplitudes, both
  morphologies in play, NaN gaps preserved, and correlation with the truth falling monotonically.
