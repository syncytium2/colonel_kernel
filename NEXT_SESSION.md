# NEXT_SESSION

**Working state as of 2026-08-24.** Short by design. Read
[`FOUNDATIONS.md`](FOUNDATIONS.md) first (canonical), then this.

> **Rule for this file:** one dated state block, one next action, and a list of genuinely open
> items. When it stops matching `git log`, fix it or archive it. The version this replaces sat
> at 2026-08-10 and 382 lines while 44 commits landed — the exact drift the rule exists to
> stop. Its long tail is preserved verbatim in
> [`docs/archive/NEXT_SESSION-history-2026-08-24.md`](docs/archive/NEXT_SESSION-history-2026-08-24.md)
> (and the older one in `NEXT_SESSION-history-2026-07-08.md`) — background, **not** current state.

## Where things stand

**Default branch is now `main`, not `master`** (renamed in #15). The session-start hook and any
doc still saying "master" is stale — worth a sweep.

Live app is unchanged since `dcd16a5`; see [`DEPLOYED.md`](DEPLOYED.md). **Nothing from this
session is deployed.**

Branch **`lambda-explainer`** (pushed, not merged) carries two pieces of Tab 0 work:

- **λ is explained, and both sliders can reach it** (`7014c4a`). New Tab 0 section, plus a "?"
  beside each λ slider that opens it in a new browser tab. Murderboarded — 11 roles, 2 blind
  rounds — and the review inverted the draft's science: the failure modes it described are
  unreachable on the actual sliders, and λ has no grip on the artifacts the project flags first.
  Record: [`docs/reviews/tab0-lambda-section_2026-08-22.md`](docs/reviews/tab0-lambda-section_2026-08-22.md).
- **Tab 0 cut to its argument** (`c32a9fd`). 1,649 words / 5,234 px → 509 / 2,095, with the rest
  relocated into five collapsed folds. Murderboarded again — 11 roles, 1 blind round. Record:
  [`docs/reviews/tab0-start-here_2026-08-23.md`](docs/reviews/tab0-start-here_2026-08-23.md).

Both runs were **delivered unconverged** — blocking findings did not clearly fall between
rounds — so the residual lists in those two records are load-bearing, not decoration.

Also landed on `main` this session: two murderboard re-vendors (`5086eb0` → f26414a,
`1cbfa5b` → fae0eca). The gate fired at call-up both times; content was near-identical both
times, so no review rule was missed.

## ▶ Next action — Tony's call

**Decide whether `lambda-explainer` merges as-is, and what happens to the two claims it exposed
in canon.** The branch is self-consistent and tested, but the review found two things in
documents this branch does not own:

1. **`methods.html` §5 misdescribes MATLAB `deconvreg`** — "no exposed parameter … the smoothing
   happens silently" is false (`lrange` sets the multiplier, `regop` replaces the operator,
   `lagra` is returned). `FOUNDATIONS.md:407` repeats it as "silent Laplacian". The true
   statement is about the lab's own two-argument call site, not the function.
2. **`methods.html` eq. (4) writes the penalty as λ²; the solver computes λ.** Confirmed
   independently in four role-runs. Fixing the doc is one character; fixing the code
   recalibrates the slider range and the stability sweep. **This is a decision, not a typo.**

Tab 0 now links readers straight at both. Pick a resolution, or say "ship anyway and flag" —
but do not leave it implicit.

## Open items

**New this session**

- **⚠ The λ section still has no figure.** Flagged in every round of both runs. The write-up and
  a drawing brief — including what to avoid for a non-quant reader — are in
  [`docs/design/lambda-figure-brief.md`](docs/design/lambda-figure-brief.md). Not murderboarded.
- **The four-methods explainer's panels are drawings, not solver output.** Regenerated this
  session to fix its title/footer/axis labels and to say "illustrative" on its face, but making
  it *evidence* means computing the panels from the real recovery functions. Two smaller defects
  live in the same asset (the "rise" label is struck through by its curve; the dashed
  true-kernel reference is unlegended).
- **`premise-sim.js` re-derives production code** — its AP-independent stamping loop is a
  near-literal copy of the exported `apIndependentTrace()`, and `placeInQuietGaps` is a second
  onset-placement algorithm whose canonical sibling's docstring claims they are the same thing.
- **Mobile (≤380 px) defeats both Tab 0 figures** — the premise raster reads as a solid bar and
  the explainer's axis text lands at ~2.3 px.
- **No ADR** for the Tab 0 restructure, the fold contract, or the `#lambda` deep link.

**Carried forward (unchanged, detail in the archive)**

- **Needs a decision:** trace colour grammar app ⇄ summaries (app colours by region, summary
  PDFs by method); deploy model (still manual — auto-deploy on push to `main` undecided);
  prerender migration (recommendation was: not yet).
- **Dashboard actions only Tony can take:** Cloudflare **managed robots.txt is voiding the crawl
  policy on both zones** — turn it off per zone, then verify `curl -s <site>/robots.txt` returns
  our file as the whole response. Also: sitemap submission, GitHub profile README.
- **Four ranked app bugs** from the 2026-07-30 review, top three still open: a scored round can
  be rewritten after scoring (Tab 1's copy of this bug is fixed — ADR-0047 shows the shape);
  plot bands collapse 206 → 18 px at ≤900 px; toggling a challenge destroys a loaded recording;
  `#tab2` deep-link gives a blank tab.
- **Golden-path browser eval** — still TODO. Serve `dist/`, download the template, drop it into
  Tab 2, assert recovered τ / peak-lag within tolerance. Would also close the "deploy does not
  gate on console CSP violations" gap. Related: `App.svelte` has essentially no ARIA.
- **Haruspex debts** — no findable home for the human-identified kernel list; the unreconciled
  spike-count discrepancy (senktide vs baseline windows, most likely); the λ-stability sweep
  behind `a_robust`; the `dt = 0.100000000083` rounding nit.
- **The 780 s claim still stands in canon and in the citable document** despite the 2026-08-16
  correction.

## Conventions that bite

Unchanged — see the archive. The two worth repeating: **deploy only via `npm run deploy`** from
a full clone on the default branch, and **never commit anything under `data/` or `darkroom/`**.
