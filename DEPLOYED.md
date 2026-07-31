# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | 2026-07-31 20:19 UTC |
| **Commit** | `8cf4bec` — Merge branch 'feat/premise-figure-zoomable': live zoomable premise figur |
| **Bundle** | `assets/index-B6WZ9LJr.js` |
| **Worker version** | `f96cfa9c-49f2-484d-9bf4-e64fe0e3293b` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on `/` or `/methods`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
