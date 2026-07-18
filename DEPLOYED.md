# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | 2026-07-18 21:03 UTC |
| **Commit** | `66abde3` — Merge branch 'tab0-problem-figure': Tab 0 leads with the ROI 1 premise f |
| **Bundle** | `assets/index-UrC-ilpf.js` |
| **Worker version** | `13540af9-4d94-4860-9f61-9ee30e11688a` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on `/` or `/methods`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
