# 8. CSP injected at build time (dev server runs relaxed)

## Status

Accepted

## Context

The privacy posture (`FOUNDATIONS.md` §6) mandates a strict Content-Security-Policy —
`connect-src 'none'; default-src 'self'` — set as a `<meta http-equiv>` tag so it holds on any
static host. It was placed literally in `index.html` from day one.

When the first plotting UI (uPlot via Svelte) was visually verified with a headless browser, the
**production build rendered perfectly with zero CSP violations** — the shipped artifact is correct.
But the **Vite dev server (`npm run dev`) was broken** by the same `<meta>` tag, for two dev-only
reasons:

1. **HMR websocket.** Vite's hot-reload opens `ws://localhost:…`, which trips `connect-src 'none'`.
2. **Dev-time style injection.** In dev, Vite injects component CSS via JS-inserted `<style>`
   elements; `default-src 'self'` (with no `style-src 'unsafe-inline'`) blocks them, so the dev
   page renders **unstyled with no plots**. A production build instead emits a real linked
   stylesheet, which `default-src 'self'` permits — hence prod is fine.

uPlot itself is clean: the zero-violation production render proves it does not rely on blocked
inline styles. The conflict is purely between Vite's dev tooling and the production-grade CSP.

Leaving the strict tag in `index.html` forces all development through
`npm run build && npm run preview` — no HMR, slow iteration.

## Decision

**Keep the source `index.html` free of any CSP, and inject the strict policy into the built
`index.html` at build time** via a small Vite plugin (`inject-csp-on-build`, `apply: 'build'`,
`transformIndexHtml`) in `vite.config.js`. The policy string lives in one place there.

- **Dev server** runs with no CSP → HMR works, styles load, plots render.
- **Build output** (`dist/index.html`) carries `connect-src 'none'; default-src 'self'` exactly as
  before — verified present in the built file.

The privacy guarantee is unchanged: the dev server is local-only and never the deployed artifact,
and `connect-src 'none'` — the actual no-network-egress promise — is present on everything that
ever leaves the machine.

## Consequences

**Pros**

- HMR and styled dev rendering are restored; iteration is fast again.
- The shipped artifact is byte-for-byte as locked down as before — same policy, same effect.
- The policy is defined once (`vite.config.js`), not duplicated.

**Cons / caution**

- The strict CSP is no longer visible in the source `index.html`, so a reader must know it is
  injected at build. Mitigated by an explanatory comment in `index.html` pointing at the plugin,
  and by this ADR.
- The **verification ritual** (`FOUNDATIONS.md` §6: DevTools → Network → reload → only same-origin)
  must be run against the **built/deployed** artifact (`npm run preview` or production), never the
  dev server — the dev server is intentionally unrestricted.

**Scope**

- Changes only *where* the CSP is set, not *what* it is. The policy and the no-egress posture
  (`FOUNDATIONS.md` §6) are unchanged. `FOUNDATIONS.md` §6 and `CLAUDE.md` are updated to describe
  build-time injection.
