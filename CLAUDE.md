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
