# ADR-0054: A lab-only page hosts dedicated spike inference (jsMLspike) for human review

## Status

Accepted (Tony, 2026-11-19: *"yes for now"*; recorded in jsMLspike
`docs/adr/2026-11-19-22c5-the-review-page-lives-in-colonel-kernel-as-a-lab-only-page-w.md`).
Amends the boundary in FOUNDATIONS §2, "Future direction: spike-inference companion app", **for
the lab-only pages only**. The public app's boundary is unchanged. Extends
[ADR-0048](0048-dev-only-lab-mode.md) and [ADR-0053](0053-lab-only-raw-fluorescence-page.md).
Changes nothing in the shipped artifact, and `npm run lab-check` asserts that.

Not murderboarded. No page has been built yet; this records where it goes and under what gates.

## Context

FOUNDATIONS §2 keeps dedicated spike inference out of this app: Colonel Kernel is a skeptic that
has the spikes and tests whether coupling holds, while inference tools are believers that assume
the coupling and infer the spikes. Merging them would blur the assumption this app interrogates.

The lab now needs to **review inferred events by eye**. jsMLspike (`syncytium2/jsMLspike`,
private) is a JavaScript port of MLspike (Deneux et al. 2016), checked unit by unit against the
MATLAB original, with additions built for human review: per-unit evidence of how poorly
determined each kernel is, suggestions a person chooses from, and a reviewer-chosen order. Its
review page needs a home with a trace viewer, the lab's loaders for interface2 exports and cerebro
spike files, and a development-only gate. This repository's `#lab` page has all three.

Two constraints decide the shape:

- **The licence.** The MATLAB original carries no licence. Its author has permitted the port to be
  published with credit, but the licence is not yet settled (jsMLspike `PERMISSION.md`). Until it
  is, no jsMLspike code may ship in a public artifact, and none may be committed to this public
  repository.
- **The skeptic stance.** The public app's teaching role, and its argument that inference is a
  different question, are unchanged by a lab tool.

## Decision

1. **A second lab-only page hosts jsMLspike's review page,** reached exactly as `#lab` is
   (ADR-0053): a dynamic import behind `import.meta.env.DEV` in `App.svelte`, data from
   endpoints on the serve-only Vite plugin, and nothing reachable from a production build.
2. **jsMLspike is the engine, imported as a package.** The page contains no inference code. It
   reads jsMLspike result files (`jsmlspike-result/1`) and runs jsMLspike in a Web Worker for a
   reviewer's "try this kernel" rerun. No jsMLspike source is copied into this repository.
3. **The dependency is development-only and pinned.** It is never needed by `npm run build` of
   the public app. How it is fetched is recorded in the page's own documentation, not here, so it
   can change without amending this record.
4. **`lab-check` extends to it,** failing the build if any jsMLspike marker reaches `dist/`.
5. **The public app is unchanged.** Tab 3 keeps its naive inference; no jsMLspike reaches it
   until the licence is settled, and then only by a new ADR.
6. **"For now."** The engine side of jsMLspike is framework-free, so the page can move to another
   home without changing jsMLspike.

## Consequences

**The boundary now reads:** dedicated spike inference is out of scope for the public app, and
present in a lab-only page for the lab's own review. FOUNDATIONS §2 carries a dated pointer to this
record.

**What the gates must prove.** The failure mode of ADR-0048 applies again, with a higher cost: a
static import of the review page would ship jsMLspike in the public bundle, publishing code whose
licence is not settled. `lab-check` is the only thing that would notice.

**Repository visibility.** This repository is public, so its branches are public. A branch that
names the private jsMLspike repository in a dependency specifier reveals that name and a commit
hash, and nothing else; no jsMLspike source is committed here.

**What this does not decide.** Whether jsMLspike ever appears in the public app; the review page's
layout and its open questions, which wait on Tony; and whether `#lab` and the review page share
one page or stay two.
