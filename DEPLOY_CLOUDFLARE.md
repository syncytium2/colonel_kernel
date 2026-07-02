# Deploy Colonel Kernel to Cloudflare (Workers, assets-only)

Static Vite app, no backend. Deployed as a **Cloudflare Worker serving `dist/`
as static assets** (no server script) via `wrangler.jsonc`. **Deploys are
manual** — there is no Git integration wired. Porkbun is the registrar, but DNS
for `tonydefazio.com` is managed by **Cloudflare** (nameservers already point
there), which is what lets the Worker custom domain work directly (§3).

- **Config:** `wrangler.jsonc` (Worker name `colonel-kernel`, `assets.directory = ./dist`,
  `workers_dev` + `preview_urls` explicit).
- **Live:** https://colonel-kernel.tonydefazio.workers.dev
- **Node 22** (`.nvmrc`); `wrangler` is a devDependency.
- **Custom domain `kernel.tonydefazio.com` is NOT yet wired** — see §3–4 (still a TODO).

## 1. Deploy (manual)

```bash
cd ~/Documents/colonel_kernel
npm run build          # produce dist/ (strict CSP injected at build time)
npx wrangler deploy    # upload dist/ to the colonel-kernel Worker
```

First run prompts a browser OAuth login to Cloudflare. Output prints the live
`workers.dev` URL.

## 2. Smoke-test the workers.dev URL

Open https://colonel-kernel.tonydefazio.workers.dev, switch to Tab 2, drop a
recording, confirm both tabs work and there are no console errors.

## 3. Add the custom subdomain (TODO — not yet done)

`tonydefazio.com` is **already a Cloudflare-managed zone** (nameservers
`arya`/`clyde.ns.cloudflare.com`), so the Worker's Custom Domain feature handles
everything — **no Porkbun DNS edit needed.** (Workers custom domains *require*
the zone to be on Cloudflare; unlike Pages you cannot CNAME `workers.dev` from an
external DNS host. That requirement is already satisfied here.)

Cloudflare dashboard → **Workers & Pages** → `colonel-kernel` → **Settings** →
**Domains & Routes** → **Add** → **Custom domain** → enter
`kernel.tonydefazio.com` → **Add**.

Cloudflare auto-creates the proxied DNS record in the `tonydefazio.com` zone and
provisions the TLS certificate (a few minutes). Nothing to do at Porkbun.

## 5. Verify live (privacy ritual — FOUNDATIONS §6)

- Load the deployed URL, exercise Tab 1 and Tab 2.
- DevTools → **Network** → reload → confirm **only same-origin requests**
  (the `connect-src 'none'` CSP enforces this; this confirms the tag shipped).
- View source / check `dist/index.html` carries the CSP meta tag.

Run this against the **built/deployed** artifact, never the dev server (which is
intentionally unrestricted for HMR — ADR-0008).

## Notes — deploy model (a live decision, see NEXT_SESSION)

- **Deploys are MANUAL** (`npm run build` + `npx wrangler deploy`). Nothing
  auto-deploys on push.
- Optional future change: connect the repo in Cloudflare (Workers & Pages →
  `colonel-kernel` → **Builds → Connect to Git**) so pushes to `master`
  auto-build + deploy. Weigh against the fact that WIP lands on `master` often —
  auto-deploy would want a `deploy` branch or a build gate first.
- No unpublished data ships: all of `data/` (except `data/README.md`), plus
  `darkroom/` and `exports/`, is gitignored and never enters the build
  (repo-hygiene rule).
- `LICENSE` (MIT) is in place. Before making the GitHub repo public, do a final
  `git ls-files data/ darkroom/` (must be empty).
