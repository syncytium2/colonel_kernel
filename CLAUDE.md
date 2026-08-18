# CLAUDE.md

**Read `FOUNDATIONS.md` first — it is the canonical source of truth for this project.** If anything in a conversation or request conflicts with it, flag the conflict rather than silently diverging.

## What this is

`colonel_kernel` — a client-side 1D convolution / deconvolution tool: a teaching demonstrator and a ground-truth kernel-verification instrument for calcium imaging. See `FOUNDATIONS.md` for the full picture (the three tabs, the flagship Tab 2, the multi-ROI phenomenon).

## Stack

- **Vite** — build / bundler (static output, self-hosts everything)
- **Svelte** — UI / reactivity
- **fft.js** — FFT for deconvolution (pure JS, dependency-free)
- **uPlot** — line/stem plotting (~40KB, self-hosted)
- **papaparse** — CSV parsing (self-hosted)

Convolution is hand-written; the Tab 1 slide-and-multiply animation is hand-drawn Canvas. Fonts: system font stack only — no web fonts.

## Dev commands

- `npm run dev` — start the dev server
- `npm run build` — produce the static production bundle
- `npm run preview` — serve the built bundle locally

## Privacy rule (non-negotiable — FOUNDATIONS §6)

Researchers' unpublished data must never leave their machine.

- **No third-party requests.** No CDNs, no Google Fonts, no analytics, no error-reporting SaaS. Bundle every library, font, and asset locally.
- **No backend.** All computation (convolution, FFT, deconvolution) runs client-side.
- **Strict CSP, in from day one:** `connect-src 'none'; default-src 'self'` — a `<meta http-equiv="Content-Security-Policy">` tag injected into the **built** `index.html` at build time (Vite plugin in `vite.config.js`; see ADR-0008) so it holds on any static host. The source `index.html` carries no CSP so the dev server (HMR) works; the shipped artifact is fully locked down. Run the verification ritual against the built/deployed artifact, not the dev server.
- **No persistent storage of user data** beyond explicit, user-controlled file open / download.
- **Verification ritual:** after deploy, DevTools → Network → reload → confirm only same-origin requests.

Never add analytics, telemetry, CDN links, or third-party fonts at any point.

**The host can inject third-party scripts we never wrote.** Cloudflare Web Analytics silently
injected its beacon into our HTML at the edge for over a week. The CSP blocked it, so no data
ever left — but "we added no third-party code" is not sufficient to guarantee §6. Two defenses
are in place: `public/_headers` sets `no-transform` on the HTML routes (Cloudflare cannot rewrite
a response it may not transform), and `npm run deploy` fails if a beacon appears on `/` or
`/methods`. That injection was **user-agent gated** — a plain `curl` saw clean HTML while real
browsers got the script. When checking for third-party requests, ask as a browser
(`npm run screenshot` against the live URL, or `curl -H 'User-Agent: Mozilla/5.0 …'`).

## Repository data hygiene (non-negotiable)

The privacy rule above governs the running app. This governs the repository itself:
researchers' unpublished data must never be committed.

- **Never commit raw data.** `.mat` fixtures and any raw recordings stay local.
  `data/*.mat` is gitignored; keep it that way. Verify with `git check-ignore`
  before adding anything under `data/`.
- **Never commit scratch figures or analysis byproducts.** `darkroom/` (rendered
  figures, scratch scripts, venvs) is gitignored. Keep it that way.
- **Derived figures are the ONE allowed exception, and only deliberately.** A
  rendered plot derived from unpublished data may be committed ONLY to `docs/img/`,
  ONLY with the author's explicit consent, and ONLY when marked as intentional in
  `docs/img/README.txt`. `docs/img/roi1_trace.png` is the existing precedent. A
  derived figure is a plot, never raw or near-raw data (no full traces as CSV/JSON,
  no per-sample dumps).
- **As of 2026-07-31 the app ships NO unpublished data at all.** Tab 0's premise figure is
  now **simulated** (`src/lib/core/premise-sim.js`) — AP-linked calcium summing linearly
  from clusters of 1–5 spikes, plus three calcium events with no spikes beneath them. It
  models the phenomenon rather than reproducing a recording, so the consent question
  disappears and the figure can be zoomed, shipped as per-sample data, or made interactive
  freely.
  The route here is worth knowing: a live zoomable version of the *real* figure was built
  on 2026-07-30 and reverted the same day, because it meant publishing the recording from a
  public URL. Simulating the phenomenon got the capability without the cost. **Reach for
  that first** — when a figure needs to be richer than a static plot, model it before
  considering whether to publish the data. The real ROI-1 figure is retained in `docs/img/`
  as internal evidence and is no longer bundled.
- **Before any push, confirm no `data/` or `darkroom/` content is staged or tracked**
  (`git ls-files data/ darkroom/` must be empty) and that the only tracked binaries
  under `docs/img/` are consented figures.
- **Repo visibility is not a license to relax this.** Even on a private remote, raw
  data stays out — privacy posture shouldn't depend on a settings toggle.

Keep the FOUNDATIONS §6 privacy rule and this repo-hygiene rule distinct: §6 / the
app-privacy section is about runtime (CSP, no third-party requests); this is about
version control. Don't conflate them.

## Doc structure

- **`FOUNDATIONS.md`** — settled foundations and the reasoning behind them. Read first every session. Not a task list. This file wins until deliberately edited.
- **ADRs** — record individual decisions and changes. When an ADR changes a settled point, update `FOUNDATIONS.md` to match so the two never disagree.
- **`NEXT_SESSION.md`** — the immediate working state and next actions. **Keep it short:** one
  dated state block, one next action, and the open items. When it stops matching `git log`,
  fix it or archive it. A 900-line version of this file once drifted 28 commits behind and
  accumulated three contradictory "RESUME HERE" pointers, so parallel sessions each picked a
  different stale one and proceeded confidently. Superseded history goes to `docs/archive/`
  and is background only — never current state.
