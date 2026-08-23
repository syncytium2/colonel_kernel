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

### 2026-08-23 — murderboard is public; the session-protocol gate answered from one laptop

Two corrections to the Decision above, and one item from the 2026-08-06 ⚠ is now actionable.

**1. `syncytium2/murderboard` is no longer private.** It went public on 2026-08-21 under
**Apache-2.0**. The Decision above describes it as "(private)"; that is now wrong, and it is
left in place because the original record is the point of this log. Practical consequence: the
upstream is now a URL anyone can open, so the vendoring instructions and the provenance stamps
resolve for readers outside this account.

**2. The ⚠ at the foot of the 2026-08-06 entry is resolvable, and its diagnosis changed.**
That entry recorded `.claude/hooks/session-start.sh` and `docs/session_protocol.md` as vendored
from `interface2` — `@ 0303691` here — and treated the fix as "a different upstream and a
separate re-vendor."

> **Correction, 2026-08-23.** A first draft of this entry claimed the gate "could never answer
> anything but `2` (unknown)" for those two files, and that the fix was to *add* a second
> `SessionStart` entry. Both were wrong, and both were checkable in under a minute. The entry
> is corrected rather than reworded, because an ADR that records a plausible diagnosis nobody
> ran is the same defect it is describing.

The second `SessionStart` entry **already existed** — it has been in `.claude/settings.json`
since the gate was installed, configured as `--slug defazio/interface2` with two `--clone`
fallbacks to local checkouts. And the gate **does** fire. Run here, it says:

```
--- !! SESSION-PROTOCOL IS STALE — re-vendor before relying on it ---
   vendored: 0303691   upstream: c711e73   (via local-clone)
```

The real defect is narrower and worse-shaped than "cannot fire". That verdict was resolvable
**only from a private working copy that happens to sit on this laptop**. On CI, on a fresh
clone, on a collaborator's machine, in a cloud session — no local `interface2`, no route to a
private GitLab repo, so the answer degrades to `2`, and in `--hook` mode (which must never
touch the network, by design) `2` means **silent**. The gate was green-or-red for exactly one
person and mute for everyone else, which is the *distribution* of the failure the 2026-08-06
entry was about, not its absence. Compounding it: what the stamp was compared against was that
working copy's `HEAD` — whatever happened to be checked out — not a published ref.

Murderboard adopted both files as **canonical** on 2026-08-21, precisely so the pointer would
resolve for public consumers. **Applied in this change:**

- re-vendored `docs/session_protocol.md` and `.claude/hooks/session-start.sh` from
  `syncytium2/murderboard @ fae0eca`, stamped accordingly. Apart from the stamp line, both
  files are byte-identical to upstream. The hook changed only in its header; the protocol doc
  drops `interface2`'s own orphaned-pointer backlog and corrects the companion-hook path,
  neither of which was ever true for this repo.

  Both copies also carry the upstream **correction** described in item 2 — murderboard's own
  canonical text had repeated the "could never fire" claim, and it was fixed there
  ([murderboard#28](https://github.com/syncytium2/murderboard/pull/28)) rather than only here.
  That is the reason to re-vendor rather than hand-patch: the wrong sentence had already
  travelled from a private repo into this one, and correcting it downstream would have left
  the next consumer to inherit it again;
- **repointed** the existing `SessionStart` entry at the public upstream and deleted the
  `--clone` crutch, so the answer no longer depends on whose machine is asking:

  ```
  bash tools/murderboard_freshness.sh --hook --label session-protocol \
       --slug syncytium2/murderboard \
       --file docs/session_protocol.md --file .claude/hooks/session-start.sh
  ```

Verified after the change — `session-protocol: current (@ fae0eca, via remote)`. **`via
remote`** is the load-bearing word: the upstream resolved from a published ref for the first
time since this gate was installed. That it can still go red is not taken on faith either;
`murderboard_freshness.sh --selftest` passes all 18 checks here, the first of which is
`stale stamp FIRES`.

⚠ **`.claude/settings.json` is `skip-worktree` here, and that nearly ate this fix.** The first
attempt at the repoint edited the working tree, `git status` reported clean, `git add -A` added
nothing, and the commit went out without it. The bit is an *index* flag, not a shared property:
a fresh clone and CI materialize the **committed** blob, so a working-tree edit fixes the gate
for the person who made it and nobody else — the same shape as the defect above, one level
down, in the file that configures it. Two consequences worth keeping: the fix must be
**committed** to reach anyone, and **an existing checkout will not receive it on merge** —
apply it by hand there, or clear the bit locally first.

⚠ **Expect this pair to re-flag on the next murderboard commit — observed, not predicted.** The
gate compares the stamp against the upstream repo's `HEAD`, not against the history of the
watched files, so *any* commit upstream marks every consumer stale. It happened twice while this
change was being written: a stamp at `a24153f` went red the moment murderboard#27 landed, and
that PR touched nothing but `fetch_paper.py`.

That is item 3 below, restated as a mechanism. The alert means **"you are behind"**, never
**"you are missing a rule"**, and telling those apart is a judgment call the gate deliberately
leaves to a human. The cost of the design is this noise; the benefit is that it cannot report a
false *current*, which is the failure that cost this repo 17 days in the 2026-08-06 entry. Given
the choice, noisy-and-honest is the right side to err on — but do not let the noise train anyone
to skim past the alert, because that converts it back into a gate nobody reads.

**3. The review substance here is current; only the pair above is behind.** Between this repo's
stamp (`729fb06`) and murderboard `f26414a` there are **no changes to `doc_review_process.md`
or `SKILL.md`** — no rules are missing and no murderboard run in this window under-covered.
What changed upstream is the session-protocol pair, the two hooks' provenance headers, and the
addition of CI. A re-vendor of the five-file set is therefore optional and low-value right now;
the pair in item 2 was the one worth doing, and is done.

I would rather state that explicitly than let "you are two commits behind" imply a coverage gap
that does not exist. The freshness gate cannot make that distinction — see the ⚠ in item 2 —
so someone has to, and the place to record the answer is here.

**Not changed by any of this:** the "do not edit vendored copies in place" contract, the
adoption reasoning in the Decision, or anything about `data/` and `darkroom/`.
