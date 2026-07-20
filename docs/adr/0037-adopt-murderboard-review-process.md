# ADR-0037: Adopt the murderboard — vendored anti-slop review process + lit tool

## Status

Proposed. Adds a review *process* and a dev-time tool; changes no app code, no build, no
deploy, and no runtime behavior. Relates to FOUNDATIONS §6 (privacy / no runtime egress) only
to confirm it is **not** touched.

## Context

This repo produces a steady stream of **document deliverables** — ADRs, `FOUNDATIONS.md`
edits, methods write-ups, figure captions, handoffs. Those are exactly where "slop" accrues:
a number that disagrees with the run it summarizes, a citation written from memory, a count
that contradicts itself across sections, a caption that overclaims. The repo already feels
this class of failure — the `NEXT_SESSION.md` doc-rot lesson (three contradictory "RESUME
HERE" pointers) is the same disease in a different file.

A review harness for this already existed, but it lived buried inside a sibling project
(`interface2`, on GitLab) as three coupled files, so it could not be shared without copying a
project-specific version. It has now been **extracted and generalized into its own repo**,
`syncytium2/murderboard` (private), as two project-neutral files:

- `doc_review_process.md` — a team of adversarial reviewer roles (claim/data verifier,
  citation validator, consistency auditor, hostile peer reviewer, line editor, methods
  expert, reuse auditor) run before a deliverable ships.
- `fetch_paper.py` — an open-access paper fetcher/cacher the reviewers use to check a claim
  against the real source instead of from memory (`--have` checks a local library first,
  `--need` flags what it can't reach).

## Decision

**Vendor** the two files into this repo and wire them in:

- `docs/doc_review_process.md` and `tools/fetch_paper.py`, copied verbatim from
  `syncytium2/murderboard @ 4a92748`, each carrying a provenance stamp on its first line.
- A `CLAUDE.md` rule ("Document deliverables — run the murderboard first") and a `Doc
  structure` pointer.
- **Do not edit the vendored copies in place** — update by re-copying from upstream and
  bumping the stamped commit. This keeps drift visible in a `git diff` and preserves one
  canonical source. Submodules were rejected: the manual re-copy is cheaper to live with than
  submodule mechanics, and a vendored copy keeps a fresh clone self-contained.
- `FOUNDATIONS.md` remains the source of truth; the murderboard is a *process* aid and never
  overrides it. A review finding that conflicts with FOUNDATIONS is surfaced, not applied.

## Consequences

- **Positive.** Document deliverables get an adversarial pass before a human's name is on
  them; reviewers can reach the actual source paper for a claim; the discipline is shared with
  the other consumers (`interface2`, `fireflies`) instead of re-invented per repo.
- **Privacy (§6) untouched.** `fetch_paper.py` is a **dev-time** reviewer aid, never imported
  by the app or included in the bundle, so it introduces no runtime network egress and does
  not weaken the CSP. It is Python (the app is JS) precisely because it is tooling, not app
  code; it adds **no npm dependency**.
- **Negative / cost.** Updates are a manual re-vendor (re-copy both files, bump the stamp).
  Accepted as the deliberate tradeoff for avoiding submodules.
- **Repo hygiene.** The tool touches no `data/` or `darkroom/` paths and commits no data.
