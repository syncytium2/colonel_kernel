# Deploy Colonel Kernel to kernel.tonydefazio.com (Cloudflare Pages)

Static Vite app, no backend. Cloudflare Pages builds from the GitHub repo and
serves the `dist/` output. Porkbun stays as registrar/DNS — nameservers do NOT
move.

## 0. Prerequisite — push master

Cloudflare builds the *pushed* branch, so land + push the Tab 2 merge first:

```bash
cd ~/Documents/colonel_kernel
git push origin master
git add .nvmrc && git commit -m "Pin Node 22 for Cloudflare Pages build" && git push
```

## 1. Create the Pages project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → authorize GitHub → pick **syncytium2/colonel_kernel**.

Build settings:

| Field                   | Value           |
| ----------------------- | --------------- |
| Production branch       | `master`        |
| Framework preset        | `Vite` (or None)|
| Build command           | `npm run build` |
| Build output directory  | `dist`          |

Environment variables (add both):

| Name                             | Value | Why                                             |
| -------------------------------- | ----- | ----------------------------------------------- |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1`   | stops the `playwright` devDep downloading browsers on install |
| `NODE_VERSION`                   | `22`  | belt-and-suspenders with `.nvmrc`; Vite 8 needs Node ≥20.19 |

Click **Save and Deploy**. First build should emit the same bundle verified
locally. You'll get a `https://<project>.pages.dev` URL.

## 2. Smoke-test the .pages.dev URL

Open it, switch to Tab 2, drop a recording, confirm both tabs work and there are
no console errors.

## 3. Add the custom subdomain

Pages project → **Custom domains** → **Set up a domain** → enter
`kernel.tonydefazio.com`. Cloudflare shows a CNAME target (usually
`<project>.pages.dev`). **This step is required** — a hostname not registered
here returns a 522 error even with correct DNS.

## 4. Add the DNS record at Porkbun

Porkbun → domain → **DNS** → add:

```
Type: CNAME   Host: kernel   Answer: <project>.pages.dev
```

(Use whatever target Cloudflare showed in step 3.) SSL is issued automatically;
allow a few minutes to an hour for DNS + certificate.

## 5. Verify live (privacy ritual — FOUNDATIONS §6)

- Load `https://kernel.tonydefazio.com`, exercise Tab 1 and Tab 2.
- DevTools → **Network** → reload → confirm **only same-origin requests**
  (the `connect-src 'none'` CSP enforces this; this confirms the tag shipped).
- View source / check `dist/index.html` carries the CSP meta tag.

## Notes

- Every future `git push` to `master` auto-deploys. Branch pushes get preview URLs.
- No unpublished data ships: all of `data/` (except `data/README.md`), plus
  `darkroom/` and `exports/`, is gitignored and never enters the build.
- Before making the GitHub repo public, add a `LICENSE` (FOUNDATIONS §505 → MIT).
- Delete the handoff files once done: `LAND_TAB2_MERGE.md`, `tab2-into-master.bundle`,
  and this file if you don't want it tracked.
```
