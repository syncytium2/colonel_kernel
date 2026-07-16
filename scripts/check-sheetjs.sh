#!/usr/bin/env bash
# Check whether a SheetJS release newer than the pinned tarball exists on
# cdn.sheetjs.com. SheetJS left npm in 2023 (ADR-0036) and publishes no
# machine-readable "latest" endpoint, so we parse the pinned version out of the
# package.json tarball URL and probe candidate version URLs with HEAD requests.
#
# Prints a human-readable summary. When run inside GitHub Actions it also writes
# `pinned=<ver>` and `newer=<ver|empty>` to $GITHUB_OUTPUT for the workflow to act on.
#
# This runs in CI (or locally), NOT in the shipped app — reaching cdn.sheetjs.com
# here does not touch FOUNDATIONS §6 (that governs the browser runtime, not tooling).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PINNED="$(grep -oE 'xlsx-[0-9]+\.[0-9]+\.[0-9]+' "$ROOT/package.json" | head -1 | sed 's/xlsx-//')"
if [ -z "$PINNED" ]; then
  echo "ERROR: could not parse a pinned SheetJS version from package.json" >&2
  echo "       expected a cdn.sheetjs.com/xlsx-X.Y.Z tarball URL" >&2
  exit 1
fi
echo "Pinned SheetJS:      $PINNED"

IFS=. read -r MA MI PA <<< "$PINNED"

# HEAD a candidate tarball; return 0 iff it exists (HTTP 200).
exists() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' -I "https://cdn.sheetjs.com/xlsx-$1/xlsx-$1.tgz")" = "200" ]
}

# Probe forward from the pinned version. Every candidate is strictly greater than
# PINNED and we scan in increasing order, so the last hit is the highest available.
latest="$PINNED"
for p in $(seq $((PA + 1)) $((PA + 8))); do
  exists "$MA.$MI.$p" && latest="$MA.$MI.$p"
done
for mi in $((MI + 1)) $((MI + 2)); do
  for p in $(seq 0 6); do
    exists "$MA.$mi.$p" && latest="$MA.$mi.$p"
  done
done
exists "$((MA + 1)).0.0" && latest="$((MA + 1)).0.0"

echo "Latest found on CDN: $latest"

newer=""
if [ "$latest" != "$PINNED" ]; then
  newer="$latest"
  echo "RESULT: newer SheetJS available -> $latest (pinned $PINNED). Bump per ADR-0036."
else
  echo "RESULT: pinned version is current."
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "pinned=$PINNED"
    echo "newer=$newer"
  } >> "$GITHUB_OUTPUT"
fi
