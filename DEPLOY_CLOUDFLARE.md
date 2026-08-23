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

## 1. Deploy runbook — `npm run deploy`

```bash
cd ~/Documents/colonel_kernel
npm run deploy                # full deploy
npm run deploy -- --dry-run   # everything except the upload
```

That is the whole runbook. It used to live here as copy/paste prose, which let each
session improvise its own variant — that is how a shallow-clone build put a wrong
Tab 0 "Born" date into production on 2026-07-16. The steps now live in
[`scripts/deploy.sh`](scripts/deploy.sh) so they cannot drift from what actually runs.

What it does, and why each gate exists:

1. **Preflight** — refuses a shallow clone (the Tab 0 "Born" date is baked from
   `git log --max-parents=0`, which returns HEAD in a truncated history), refuses a
   non-`main` branch (WIP lands on `main` often; ship after merging), and refuses a
   dirty tree (so `DEPLOYED.md` records a real commit).
2. **Core tests** — 217 checks.
3. **Clean build** — `rm -rf dist && npm run build`; the strict CSP is injected at build
   time by the Vite plugin (ADR-0008).
4. **Gates** — the shipped HTML must carry `connect-src 'none'` (FOUNDATIONS §6), and the
   true root-commit date must be baked into the bundle.
5. **Deploy** — `npx wrangler deploy`.
6. **Verify** — polls both URLs until they serve the new bundle hash, then confirms the CSP
   on the live response.
7. **Record** — writes [`DEPLOYED.md`](DEPLOYED.md). Commit it.

Two non-failures the script already handles: `wrangler` printing **"No updated asset files
to upload"** is benign (its content-addressed store already has the blobs — the hash check
is the real confirmation), and the live `index.html` can serve a **stale edge-cached copy
for up to ~a minute** after upload, which is why step 6 polls instead of checking once.

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

- **Deploys are MANUAL** — you run `npm run deploy`. Nothing auto-deploys on push.
- Optional future change: connect the repo in Cloudflare (Workers & Pages →
  `colonel-kernel` → **Builds → Connect to Git**) so pushes to `main`
  auto-build + deploy. Weigh against the fact that WIP lands on `main` often —
  auto-deploy would want a `deploy` branch or a build gate first. Note that
  Cloudflare's builder clones **shallow**, so it would need `fetch-depth: 0`
  equivalent or the build guard will (correctly) reject it.
- No unpublished data ships: all of `data/` (except `data/README.md`), plus
  `darkroom/` and `exports/`, is gitignored and never enters the build
  (repo-hygiene rule).
- `LICENSE` (MIT) is in place. Before making the GitHub repo public, do a final
  `git ls-files data/ darkroom/` (must be empty).
