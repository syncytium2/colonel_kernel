# Deployed state

Written by `npm run deploy` (`scripts/deploy.sh`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | 2026-07-18 18:12 UTC |
| **Commit** | `b0e5ce0` — Deploy gate: fail if a third-party beacon reaches visitors |
| **Bundle** | `assets/index-ElvyHc5r.js` |
| **Worker version** | `535bde61-762b-4061-bea8-b1265929a282` |
| **Live** | https://kernel.tonydefazio.com · https://colonel-kernel.tonydefazio.workers.dev |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, and both
URLs serving the bundle above.

The one expected console error on the live site is
`static.cloudflareinsights.com/beacon.min.js` being **blocked by CSP**. That is
Cloudflare Web Analytics injecting at the edge, not our code — the block is proof
the no-egress posture holds. Disabling it in the dashboard is an open item.
