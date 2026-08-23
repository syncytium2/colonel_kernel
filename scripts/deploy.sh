#!/usr/bin/env bash
#
# The deploy runbook, executed rather than described.
#
# DEPLOY_CLOUDFLARE.md used to carry these steps as prose, and each session
# improvised its own variant — that is how a shallow-clone build (wrong Tab 0
# "Born" date) reached production on 2026-07-16. Every gate below exists because
# something actually went wrong, or would have gone unnoticed.
#
#   npm run deploy            # full: preflight -> build -> gates -> deploy -> verify
#   npm run deploy -- --dry-run   # everything except the upload
#
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

CUSTOM_URL="https://kernel.tonydefazio.com"
WORKERS_URL="https://colonel-kernel.tonydefazio.workers.dev"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mABORT: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
step "Preflight"

# A shallow clone silently bakes the wrong Tab 0 "Born" date (vite.config.js
# guards this too; caught here first so it fails before a long build).
[[ "$(git rev-parse --is-shallow-repository)" == "true" ]] &&
  fail "shallow clone — Born date would be wrong. Run: git fetch --unshallow"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" != "main" ]] &&
  fail "on '$BRANCH', not main. Ship from main after merging (WIP lands on main often)."

[[ -n "$(git status --porcelain)" ]] &&
  fail "working tree dirty — commit or stash first, so DEPLOYED.md records a real commit."

COMMIT="$(git rev-parse --short HEAD)"
echo "  $BRANCH @ $COMMIT (full clone, clean tree)"

# ---------------------------------------------------------------- tests
step "Core tests"
npm run --silent test:core | tail -1

# ---------------------------------------------------------------- build
step "Clean production build"
rm -rf dist
npm run --silent build 2>&1 | tail -6

# ---------------------------------------------------------------- gates
step "Gates"

# FOUNDATIONS §6 / ADR-0008 — the privacy guarantee must be in the shipped HTML.
grep -q "connect-src 'none'" dist/index.html ||
  fail "CSP MISSING from dist/index.html — DO NOT DEPLOY"
echo "  CSP present (connect-src 'none')"

# ADR-0048 — the dev-only lab mode must not have reached the artifact.
bash scripts/lab-check.sh || fail "dev-only lab mode leaked into dist/ — DO NOT DEPLOY"

# The Born date must be the repo's true root-commit date, not the build date.
ROOT_DATE="$(git log --max-parents=0 --format=%cs | tail -1)"
grep -q "$ROOT_DATE" dist/assets/index-*.js ||
  fail "root-commit date $ROOT_DATE not baked into the bundle"
echo "  Born date baked correctly ($ROOT_DATE)"

LOCAL_HASH="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html)"
echo "  bundle: $LOCAL_HASH"

if [[ $DRY_RUN == 1 ]]; then
  step "Dry run — stopping before upload"
  exit 0
fi

# ---------------------------------------------------------------- deploy
step "Deploy to Cloudflare"
DEPLOY_OUT="$(npx wrangler deploy 2>&1)"
echo "$DEPLOY_OUT" | tail -6
VERSION_ID="$(echo "$DEPLOY_OUT" | grep -o 'Current Version ID: .*' | cut -d' ' -f4 || true)"

# ---------------------------------------------------------------- verify
# Cloudflare's edge serves a cached index.html for up to ~a minute after upload,
# so a single check here reports a false failure. Poll instead. ("No updated
# asset files to upload" from wrangler is benign — this is the real confirmation.)
step "Verify live (polling past edge cache)"
for i in $(seq 1 12); do
  LIVE_C="$(curl -s --max-time 15 "$CUSTOM_URL/"  | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  LIVE_W="$(curl -s --max-time 15 "$WORKERS_URL/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)"
  if [[ "$LIVE_C" == "$LOCAL_HASH" && "$LIVE_W" == "$LOCAL_HASH" ]]; then
    echo "  both URLs serving $LOCAL_HASH (after ${i} check(s))"
    VERIFIED=1
    break
  fi
  echo "  try $i: custom=${LIVE_C:-none} workers=${LIVE_W:-none} — edge cache, retrying"
  sleep 15
done
[[ "${VERIFIED:-0}" == 1 ]] || fail "live never matched $LOCAL_HASH — investigate before trusting this deploy"

curl -s --max-time 15 "$CUSTOM_URL/" | grep -q "Content-Security-Policy" ||
  fail "live HTML is missing the CSP meta tag"
echo "  live CSP confirmed"

# No third-party script may reach a visitor (FOUNDATIONS §6). Cloudflare Web
# Analytics injects its beacon into HTML at the edge; public/_headers blocks that
# with `no-transform`. The injection is USER-AGENT GATED — a plain curl does not
# see it, which is why it went unnoticed for over a week — so ask as a browser.
BROWSER_UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
for route in "/" "/methods"; do
  hits="$(curl -sL --max-time 15 -H "User-Agent: $BROWSER_UA" -H 'Accept: text/html' \
    "$CUSTOM_URL$route" | grep -c 'cloudflareinsights' || true)"
  [[ "$hits" == "0" ]] ||
    fail "third-party beacon injected into $route — check public/_headers survived the build, and Web Analytics in the Cloudflare dashboard"
done
echo "  no third-party beacon on / or /methods"

# ---------------------------------------------------------------- record
# Deploy state used to live only in Cloudflare, so a new session could only
# learn what was live by curling and comparing hashes. Write it down.
step "Recording deploy state -> DEPLOYED.md"
cat > DEPLOYED.md <<EOF
# Deployed state

Written by \`npm run deploy\` (\`scripts/deploy.sh\`). Do not edit by hand — if
this disagrees with the live site, trust the site and re-run the deploy.

| | |
|---|---|
| **Deployed at** | $(date -u '+%Y-%m-%d %H:%M UTC') |
| **Commit** | \`$COMMIT\` — $(git log -1 --format=%s | cut -c1-72) |
| **Bundle** | \`$LOCAL_HASH\` |
| **Worker version** | \`${VERSION_ID:-unknown}\` |
| **Live** | $CUSTOM_URL · $WORKERS_URL |

Verified at deploy time: core tests pass, CSP present in the shipped HTML and on
the live response, Tab 0 "Born" date baked from the true root commit, both URLs
serving the bundle above, and **no third-party beacon on \`/\` or \`/methods\`**
(checked with a browser user-agent — the injection is UA-gated and invisible to
a plain curl).

The live console should be **clean**. Any third-party script request is a §6
regression, not an expected warning.
EOF

step "Done"
echo "  $LOCAL_HASH live · commit $COMMIT · commit DEPLOYED.md to record it"
