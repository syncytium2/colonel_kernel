# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

> **One hand edit, 2026-07-30.** History was rewritten that day to strip an
> unpublished-data blob, which renumbered every commit from 2026-07-18 onward.
> The Commit field below said `332b617`, which no longer exists; it is now the
> same commit's new SHA, `aff64fa`. Nothing about what is live changed — the
> bundle hash below is untouched and still correct. The next `npm run deploy`
> overwrites this file normally.

| | |
|---|---|
| **Deployed at** | 2026-07-30 19:32 UTC |
| **Commit** | `aff64fa` — Merge branch 'docs/readme-rewrite': a README for researchers, not scaffo |
| **Bundle** | `assets/index-BulypMdU.js` |
| **Worker version** | `d38e1e39-d9a6-4f16-a106-b3c4e09e96e0` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on `/` or `/methods`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
