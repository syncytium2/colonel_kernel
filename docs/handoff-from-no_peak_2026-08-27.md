# Handoff from no_peak — CITATION.cff, and the Zenodo DOI question

**Written 2026-08-27 from `syncytium2/no_peak`, against this repo at `1cbfa5b`.**
Nothing here has been changed by it. This is a request with the groundwork
already checked, not a change. Reply by appending to this file rather than
starting a second document.

## Where the ask came from

External advice reviewed in `no_peak` on 2026-08-27 proposed two things across
the estate: wire `no_peak`'s tests into CI, and add `CITATION.cff` to the two
repos lacking one (`no_peak` and this one), then connect Zenodo here and cut a
release to mint a DOI. The `no_peak` half is done — see below.

The advice described a Zenodo DOI as an *outstanding goal* for this repo.
**It is not recorded anywhere here.** `grep -ri zenodo` over this tree returns
nothing at all. Treat the goal as proposed, not as previously agreed.

## What is verified

- No `CITATION.cff` in this repo. `bugarach` and `murderboard` both have one,
  and `no_peak` now does.
- No DOI, and the README says so out loud at `README.md:206`: *"There is no
  preprint or DOI yet, so cite the tool by URL and commit."*
- **A Zenodo account already exists and is already wired to `syncytium2`.**
  `murderboard` carries a minted concept DOI, `10.5281/zenodo.22063835`, with
  v0.1.0 at `…836`, a badge in its README and a `.zenodo.json` at its root. So
  *registering* with Zenodo is not a step here. Find the account that minted
  that DOI and enable this repository inside it. A second account would split
  the estate's DOIs across two owners, and that is not quietly reversible. The
  advice named an email address to register with; that call was already made
  when `murderboard` was deposited, and whatever address it used is the one to
  keep.
- This repo is MIT (`LICENSE`, and the README's License section) and public.

## The prerequisite, which is small

Copy `murderboard`'s pair, both at the repo root:

- **`CITATION.cff`** — `cff-version: 1.2.0`, `type: software`, `message`,
  `authors`, `license: MIT`, `repository-code`, `abstract`, `keywords`.
  GitHub's *Cite this repository* button reads it with no DOI involved, so this
  file is worth landing on its own even if the DOI question stays open.
- **`.zenodo.json`** — the deposit metadata Zenodo reads when it mints.
  `murderboard`'s is a faithful model: `title`, an HTML `description`,
  `upload_type: software`, `license`, `creators`, `keywords`,
  `related_identifiers`.

Then enable this repository in Zenodo's GitHub settings and cut a GitHub
Release. Zenodo mints a concept DOI and a per-version DOI off the release
webhook. **No workflow file is involved** — `murderboard` has none for this.
Afterwards the badge goes in the README and the citing paragraph is rewritten.

## Three decisions that are the owner's, not the next session's

### 1. "Not versioned for release" and a DOI are in direct conflict

`README.md:200-207` states the tool is *"**Not peer reviewed, and not versioned
for release**"*. A Zenodo DOI is minted **per release**; there is no route to
one that does not cut a version tag. Minting therefore moves at least three
things, and they have to move together or the repo contradicts itself:

1. that status sentence,
2. the *"no preprint or DOI yet, cite by URL and commit"* sentence under it,
3. the suggested citation form on the live `/methods` page, which is served out
   of this repo and which the README sends readers to.

Deciding to mint a DOI is deciding to start versioning this tool. That is the
decision, and it is bigger than the file it starts with.

### 2. The authorship statement at the top of the README

This README opens with an explicit one: *"The ideas, decisions, and review here
are mine; the code is Claude's."* `bugarach` and `murderboard` each list a
single human creator in their citation metadata. Whatever `creators:` says here
must not read as a contradiction of that paragraph. The siblings' answer is
available to copy, but it was not made in the presence of a statement like this
one, so it is worth making deliberately rather than inheriting.

### 3. One name form, and one ORCID decision, across all four repos

They disagree today:

| Repo | Name as recorded | ORCID |
| --- | --- | --- |
| `bugarach` | `CITATION.cff`: `given-names: Richard` | absent |
| `murderboard` | `CITATION.cff`: `given-names: Tony`; `.zenodo.json`: `"DeFazio, Tony"` | omitted **on purpose**, with a comment |
| `no_peak` | `CITATION.cff`: `given-names: Richard` (matches its `LICENSE`, "Richard Anthony DeFazio") | absent |
| `colonel_kernel` | — | — |

`murderboard`'s comment says to add the ORCID in `CITATION.cff` and
`.zenodo.json` together if it is ever wanted, so the two agree. A DOI makes the
name form permanent and public and pushes it into everyone else's reference
lists, so settle this **before** minting rather than after. It is one decision
for the estate, not four.

## What was done on the no_peak side, for symmetry

- `CITATION.cff`, with the CLUSTER method paper as a structured `references:`
  entry and a `message:` saying plainly that CLUSTER is not that project's
  algorithm. Deliberately **no** `version:` or `date-released:` — there is no
  release, and a version field there would be a second hand-maintained copy of
  `package.json`'s.
- `.nvmrc` and `.github/workflows/unit.yml`.

One point from that work may be worth borrowing. The workflow is named **"unit
tests"**, not "CI", because 87 of `no_peak`'s 231 tests compare the port against
reference implementations using data that is not distributable: on a runner they
auto-skip, and 144 tests collect instead of 231. A badge reading "CI" over a run
that never checks the thing the repo exists to claim manufactures exactly the
confidence it was added to earn. If CI ever lands here, name the badge for what
it actually covers. As it stands this repo's only workflow, `dep-freshness.yml`,
is a scheduled dependency check and runs no tests at all.

## What this handoff does not do

No files added here, nothing enabled, no account touched, no tag cut. Two of
the four steps — the Zenodo account and the release — are the owner's alone.
