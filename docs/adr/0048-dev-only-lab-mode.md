# ADR-0048: A dev-only lab mode for loading local recordings

## Status

Accepted. Adds a development affordance and a deploy gate. Changes **nothing** in the shipped
artifact — that is the whole design, and `scripts/lab-check.sh` asserts it mechanically.
Relates to FOUNDATIONS §6 (privacy / no runtime egress) and to the repo data-hygiene rule.

## Context

Tab 2's only route to a recording is the file dialog or a drop. That is right for the app's
audience — a researcher arrives with one recording and loads it once — but wrong for the
author, who iterates across 66 exported CSVs in `exports/` and pays the dialog every time.

The obvious asks were "a private second app" or "a secret mode in the public one." Both are
worse than they look, for a reason specific to this project: the shipped bundle carries
`connect-src 'none'` (ADR-0008). **A deployed Colonel Kernel cannot fetch anything at
runtime** — that is why the Tab 0 dates are baked at build time rather than read from an API.
So a hidden mode in the public app could not reach a local folder even once unlocked; it
would ship dead code whose only effect is to enlarge the artifact that FOUNDATIONS §6 asks
people to be *able to audit*. And a second hosted app does not get closer to the folder
either: to read `exports/` it must run on this machine, which is `npm run dev` — the option
below, with an extra artifact and an extra URL to keep in sync.

The repo-hygiene rule already keeps `exports/` and `data/` out of version control. The
remaining risk is not the data but the **names**: 66 filenames encoding recording dates and
drug conditions are themselves unpublished information, and a leaked picker would ship them
as a string table.

## Decision

A lab mode that exists **only when the dev server is running**, gated twice over.

- **Server half** — `labRecordingsOnServe()` in `vite.config.js`, `apply: 'serve'`. Two
  endpoints (`/__lab/recordings`, `/__lab/file`) that list and read `exports/`. Never
  constructed during a build. Files are served **by basename, out of the listing** — user
  input is never joined onto a path, so `?name=../../.env` 404s instead of walking out of
  the repo.
- **Browser half** — `src/lib/LabPicker.svelte`, reached *only* through a dynamic import
  behind `import.meta.env.DEV` in `Tab2.svelte`. Vite substitutes that to `false` at build
  time, so the branch is dead code, and since it is the sole reference to the component,
  Rollup emits no chunk for it at all.
- **The gate** — `npm run lab-check` (`scripts/lab-check.sh`) greps `dist/` for the
  distinctive markers and fails if any survives. Wired into `scripts/deploy.sh` beside the
  CSP check.

The picker hands its file to Tab 2's existing `handleFiles`, as a real `File`. It is a
shortcut to the dialog, **not** a shortcut around the loader — a second ingest path would be
free to drift from the one users actually exercise.

The control is styled deliberately unlike the rest of the rail (dashed, hatched, `LAB` tag):
it does not exist in the app real users get and should never be mistaken for something that
does.

## Consequences

**Good.** Iteration across the local corpus costs one dropdown. The public artifact is
byte-for-byte what it was; no new runtime surface, no CSP change, no new dependency. A clone
without an `exports/` folder degrades to a quiet "no exports/ folder here" rather than an
error. The gate makes the guarantee checkable instead of remembered.

**The cost.** A second code path in Tab 2 that CI never renders and users never see, so it
can rot without anyone noticing. It is small and it exercises the ordinary loader, which
bounds the damage.

**The failure mode to watch.** Both gates fail *silently*: a static import of `LabPicker`
anywhere, or moving the endpoints out of a serve-only plugin, still builds, still runs, and
still deploys — it just quietly ships the folder's contents-listing. `lab-check.sh` exists
because "we did not add anything third-party, therefore §6 holds" is exactly the reasoning
the Cloudflare beacon disproved: for over a week the edge injected a script we never wrote,
UA-gated so `curl` could not see it. Assert privacy properties; do not infer them.

**What this deliberately does not do.** It does not help a researcher who is not the author.
If the goal ever becomes "let anyone point the app at their data folder," the answer is the
File System Access API (`showDirectoryPicker()`) — not a network request, so the CSP permits
it, and nothing leaves the machine. That is a *public* feature and a separate decision;
note that persisting the directory handle would land in IndexedDB and brush against §6's
"no persistent storage of user data," so it would need to be session-only or explicitly
opt-in. Chromium-only either way.
