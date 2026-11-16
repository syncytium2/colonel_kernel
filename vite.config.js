import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

// Dev-only lab picker (see docs/adr/0048-dev-only-lab-mode.md). Loads recordings straight
// from the local, gitignored `exports/` folder so the file dialog is not in the loop on
// every iteration. `apply: 'serve'` — this never runs in a build, and the browser half is
// behind `import.meta.env.DEV`, so the shipped artifact contains neither the endpoints nor
// the folder names. It must stay that way: the deployed app has `connect-src 'none'` and
// could not call these even if they shipped, so any trace of them in dist/ is pure
// attack surface on the one artifact FOUNDATIONS §6 asks people to be able to audit.
const LAB_DIR = 'exports'
const LAB_RE = /\.(csv|xlsx)$/i
// Lab recordings with RAW fluorescence (ADR-0053): `<slice_id>.klab.json`. They default to
// the same gitignored folder; CK_LAB_RAW_DIR points the dev server at another one (the
// lab's export folder), so files need not be copied into the repo tree.
const LAB_RAW_RE = /\.klab\.json$/i

function labRecordingsOnServe() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sources = [
    { list: '/__lab/recordings', file: '/__lab/file', dir: path.join(here, LAB_DIR), label: LAB_DIR, re: LAB_RE },
    {
      list: '/__lab/raw-recordings',
      file: '/__lab/raw-file',
      dir: process.env.CK_LAB_RAW_DIR ? path.resolve(process.env.CK_LAB_RAW_DIR) : path.join(here, LAB_DIR),
      label: process.env.CK_LAB_RAW_DIR ? 'CK_LAB_RAW_DIR' : LAB_DIR,
      re: LAB_RAW_RE,
    },
  ]

  function list(src) {
    try {
      return readdirSync(src.dir).filter((f) => src.re.test(f)).sort()
    } catch {
      return null // folder absent — a clone without local data is not an error
    }
  }

  return {
    name: 'lab-recordings-on-serve',
    apply: 'serve',
    configureServer(server) {
      for (const src of sources) {
        server.middlewares.use(src.list, (_req, res) => {
          const files = list(src)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ dir: src.label, files: files ?? [], missing: files === null }))
        })

        server.middlewares.use(src.file, (req, res) => {
          // Serve BY BASENAME out of the listing only. Never join user input onto the path:
          // `?name=../../.env` would otherwise walk straight out of the folder.
          const name = new URL(req.url, 'http://lab').searchParams.get('name') || ''
          const files = list(src) ?? []
          if (!files.includes(path.basename(name))) {
            res.statusCode = 404
            res.end('not in ' + src.label)
            return
          }
          const full = path.join(src.dir, path.basename(name))
          res.setHeader('Content-Type', 'application/octet-stream')
          res.setHeader('Content-Length', statSync(full).size)
          res.end(readFileSync(full))
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Pin the dev port. The `k2` bookmark/agent (scripts/k2-agent.sh) hard-codes 5173, and
  // Vite's default is to silently walk to the next free port when 5173 is taken — which
  // strands the bookmark on whatever stale server grabbed it first. `strictPort` turns a
  // second `npm run dev` into a loud "port in use" instead of a second server nobody
  // asked for on a port nobody bookmarked.
  server: { port: 5173, strictPort: true },
  plugins: [svelte(), injectCspOnBuild(), assertFullHistoryOnBuild(), labRecordingsOnServe()],
  define: {
    __BUILD_BORN__: JSON.stringify(BUILD_BORN),
    __BUILD_UPDATED__: JSON.stringify(BUILD_UPDATED),
  },
})
