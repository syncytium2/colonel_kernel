# ADR-0054: What a session learns about conduct and about the machine is written in the repo

## Status

Proposed (2026-11-16). Number 0054 because ADR-0053 is taken on the unmerged branch
`claude/kernel-viewer-fluorescence-a68sg6`.

## Context

An assistant's private memory is not a project record. Other sessions cannot read it, whether
they run in the cloud, on another machine, or under another tool, and nothing reviews or
versions it. `FOUNDATIONS.md` §12 exists so that every session starts from one shared ground
truth. Tony, 2026-11-16: *"good luck with memory. we built foundations for this purpose."*

That day, two kinds of knowledge reached only one session's private memory:

1. **A conduct rule.** Asked whether four recordings were chosen for having kernels, a session
   said the patched cell would show a kernel "almost by construction", and called clear kernels
   "reassuring". Tony: *"please please please be very careful with your prejudice. next you'll
   tell me there should be no calcium events in the presence of TTX."* FOUNDATIONS already
   requires the *tool* to refuse to assume the kernel (§2: "refuses to assume the kernel"; §3:
   "is there a kernel, or isn't there?"). It does not say that a *session reporting results*
   must hold the same stance. Here the tool was neutral and the commentary on its output was not.
2. **Machine-local facts about 065** that cost time when a session did not know them:
   - The commands Tony pastes run in Windows PowerShell. Git Bash syntax failed.
   - Port 5173 is often held by cerebro's dev server, and other sessions start colonel_kernel
     dev servers from their own worktrees. A `colonel_kernel` server on 5180 was serving a
     detached checkout from before a fix, so the kernels on screen were the old ones.
   - The lab recordings are in `<Dropbox data root>/rawF_kernel_test/`.

## Decision

1. **Conduct goes in FOUNDATIONS §12**, as one bullet, once this ADR is accepted:

   > - **Report results without biological priors.** When describing what the tool or the data
   >   show, keep three things separate: what was observed, how the data were selected or
   >   filtered, and what is unknown. Never frame an outcome as expected, surprising or
   >   reassuring on biological grounds. Whether spikes and calcium are coupled, and how, is
   >   what this tool measures. It is not a premise for the commentary on its output.

2. **Machine-local facts go in `docs/LOCAL.md`**, one section per machine. Each fact is dated
   and comes with the command that re-checks it, because ports and paths change. `CLAUDE.md`
   points to it. It holds no data and no credentials, only where things are and how to reach
   them.

3. **Assistant memory may cache either kind, but is never the record.** A rule or fact that
   exists only in memory is not known to the project.

## Consequences

- Every session that reads FOUNDATIONS gets the conduct rule, including cloud sessions and
  sessions on other machines.
- `docs/LOCAL.md` will go stale. Pairing each fact with a check makes stale entries cheap to
  notice. A fact that has no check should not be recorded.
- The repository will contain machine paths. The handoffs already do; nothing in them is data.
