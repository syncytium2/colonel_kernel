# 7. Build order / tab sequencing — 1 → 2 → 3

## Status

Accepted

## Context

The design phase is complete (ADRs 0001–0006); the next step is implementation. The open
question carried in `NEXT_SESSION.md` was the **order** in which to build the three tabs
(`FOUNDATIONS.md` §2):

- **Teaching-first (1 → 3 → 2):** build the two teaching tabs before the flagship, following the
  pedagogical narrative (forward convolution, then naive spike inference, then kernel recovery).
- **Research-first:** front-load Tab 2, the regularized-deconvolution calcium pipeline that is the
  real research need.

Both have pulls. Teaching-first matches the conceptual on-ramp but defers the hard, valuable part.
Research-first delivers the flagship soonest but builds the riskiest math against an unproven
foundation (spike model, kernel library, rasterization, timebase, plotting).

## Decision

**Build order is 1 → 2 → 3.**

- **Tab 1 first — as the spine-validation step.** Tab 1 (forward convolution) exercises the entire
  reusable foundation — spike-train editor, parameterized kernel library
  ([ADR-0003](0003-kernel-source.md)), `rasterize()` ([ADR-0001](0001-delta-rasterization.md)),
  the global timebase ([ADR-0002](0002-global-timebase.md)), uPlot rendering — against math simple
  enough to verify by hand. This de-risks the foundation **before** Tab 2 adds the genuinely hard
  pieces (regularized deconvolution + STA + the four-check scoring + per-ROI execution).
- **Tab 2 second — because it is the real research need.** Once the spine is proven, regularized
  deconvolution ([ADR-0004](0004-tab2-deconvolution-method.md)) plus its STA partner
  ([ADR-0005](0005-tab2-sta-validation-partner.md)) is the only genuinely new piece, so it gets
  built as early as the de-risking allows — not deferred behind Tab 3.
- **Tab 3 last.** Naive spike inference is the least important tab — an honest "watch it fail"
  illustration (`FOUNDATIONS.md` §2), not a recommended workflow. It comes last.

**Tab 1's kernel library includes the calcium-indicator kernel (`tau_rise` / `tau_decay`) from the
start**, so the tool is immediately relevant to the calcium use case rather than purely abstract,
and so the calcium shape is exercised through the simple forward path before Tab 2 must recover it.

### Within Tab 1: math before animation

The non-visual core (data model, `rasterize()`, kernel library, linear convolution, basic uPlot
rendering) is built and verified **first**. The slide-and-multiply Canvas animation
(`FOUNDATIONS.md` §7) — the iteration sink — comes **after** the numbers are proven correct.

## Consequences

**Pros**

- The load-bearing foundation is validated against hand-checkable math before the hard solver
  depends on it.
- The flagship (Tab 2) is reached as soon as the spine is proven — not deferred behind a
  low-value tab.
- The calcium kernel is present from the first tab, keeping the tool grounded in its real use case.

**Cons**

- Slightly breaks the pure pedagogical narrative (1 → 3 → 2). Acceptable: tab *order in the UI* is
  independent of *build order*, and Tab 2's research value outweighs finishing the teaching arc first.

**Scope**

- This is a sequencing/process decision. It does not change any settled foundation; it orders the
  work that implements them. Tab roles and priority remain as in `FOUNDATIONS.md` §2.
