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

## Update log

Re-vendors are recorded here rather than by editing the Decision above — the original stamp is
part of the historical record.

### 2026-08-06 — re-vendored `4a92748` → `ceb1c82`; the predicted cost had materialized

The "Negative / cost" line above ("updates are a manual re-vendor") turned out to understate the
failure mode. The cost is not the *effort* of re-copying; it is that **nothing announces when a
copy has gone stale.** This repo sat on `4a92748` — the original v1 — for **17 days and 13
upstream commits**, missing every rule landed in that window: the slide-overlap check, the
figure-craft axis-limits (x & y) / show-both-views / show-the-actual-data rules, and the whole
2026-07-29 proposal (8 rules including role 11, "all roles are mandatory", blind re-review). A
murderboard run in that window would have reported clean coverage it did not have.

Two things changed to stop it recurring, both now vendored:

- **`tools/murderboard_freshness.sh`** — compares this repo's stamp against upstream HEAD
  (0 current · 1 stale · 2 unknown, never a false "current"), wired into `SessionStart` in
  `.claude/settings.json` as a **second, layered hook entry** so the vendored
  `.claude/hooks/session-start.sh` core stays byte-identical and re-copyable. Silent when
  current.
- **`tools/murderboard_roster.sh`** — derives the role roster from `doc_review_process.md` and
  checks a finished review report accounts for every role, so a 7-of-11 run cannot read as a
  clean 11-of-11.

The vendored set therefore grows from two files to five: the process doc, the lit tool, the two
gates, and **`.claude/skills/murderboard/SKILL.md`** — the `/murderboard` call-up, which sequences
the review so it cannot be half-executed. The "do not edit in place" contract applies to all five.

⚠ **Separately still stale, not addressed here:** `.claude/hooks/session-start.sh` and
`docs/session_protocol.md` are vendored from `interface2 @ 46da2c3` / `@ 7065f5e`, and interface2
has since landed the hook's deadline discipline (`2a0c299`) plus the ADR-0020 board split
(`7717ac3`). That is a different upstream and a separate re-vendor.

### 2026-08-22 — murderboard is public; the session-protocol upstream moved into it

Two corrections to the Decision above, and one item from the 2026-08-06 ⚠ is now actionable.

**1. `syncytium2/murderboard` is no longer private.** It went public on 2026-08-21 under
**Apache-2.0**. The Decision above describes it as "(private)"; that is now wrong, and it is
left in place because the original record is the point of this log. Practical consequence: the
upstream is now a URL anyone can open, so the vendoring instructions and the provenance stamps
resolve for readers outside this account.

**2. The ⚠ at the foot of the 2026-08-06 entry is resolvable, and its diagnosis changed.**
That entry recorded `.claude/hooks/session-start.sh` and `docs/session_protocol.md` as vendored
from `interface2` — currently `@ 0303691` here — and treated the fix as "a different upstream
and a separate re-vendor."

The deeper problem was not staleness. `interface2` is private and on GitLab, so
`murderboard_freshness.sh` **could never answer anything but `2` (unknown)** for those two
files. The gate this repo installed to stop silent drift was structurally unable to fire on
them. A gate that cannot report is the failure mode the 2026-08-06 entry was written about,
one level up.

Murderboard adopted both files as **canonical** on 2026-08-21, precisely so the pointer would
resolve for public consumers. So the fix is no longer "re-vendor from interface2 when you can
reach it" — it is:

- re-vendor `docs/session_protocol.md` and `.claude/hooks/session-start.sh` from
  `syncytium2/murderboard`, stamping `vendored from syncytium2/murderboard @ <short-sha>`;
- add a second `SessionStart` freshness entry for them:

  ```
  bash tools/murderboard_freshness.sh --hook --label session-protocol \
       --slug syncytium2/murderboard \
       --file docs/session_protocol.md --file .claude/hooks/session-start.sh
  ```

That gate can then return `0`/`1` for the first time since it was installed.

**3. The review substance here is current; only the pair above is behind.** Between this repo's
stamp (`729fb06`) and murderboard `f26414a` there are **no changes to `doc_review_process.md`
or `SKILL.md`** — no rules are missing and no murderboard run in this window under-covered.
What changed upstream is the session-protocol pair, the two hooks' provenance headers, and the
addition of CI. A re-vendor of the five-file set is therefore optional and low-value right now;
the pair in item 2 is the one worth doing.

**Not changed by any of this:** the "do not edit vendored copies in place" contract, the
adoption reasoning in the Decision, or anything about `data/` and `darkroom/`.
