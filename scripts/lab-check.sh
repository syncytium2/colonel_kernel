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
# ADR-0053 adds the raw-fluorescence lab page: its component, its endpoints, its file format
# name and a string only its extraction module carries.
# ADR-0054 adds the review page's engine, jsMLspike (private, licence unsettled): strings only
# jsMLspike's code carries that survive minification (its result format, refusal and R1 codes, its F0
# method name), the serve-only plugin's name, and the repository name from the engine pin.
for marker in 'LabPicker' '__lab/recordings' '__lab/file' 'lab-recordings-on-serve' \
              'LabExtraction' '__lab/raw-recordings' '__lab/raw-file' 'colonel-lab-recording' \
              'F0 held constant' '__lab/raw-verdicts' 'kernel_review.tsv' \
              'jsmlspike-result/1' 'DRIVER.F0_LOW' 'DRIVER.MASK_NOT_SUPPORTED' 'R1.T0_UNREVIEWED' \
              'prctile10-unmasked' 'review-engine-on-serve' 'syncytium2/jsMLspike' \
              'ReviewPage' '__review/' 'jsmlspike_review.jsonl' 'review-page/0.1.0' 'jsmlspike-review/1'; do
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
if compgen -G 'dist/assets/*LabExtraction*' >/dev/null; then
  echo "  LEAKED: a LabExtraction chunk was emitted" >&2
  FOUND=1
fi
if compgen -G 'dist/assets/*[Rr]eview[Pp]age*' >/dev/null || compgen -G 'dist/assets/*jsmlspike*' >/dev/null \
   || compgen -G 'dist/assets/*worker*' >/dev/null; then
  echo "  LEAKED: a review-page, jsMLspike or worker chunk was emitted (ADR-0054)" >&2
  FOUND=1
fi

if [[ "$FOUND" == 1 ]]; then
  echo >&2
  echo "ABORT: dev-only lab mode reached the production bundle (ADR-0048)." >&2
  echo "Check that LabPicker.svelte is imported ONLY via the dynamic import behind" >&2
  echo "import.meta.env.DEV in Tab2.svelte — a static import defeats the gating." >&2
  echo "Likewise src/lib/lab/ (ADR-0053): reached only from the dynamic import in App.svelte." >&2
  exit 1
fi

echo "  lab mode absent from dist/ (ADR-0048, ADR-0053)"
