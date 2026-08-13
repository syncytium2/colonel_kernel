#!/usr/bin/env bash
# Prove the dev-only lab mode (ADR-0048) left NO trace in the built artifact.
#
# The lab picker reads the local, gitignored exports/ folder. It is gated two ways — a
# serve-only Vite plugin, and a dynamic import behind `import.meta.env.DEV` — and both are
# invisible failures: if the gating ever breaks, the build still succeeds and the app still
# works, it just quietly ships a dead code path plus the names of the recordings on this
# machine. That is precisely the "no third-party code was added, therefore §6 holds"
# reasoning the Cloudflare beacon already disproved once. So assert it mechanically.
#
# Run standalone (builds if needed) or as a deploy gate against an existing dist/.
set -euo pipefail

cd "$(dirname "$0")/.."

[[ -d dist ]] || { echo "no dist/ — building first"; npm run --silent build >/dev/null; }

# Distinctive markers only. NOT the bare word "exports" — it appears throughout any bundle
# as CJS interop and would make this gate cry wolf until someone disabled it.
FOUND=0
for marker in 'LabPicker' '__lab/recordings' '__lab/file' 'lab-recordings-on-serve'; do
  if grep -rqF "$marker" dist/; then
    echo "  LEAKED: '$marker' is present in dist/" >&2
    grep -rlF "$marker" dist/ | sed 's/^/    /' >&2
    FOUND=1
  fi
done

# The component must not be emitted as its own chunk either.
if compgen -G 'dist/assets/*LabPicker*' >/dev/null; then
  echo "  LEAKED: a LabPicker chunk was emitted" >&2
  FOUND=1
fi

if [[ "$FOUND" == 1 ]]; then
  echo >&2
  echo "ABORT: dev-only lab mode reached the production bundle (ADR-0048)." >&2
  echo "Check that LabPicker.svelte is imported ONLY via the dynamic import behind" >&2
  echo "import.meta.env.DEV in Tab2.svelte — a static import defeats the gating." >&2
  exit 1
fi

echo "  lab mode absent from dist/ (ADR-0048)"
