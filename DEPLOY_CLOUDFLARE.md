# Deploy Colonel Kernel to Cloudflare (Workers, assets-only)

Static Vite app, no backend. Deployed as a **Cloudflare Worker serving `dist/`
as static assets** (no server script) via `wrangler.jsonc`. **Deploys are
manual** — there is no Git integration wired. Porkbun is the registrar, but DNS
for `tonydefazio.com` is managed by **Cloudflare** (nameservers already point
there), which is what lets the Worker custom domain work directly (§3).

- **Config:** `wrangler.jsonc` (Worker name `colonel-kernel`, `assets.directory = ./dist`,
  `workers_dev` + `preview_urls` explicit).
- **Live (primary):** https://kernel.tonydefazio.com — custom domain, **wired & live** (§3).
- **Live (workers.dev):** https://colonel-kernel.tonydefazio.workers.dev
- **Node 22** (`.nvmrc`); `wrangler` is a devDependency (`npx wrangler …`).

## 1. Deploy runbook (manual — copy/paste)

Deploy the current branch's build. Ship from `master` after merging (don't deploy
a WIP branch).

```bash
cd ~/Documents/colonel_kernel

# 1) clean production build (strict CSP injected at build time by the Vite plugin)
rm -rf dist && npm run build

# 2) privacy gate — the built HTML MUST carry the CSP (FOUNDATIONS §6). Abort if missing.
grep -q "connect-src 'none'" dist/index.html && echo "CSP OK" || echo "CSP MISSING — DO NOT DEPLOY"

# 3) deploy dist/ to the colonel-kernel Worker
npx wrangler deploy

# 4) CONFIRM THE DEPLOY TOOK — the live asset hash must match the local build.
#    (wrangler prints "No updated asset files to upload" when its content-addressed
#     store already has the blobs; that is benign — this check is the real confirmation.)
LOCAL=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html)
echo "local:  $LOCAL"
echo "live :  $(curl -s https://kernel.tonydefazio.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
# the two lines must match. (also check colonel-kernel.tonydefazio.workers.dev if desired)
```

First-ever run prompts a browser OAuth login to Cloudflare; the token is cached
after that. `wrangler deploy` prints the live URL and a Version ID.

## 2. Smoke-test

Open https://kernel.tonydefazio.com, switch to Tab 2, drop a recording (or use the
Tab 1 → Tab 2 handoff), confirm both tabs work and there are no console errors.

## 3. Custom subdomain — DONE (wired & live 2026-07-02)

`kernel.tonydefazio.com` is **live**. Recorded here for reference / re-provisioning.

`tonydefazio.com` is **already a Cloudflare-managed zone** (nameservers
`arya`/`clyde.ns.cloudflare.com`), so the Worker's Custom Domain feature handles
everything — **no Porkbun DNS edit needed.** (Workers custom domains *require* the
zone to be on Cloudflare; unlike Pages you cannot CNAME `workers.dev` from an
external DNS host. That requirement is already satisfied here.)

Setup (already done): Cloudflare dashboard → **Workers & Pages** → `colonel-kernel`
→ **Settings** → **Domains & Routes** → **Add** → **Custom domain** → enter
`kernel.tonydefazio.com` → **Add**. Cloudflare auto-creates the proxied DNS record
in the `tonydefazio.com` zone and provisions TLS (a few minutes). Nothing at Porkbun.

## 4. Verify live (privacy ritual — FOUNDATIONS §6)

- Load the deployed URL (private window, extensions off, so a content-script
  injector doesn't muddy the log), exercise Tab 1 and Tab 2.
- DevTools → **Network** → reload → confirm **only same-origin requests**
  (the `connect-src 'none'` CSP enforces this; this confirms the tag shipped).
- The step-1 `grep` already confirmed the CSP is in the shipped `index.html`.

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
