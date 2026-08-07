# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | 2026-08-07 12:46 UTC |
| **Commit** | `c851ad1` — Merge branch 'fix/lock-scored-round': freeze a scored round |
| **Bundle** | `assets/index-Cdu0hYJx.js` |
| **Worker version** | `c3529b02-317a-446f-8054-5564bde879d9` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on `/` or `/methods`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
