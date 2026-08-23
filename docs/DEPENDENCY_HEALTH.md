# Dependency Health — Defense & Up-to-Date

A shared team process for keeping npm dependencies **safe** and **current**. Written in
`colonel_kernel` but meant to be **adopted verbatim by the sibling Vite/Svelte project** (the R-plots
tool). Same stack (Vite + Svelte + npm, GitHub-hosted), so every mechanism here copies over directly —
there is no kernel/deconvolution-specific content below. Where the app-privacy rule is mentioned it is
flagged as *conditional*, because that rule is specific to tools that handle unpublished research data;
adopt it only if your tool does too.

## The two checks

Every dependency, in every one of our repos, must satisfy two standing checks:

1. **Defense** — no dependency with a **known vulnerability** ships or builds. (Answered by `npm audit`
   and GitHub/Dependabot security alerts.)
2. **Up-to-date** — no dependency **silently rots** on an abandoned or frozen release. (Answered by
   Dependabot version-update PRs, plus a custom probe for dependencies Dependabot structurally cannot
   see — see below.)

Both are required. A package can be *up-to-date* and still have a fresh CVE; a package can have *zero
known vulnerabilities today* precisely because it is frozen and no longer receiving advisories. You
need both watchers.

## Why we wrote this down — the SheetJS lesson

This process exists because of a concrete miss, worth understanding so it doesn't repeat.

We needed an xlsx parser and picked **SheetJS** — the correct library. We installed it the obvious
way, `npm install xlsx`, which resolved to **`xlsx@0.18.5`**. What we didn't know: **SheetJS stopped
publishing to npm in 2023** and moved distribution to its own site (`cdn.sheetjs.com`). The npm package
has been **frozen at 0.18.5 since April 2022**. Two vulnerabilities — prototype pollution and a ReDoS —
were fixed *upstream* but the fixes only ever shipped through the vendor CDN, never back to npm. So
`npm audit` reported a **high-severity finding with "No fix available"**, and nothing at all was
watching for the newer, patched releases.

Two lessons came out of it, and they are the backbone of this process:

- **Choosing a library and choosing its *distribution channel* are separate decisions.** The library
  was right; the channel was a dead mirror. "It installed fine" proves nothing — a frozen mirror
  installs fine too.
- **Freshness needs an *active* watcher, and the default one has a blind spot.** Dependabot tracks
  registry (semver) dependencies but **cannot see URL/tarball pins**. The moment you pin a dependency
  to a tarball URL (which is exactly how you escape a dead npm package — see the fix below), Dependabot
  goes silent on it, so you must add your own check.

The fix was to pin SheetJS to its **maintained CDN tarball** in `package.json`:

```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

This is a **build-time** fetch — the code is still bundled locally into the shipped artifact, so it does
**not** violate an app's no-runtime-egress rule (that rule governs the browser, not the toolchain).

(Full decision record: `docs/adr/0036-sheetjs-install-from-maintained-tarball.md`, which corrects the
install-source omission in `docs/adr/0019-…`.)

## What's in place — the three mechanisms

Together these cover **every** package (registry and tarball-pinned) for **both** checks. No overlap,
no gaps.

| Mechanism | File | Covers | Which check |
|---|---|---|---|
| **`npm audit` (all deps, prod + dev)** | in the weekly workflow | every installed package, including dev/build tooling | Defense |
| **Dependabot** (`npm` + `github-actions`) | `.github/dependabot.yml` | every **registry** package + the CI actions | Defense + Up-to-date |
| **dep-freshness workflow + probe** | `.github/workflows/dep-freshness.yml`, `scripts/check-sheetjs.sh` | **tarball/URL pins** Dependabot can't see | Up-to-date (with an `npm audit` backstop for Defense) |

**Division of labor:** Dependabot owns everything on the registry. The custom workflow owns the one
thing Dependabot can't — the tarball pin — and runs a weekly `npm audit` across *all* deps as a
vulnerability backstop. It only **opens or updates a single tracking issue** when it finds something;
otherwise it stays silent. Neither mechanism ever changes a dependency on its own.

### Coverage in this repo, concretely

- Registry, watched by Dependabot for both checks: `fft.js`, `papaparse`, `uplot`, and all dev deps
  (`svelte`, `vite`, `playwright`, `wrangler`, the Svelte plugin).
- Tarball pin, watched by the custom workflow for freshness + `npm audit` for vulns: `xlsx`.
- CI actions, watched by Dependabot: `actions/checkout`, `actions/setup-node`.

## The process — what the team actually does

**Merge gate.** A PR does not merge with an **open high/critical `npm audit` finding**. Fix, bump, or
consciously waive with a written reason in the PR.

**Weekly triage (Mondays).** The checks run Monday; a person spends a few minutes on the output:
- Review **Dependabot PRs**. Minor/patch bumps are grouped into one PR — merge once CI is green.
  **Major** bumps arrive as individual PRs — review each on its own, since a major `vite`/`svelte` jump
  can carry breaking changes.
- Act on the **dep-freshness tracking issue** if one was opened (newer tarball release, or a vuln the
  audit caught). For a newer SheetJS: bump the tarball URL per ADR-0036, run `npm install` and the
  acceptance test, open a PR. **Do not** reinstall from npm.

**Adding a new dependency — checklist (this is where the SheetJS miss happened):**
- [ ] **State the install source and why** in the PR description — not just the package name.
- [ ] **Confirm it's actively maintained and on a live channel.** Check the last publish date and that
      the registry version is not a frozen mirror of a project that moved elsewhere.
- [ ] **Prefer registry semver** so Dependabot can watch it automatically.
- [ ] If a **URL/tarball pin is unavoidable** (dead npm package, vendor-CDN distribution), add it to the
      freshness probe (`scripts/check-sheetjs.sh` — generalize it beyond SheetJS if needed) so it
      doesn't fall into Dependabot's blind spot.
- [ ] *(Conditional — only if your tool handles unpublished research data):* bundle it locally, no
      runtime CDN/analytics/font calls. The freshness checks are compatible because they run in **CI**,
      not the browser.

## Adopting this in another repo (the R-plots tool)

Because the stack is identical, adoption is mostly copy-and-adjust:

1. Copy `.github/dependabot.yml` as-is (npm + github-actions, weekly, minor/patch grouped).
2. Copy `.github/workflows/dep-freshness.yml`. If you have **no tarball pins**, you can drop the
   SheetJS probe step and keep just the weekly `npm audit`; add the probe back the day you pin any
   dependency to a URL.
3. Copy `scripts/check-sheetjs.sh` only if/when you have a tarball pin to watch; rename/generalize it
   for whatever package it guards.
4. In repo **Settings → Code security**, enable **Dependabot alerts** (and optionally Dependabot
   security updates). The committed `npm audit` step is a belt-and-suspenders backstop for this.

**Activation note (applies to both repos):** GitHub reads scheduled workflows and the Dependabot config
from the **default branch only**. Both go live when the change is merged to `main`, not from a feature
branch. Use the Actions tab's **Run workflow** button to test on demand once merged.

## References

- `docs/adr/0036-sheetjs-install-from-maintained-tarball.md` — the pin decision and the no-CDN-at-
  runtime reasoning.
- `docs/adr/0019-…` — where SheetJS was chosen (correct library, install-source left to default).
- `.github/dependabot.yml`, `.github/workflows/dep-freshness.yml`, `scripts/check-sheetjs.sh` — the
  mechanisms themselves.
- Advisories: GHSA-4r6h-8v6p-xvw6 (prototype pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS).
