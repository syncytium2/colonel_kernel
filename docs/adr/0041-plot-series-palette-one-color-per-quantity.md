# ADR-0041: One color per quantity — a plot series palette in CSS tokens

## Status

Accepted
(Display-only. Establishes a cross-tab color grammar and the tokens that carry it. No core
change, no canon change. Extends [ADR-0030](0030-shared-timebase-axis-co-registration-invariant.md)'s
"y-axes human-decided" clause into an explicit color rule, and follows
[ADR-0040](0040-tab1-band-order-follows-tab0.md), which unified band *order* but deliberately
left color alone.)

## Context

Every plot color in the app was a hex literal or a UI token written at its call site, spread
across seven components. Nothing enforced that the same quantity got the same color twice, and
it did not. Surveyed before this change:

| what it is | Tab 0 | Tab 1 | Tab 2 | Tab 3 | challenges |
| --- | --- | --- | --- | --- | --- |
| calcium trace | blue `#1f77b4` | teal `#2a9d8f` | teal | teal | teal |
| spike raster | red `#d21f3c` | ink `--text-h` | ink | ink | ink |
| your attempt | — | — | — | — | purple ×2, **red ×1** |

Red had drifted into three unrelated meanings — the spike raster on Tab 0, the reconstruction on
Tab 2, and "you" in Guess the spikes. Two collisions sat *inside a single view*: the Colonel was
drawn gray in Beat the Colonel's reconstruction band and **teal** in its kernel panel (teal being
the trace color everywhere else), and Guess the spikes drew "you" purple in its editable spike
band and red in its reconstruction.

Tony's instruction was that the colors should match throughout.

## Decision

**One color per quantity, defined once in `src/app.css` as `--series-*` tokens.** A role changes
there or nowhere; no component writes a plot hex.

| token | role | light | dark |
| --- | --- | --- | --- |
| `--series-trace` | measured / synthesized calcium trace; the challenge *target* | `#2a9d8f` | same |
| `--series-machine` | what the **machine** produced — Tab 2's reconstruction, the Colonel | `#c0392b` | same |
| `--series-you` | **you**: the kernel you author, your attempt | `--accent` `#aa3bff` | `#b45ef5` |
| `--series-spikes` | spike events (raster / stems) | `--text-h` | same token |
| `--series-truth` | hidden ground truth — **always also dashed** | `--text` | same token |

The organizing idea is that hue answers *whose* in comparison plots and *what* everywhere else.
Purple is the object the user controls (the kernel on Tabs 1/3, your attempt in all three
challenges); red is the machine's answer; teal is the data; ink is spikes; gray-dashed is truth.
That resolves both in-view collisions: the Colonel becomes red in *both* of its panels, and "you"
becomes purple in *both* of Guess the spikes'.

Three consequences of the grammar, chosen deliberately:

1. **Teal wins over Tab 0's blue.** Blue appeared once; teal in five places and in the
   `--noise-trace` overlay derived from it. Blue vs red also scored better on the colorblind
   check (ΔE 19.4 protan vs 13.1 deutan), but adopting blue would have forced Tab 2's
   reconstruction off red, rewritten the "teal = clean" noise caption, and recomputed
   `--noise-trace` — a large change to fix a pair that already passes.
2. **The dark chart purple is a shade deeper than the dark UI accent.** Dark `--accent`
   (`#c084fc`) is OKLCH L 0.72, above the L 0.48–0.67 band a series mark needs against the dark
   surface. `--series-you` steps to `#b45ef5`; UI chrome keeps `#c084fc`. This is the only place
   the two diverge.
3. **Tab 2's Okabe-Ito region hues are untouched.** Those encode *which region*, not which
   quantity — a different axis, settled by ADR-0024/ADR-0029. Flattening them into the role
   palette would destroy that information.

**The palette was validated, not eyeballed.** All checks pass on both surfaces: lightness band,
chroma floor, CVD separation (worst adjacent pair `--series-machine` ↔ `--series-trace`, ΔE 13.1
deutan, above the ΔE ≥ 8 target), normal-vision floor, and ≥ 3:1 contrast.

## Consequences

- **Copy that named colors had to change, and is now position-based.** Tab 0's text said "the
  red ticks are action potentials … the blue trace is the calcium signal", and the figure's
  screen-reader `alt` paragraph said "red ticks beneath a blue calcium trace". Both now describe
  *position* ("the ticks along the bottom", "ticks in a band beneath the calcium trace"), which
  survives any future palette edit and is better for the non-visual reader the `alt` text exists
  for. Guess the spikes' "(black, down)" became "(down)" — direction was always the real
  encoding. Tab 1's "teal = clean" is still literally true and stands.
- **Identity is never carried by color alone**, which the CVD floor requires: truth is dashed as
  well as gray, STA is dashed against a solid kernel, the Colonel is dashed, and the spike
  comparison uses up/down direction.
- **A CSS var reaching a canvas was the risk, and it is handled.** uPlot strokes via
  `ctx.strokeStyle`, and `Plot.svelte`'s `resolveColor()` reads `var(--x)` off `:root`. Three of
  the five tokens *nest* another var, so this was verified in a real browser rather than reasoned
  about: all five resolve to concrete hex in both schemes, no `#888` fallbacks.
- **Verified across all seven views** (four tabs, three challenges, plus the revealed state of
  both scored challenges, in light and dark): no console errors, and the roles read consistently.
- **A pre-existing text bug was fixed in passing** — Beat the Colonel's legend rendered "your
  kernelvs Colonel" because Svelte trims the leading space of an `{#if}` block.
- **`#c0392b` also serves error text** in Tab 2's rail (`.sl-err`). That predates this ADR and is
  left alone: it is never a chart mark, so the two never appear in the same frame. Worth knowing
  before adding a status palette, since the skill's rule is that status colors stay reserved.
- **Not addressed:** the STA's orange (`#e76f51`) is a sixth role with no token yet, and the
  region hues remain their own system. Both are deliberate; neither collides with the five.
- 237/237 core tests, machinery-check and template-acceptance pass; display-only, no core touched.
- Relates to: [ADR-0040](0040-tab1-band-order-follows-tab0.md) (unified order; left color open),
  [ADR-0024](0024-kernel-sta-overlay-display-mode.md) /
  [ADR-0029](0029-overlay-scale-kernel-sta-targets.md) (the region hues kept separate),
  [ADR-0031](0031-tab1-forward-noise-injection.md) (the "teal = clean" caption and
  `--noise-trace`), [ADR-0033](0033-shared-plot-shell-square-kernel.md) (the shell these plots
  sit in).
