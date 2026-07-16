# ADR-0036: SheetJS pinned to the maintained CDN tarball, not the frozen npm package

## Status

Accepted — corrects the install source chosen implicitly in
[ADR-0019](0019-tab2-input-contract-workbook-per-recording.md). Does not change the input contract,
the reader's behavior, or the privacy posture; it only changes **where the SheetJS dependency is
fetched from at build time**. Relates to FOUNDATIONS §6 (privacy / no-CDN-at-runtime).

## Context

[ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) put xlsx reading on the v1 critical
path and named SheetJS as the bundled, self-hosted parser. That decision was correct: SheetJS is the
de-facto standard dependency-free pure-JS xlsx reader, and it satisfies FOUNDATIONS §6 (bundled, no
runtime network egress). But the ADR evaluated SheetJS on **format fit** and the **no-CDN constraint**
only; it never examined the library's **distribution channel or version currency**, so the dependency
was installed the obvious way — `npm install xlsx` — which resolved to **`xlsx@0.18.5`**.

That version is a trap:

- **SheetJS stopped publishing to npm in 2023** and moved distribution to their own site
  (`cdn.sheetjs.com`). The npm `xlsx` package is **frozen at 0.18.5 (April 2022)** and receives no
  further updates. It looks abandoned because the maintainers left npm — not because the software is
  unmaintained.
- Two known vulnerabilities were fixed **upstream but only shipped through the CDN, never to npm**:
  - Prototype Pollution — [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
    fixed in 0.19.3.
  - ReDoS — [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), fixed in 0.20.2.
- `npm audit` therefore reported **1 high-severity vulnerability with "No fix available"** — because
  the fix is unreachable *through npm*.

The realistic risk for this app is low (no backend, `connect-src 'none'` blocks exfiltration even
after a successful pollution, and researchers open their own workbooks) — but the npm package is a
dead end that will never receive another patch, so it must not stay on the critical path.

The apparent tension with FOUNDATIONS §6 ("no CDN") is only apparent: **§6 governs runtime egress —
the browser making requests.** Fetching a dependency tarball from `cdn.sheetjs.com` happens at
**build/install time**, and the code is still bundled locally into `dist/`. The shipped artifact's
`connect-src 'none'; default-src 'self'` guarantee is unchanged; the browser still makes zero
third-party requests.

## Decision

- **Pin SheetJS to the maintained tarball from its own distribution site**, per the vendor's official
  install guidance. In `package.json`:

  ```json
  "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  ```

  This is a **build-time source**, not a runtime dependency; nothing about the no-runtime-egress
  posture (FOUNDATIONS §6) changes.
- **Do not reintroduce `xlsx` from the npm registry.** `registry.npmjs.org/xlsx` is frozen at 0.18.5
  and carries the two unpatched CVEs. Version bumps come from the CDN tarball URL (bump the pinned
  version explicitly).
- The reader ([`load-xlsx.js`](../../src/lib/core/load-xlsx.js)) is **unchanged** — the SheetJS API it
  uses (`read`, `utils.sheet_to_json`) is stable across 0.18 → 0.20.

## Consequences

- **`npm audit` is clean** (0 vulnerabilities), and the dependency is now on a maintained line.
- **Fewer transitive packages.** 0.20.3 bundles its former sub-dependencies internally; the install
  removed 8 packages.
- **Behavior is identical.** Both v1.0 golden workbooks parse byte-for-byte the same under 0.20.3
  (`npm run xlsx-acceptance` — every check passes on the two locally-present goldens; the third is a
  missing local fixture, unrelated). The build still code-splits SheetJS into its own `load-xlsx`
  chunk (ADR-0019 / FOUNDATIONS §6), so the teaching tabs and CSV path pay zero added weight.
- **Version bumps are now a deliberate URL edit**, not an implicit `npm update`. This is a feature: it
  keeps the source channel explicit and prevents silently drifting back onto the dead npm package.
- **The general lesson:** choosing a library and choosing its *install channel* are separate
  decisions. ADR-0019 got the first right and left the second to default. Future dependency ADRs
  should state the intended source and version-currency expectation, not just the library name.

## References

- Corrects the install source implied by
  [ADR-0019](0019-tab2-input-contract-workbook-per-recording.md) (SheetJS as the v1 xlsx reader).
- FOUNDATIONS §6 (privacy: no runtime third-party requests; bundle everything locally). The no-CDN
  rule is a **runtime** guarantee; a build-time tarball fetch does not violate it.
- Advisories: [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) (prototype
  pollution), [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (ReDoS).
- Vendor install guidance: SheetJS "Standalone" / npm-via-tarball instructions at `cdn.sheetjs.com`.
