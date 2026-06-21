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

## Doc structure

- **`FOUNDATIONS.md`** — settled foundations and the reasoning behind them. Read first every session. Not a task list. This file wins until deliberately edited.
- **ADRs** — record individual decisions and changes. When an ADR changes a settled point, update `FOUNDATIONS.md` to match so the two never disagree.
- **`NEXT_SESSION.md`** (or similar) — the immediate working state and next actions.
