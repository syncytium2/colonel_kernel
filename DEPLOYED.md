# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | 2026-08-05 17:02 UTC |
| **Commit** | `82d1586` — Merge branch 'feat/tab3-merge-input-bands': overlay true vs recovered on |
| **Bundle** | `assets/index-CF7NCHjV.js` |
| **Worker version** | `d8ac60b4-afd6-429d-a5ef-7efaf43ff79c` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on `/` or `/methods`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
