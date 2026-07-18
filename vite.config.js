import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'

// Build-time git dates for the Tab 0 "born on / last updated" line. Baked in at
// build (NOT fetched at runtime) — the strict CSP (connect-src 'none', §6) forbids
// calling the GitHub API from the browser, so these come from git history when the
// bundle is built. Born = the repo's first (root) commit; updated = HEAD at build.
function gitDate(cmd, fallback) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n').pop() || fallback
  } catch {
    return fallback
  }
}
const BUILD_BORN = gitDate('git log --max-parents=0 --format=%cs', '2026-06-21')
const BUILD_UPDATED = gitDate('git log -1 --format=%cs', '')

// In a shallow clone HEAD has no parents in the truncated graph, so
// `--max-parents=0` returns HEAD's date and the Born line silently renders the
// build date. This shipped once (deployed 2026-07-16 read "Born 2026-07-16").
// The dates cannot be checked against a live source — the CSP forbids it — so
// the build environment's git history is the only source of truth. Refuse to
// produce an artifact from a history that cannot supply it.
function assertFullHistoryOnBuild() {
  return {
    name: 'assert-full-history-on-build',
    apply: 'build',
    buildStart() {
      let shallow = false
      try {
        shallow = execSync('git rev-parse --is-shallow-repository', {
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim() === 'true'
      } catch {
        return // no git at all: gitDate's fallbacks already cover this
      }
      if (shallow) {
        throw new Error(
          'Shallow clone: the Tab 0 "Born" date would be wrong (got ' +
            BUILD_BORN + ', expected the root-commit date). ' +
            'Build from a full clone, or run `git fetch --unshallow`. ' +
            'In CI, set actions/checkout fetch-depth: 0.'
        )
      }
    },
  }
}

// Production CSP (FOUNDATIONS §6 / ADR-0008). It must hold on the shipped
// static artifact, but it breaks Vite's dev server: the HMR websocket trips
// `connect-src 'none'` and Vite's JS-injected dev styles trip `default-src
// 'self'`. So the source index.html carries NO CSP (dev runs relaxed, HMR
// works) and this plugin injects the strict policy into the built index.html.
// The deployed artifact is therefore exactly as locked down as before; only
// the local dev server is relaxed. `connect-src 'none'` — the actual no-egress
// privacy guarantee — is present on everything that ever leaves this machine.
const PROD_CSP = "connect-src 'none'; default-src 'self'"

function injectCspOnBuild() {
  return {
    name: 'inject-csp-on-build',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: PROD_CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), injectCspOnBuild(), assertFullHistoryOnBuild()],
  define: {
    __BUILD_BORN__: JSON.stringify(BUILD_BORN),
    __BUILD_UPDATED__: JSON.stringify(BUILD_UPDATED),
  },
})
