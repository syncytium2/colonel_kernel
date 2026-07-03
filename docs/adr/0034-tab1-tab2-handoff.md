# ADR-0034: Tab 1 → Tab 2 handoff — "Recover this in Tab 2"

## Status

Accepted
(2026-07-03. Realizes the settled-but-unbuilt cross-tab flow of **FOUNDATIONS §11.3**; no canon
change to §11.3's intent, which is now marked realized between Tabs 1→2. Builds on the
[ADR-0033](0033-shared-plot-shell-square-kernel.md) shared shell + Tab 1's new synthetic-recording
defaults.)

## Context

FOUNDATIONS §11.3 names the intended UX — *"one signal flowing through the tabs: author spikes +
kernel in Tab 1, carry the same signal into Tabs 2/3"* — and says the global timebase
([ADR-0002](0002-global-timebase.md)) exists *precisely* to make that safe. The plumbing was laid;
the control was never built. It is especially pointed now: `colonel_kernel` is a **ground-truth
kernel-verification instrument** (CLAUDE.md), and Tab 1 produces a synthetic recording with a
**known** kernel and spike train. Carrying that into Tab 2's recovery closes the loop — does
recovery return the kernel you authored?

Tab 2 already ingests a recording as `{ grid, spikeTimes, rois, meta, warnings }` via `loadCsv`
(CSV with `time` / `spikes` / roi columns). Tab 1 already holds everything that shape needs.

## Decision

1. **A "Recover this in Tab 2 →" button in the Tab 1 summary.** It builds a CSV **in memory** —
   `time, spikes, dFF0` — from `output.times`, the known spike times, and the **measurement
   fluorescence** (the noisy realization when the noise tool is on, else the clean output). It uses
   `output.times`, not `grid.times`, so the time column and the trace share one length even where
   the convolution tail runs past the window.

2. **Load through the *existing* `loadCsv` path — no new ingestion code.** The synthetic CSV is fed
   to the same `loadCsv` a dropped file uses, so the resulting recording is byte-identical in shape
   to a real load and every downstream Tab 2 derivation (regions, §3 checks, recovery, STA) works
   unchanged. Verified headlessly: round-trips with 0.0 max fluorescence error, exact spikes,
   dt 0.1, no warnings.

3. **One-shot via `handoff` + `onConsumed`.** App holds a `handoff` payload `{ csv, label, noisy }`
   and passes it to `<Tab2>`; a Tab 2 `$effect` loads it, then calls `onConsumed` so App clears it.
   This matters because Tab 2 remounts on every tab switch (`{#if tab === 2}`): without the clear, a
   later plain switch back to Tab 2 would re-load the synthetic and **clobber a file the user
   loaded**. Cleared → the effect re-runs, hits the null guard, does nothing.

4. **Fluorescence = what the eye saw.** Sending the noisy trace when noise is on (clean otherwise)
   is the honest recovery test — recovery must contend with the same measurement noise the user
   dialed in. The button caption states which is being sent.

## Consequences

- **Closes the ground-truth loop** the tool exists for: known kernel → synthesize → recover →
  compare, entirely client-side, no file round-trip.
- **§11.3 realized (Tabs 1→2).** Tab 3 and the chosen-kernel sharing question (§11.4 "Kernel scope")
  remain open; this ADR does not settle them — it hands a *recording*, not a shared kernel object.
- **No new parsing surface, no new dependency, privacy intact** (FOUNDATIONS §6): the CSV never
  leaves the browser; it is generated and consumed in memory.
- **Faithful, not lossy:** the handoff carries the exact synthesized samples + exact spike times, so
  any recovery gap is real (decoupling / noise / regularization), never a transport artifact.
- Relates to: [ADR-0002](0002-global-timebase.md) (the global timebase that makes the carry safe),
  [ADR-0031](0031-tab1-forward-noise-injection.md) (the noise the fluorescence can carry),
  [ADR-0033](0033-shared-plot-shell-square-kernel.md) (the shell + Tab 1 defaults this builds on),
  and Tab 2's `loadCsv` ingestion ([ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) family).