- **`DEPLOYED.md`** — what is actually live (commit, bundle hash, worker version). Written by
  `npm run deploy`; never edit by hand. Before assuming the deployed app is stale, read it.
- **`docs/doc_review_process.md`** — the **murderboard**: the anti-slop review process any
  document deliverable runs through before delivery. Call it up with **`/murderboard`**
  (`.claude/skills/murderboard/`); the two gates are `tools/murderboard_freshness.sh` (is this
  copy current?) and `tools/murderboard_roster.sh` (did every role leave a trace?). All five
  files are vendored from `syncytium2/murderboard` (see ADR-0037); do not edit the vendored
  copies — update by re-copying upstream.
- **Cross-project practice** — `<Dropbox>/Richard DeFazio/team_webapp_practice/`. Lessons that
  apply to more than one of my web apps (this one and `fireflies`), so a fix found here isn't
  rediscovered there. Distinct from the `team_colonel_kernel/` data bus: no contract, no
  fixtures, just portable practice. **Mirror, not master** — a lesson's canonical home is this
  repo; that folder holds a distillation. When you learn something here that would still be true
  in a repo with none of this science, add it there too.
- **Reaching the MATLAB / interface2 team (don't go looking for a channel — this is it).**
  Append one dated entry, newest on top, to `status/app_team.md` in the bus at
  `~/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/`
  (NOT `~/Dropbox`; a `~/Dropbox*/` glob misses it). We are the sole writer of that file and
  they are the sole writer of `status/matlab_team.md` — never edit theirs, request the change
  in ours (`PROTOCOL.md` rule 1). Bump `Last updated:`, claim the write on the session board
  first, and run `./check.sh` after (it scans for Dropbox conflicted copies). This is also the
  channel for **non-data** matters — tooling, vendored hooks — because there is no other one:
  interface2 is on **GitLab** and this repo on **GitHub**, so no shared issues or PRs exist,
  and the buses are pairwise (`team_major_coincidence/` is interface2 ↔ `fireflies`). Their
  side reads the bus at session start, so an already-active session on another machine won't
  see it until Tony relays it — that lag is expected, not a reason to invent a new channel.

## Deploying (non-negotiable)

**Deploy only via `npm run deploy`**, from a **full clone** on **`master`** with a clean tree.
The script is the runbook — it gates on those preconditions, runs the tests, builds clean,
verifies the CSP is in the shipped HTML, checks the Tab 0 "Born" date was baked from the true
root commit, deploys, polls past Cloudflare's edge cache until both URLs serve the new bundle,
and records the result in `DEPLOYED.md`. `npm run deploy -- --dry-run` does everything but upload.

Do not hand-roll `npm run build && npx wrangler deploy`. Improvised deploys are what put a
wrong Tab 0 "Born" date into production on 2026-07-16: the build ran in a shallow clone, where
`git log --max-parents=0` returns HEAD instead of the root commit. `vite.config.js` now refuses
to build from a shallow clone at all.

Two things that look like failures but are not: `wrangler` printing "No updated asset files to
upload" is benign, and the live `index.html` can serve a stale copy from Cloudflare's edge cache
for up to ~a minute after upload — the script polls through both.

## Document deliverables — run the murderboard first (anti-slop)

When asked for a **document** deliverable — a methods/spec write-up, an explainer, a report,
a figure **or its caption**, or a human-facing handoff — do **not** hand over a first draft.
Draft it, then **call up the murderboard: `/murderboard <artifact>`**
([`.claude/skills/murderboard/`](.claude/skills/murderboard/SKILL.md)). It runs the review team
in [`docs/doc_review_process.md`](docs/doc_review_process.md), applies the fixes, re-reviews the
repaired artifact, and delivers the corrected document **plus a summary and a role ledger**
naming any residual `⚠` flags. A deliverable with unresolved `⚠` is not "done."

**Use the skill rather than working from the file by hand.** The process doc stays the authority
on *what* each role checks, but four things only fire reliably through the skill, and each fails
**silently** when skipped:
- **Freshness is gated at the moment of review** (`tools/murderboard_freshness.sh --refresh`);
  **exit 1 = STOP and re-vendor.** This repo sat 13 commits and 17 days behind upstream with
  nothing able to say so — it had the process and none of the gates.
- **The role roster is DERIVED** from the process doc (`tools/murderboard_roster.sh list` — 11
  roles today), never recalled. **Every role runs on every deliverable**; scale *how* you run
  them to stakes (parallel subagents for a spec, one pass walking every checklist for a caption),
  never *which* ones.
- **The artifact is the BUILT FILE, not its generator**, fingerprinted before and after.
- **The run leaves a record** in `docs/reviews/`, gated by `tools/murderboard_roster.sh check`.
  **Exit 1 means a role is missing and the run is not finished** — a 7-of-11 review and a clean
  11-of-11 are otherwise indistinguishable in the report.

`FOUNDATIONS.md` remains the source of truth; the murderboard is a *process* aid and never
overrides it — if a review finding conflicts with FOUNDATIONS, flag the conflict.

When a reviewer needs a paper, use `tools/fetch_paper.py` (open-access hosts only) with
`MURDERBOARD_LIT` pointing at your literature library: `--have` checks the library before
downloading, `--need` flags anything paywalled/unreachable for a human to fetch. It is a
**dev-time** reviewer aid — never imported by the app — so FOUNDATIONS §6 (no runtime egress)
is untouched.
