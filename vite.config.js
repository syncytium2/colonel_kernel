import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERDICT_FILE, VERDICT_HEADER, verdictLine } from './src/lib/lab/verdicts.js'
import { indexEntry } from './src/lib/review/model.js'
const REVIEW_LOG = 'jsmlspike_review.jsonl'

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
      // The review log (ADR-0053): GET returns it, POST appends ONE verdict to it. The only
      // write this server makes, into the folder the lab recordings are read from, to one
      // fixed file name. A line is never changed or removed; the newest line for a kernel is
      // the verdict in force. After writing, the file is read back and the reply is what is
      // on disk, so the page shows what was saved and not what it meant to save.
      const rawDir = sources[1].dir
      const logPath = path.join(rawDir, VERDICT_FILE)
      const readLog = () => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '')
      server.middlewares.use('/__lab/raw-verdicts', (req, res) => {
        const reply = (code, body) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(body)
        }
        if (req.method === 'GET') return reply(200, readLog())
        if (req.method !== 'POST') return reply(405, 'GET or POST')
        let body = ''
        req.on('data', (c) => {
          body += c
          if (body.length > 20000) req.destroy()
        })
        req.on('end', () => {
          try {
            if (!existsSync(rawDir)) throw new Error('the lab recordings folder does not exist')
            const line = verdictLine({ ...JSON.parse(body), time_utc: new Date().toISOString() })
            const before = readLog()
            if (before && before.split('\n')[0] !== VERDICT_HEADER) {
              throw new Error(VERDICT_FILE + ' exists with another header; not written')
            }
            if (!before) writeFileSync(logPath, VERDICT_HEADER + '\n', { flag: 'wx' })
            appendFileSync(logPath, line + '\n')
            const after = readLog()
            if (!after.endsWith(line + '\n')) throw new Error('written, but the line did not read back')
            reply(200, after)
          } catch (e) {
            reply(400, String(e?.message ?? e))
          }
        })
      })

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

// ADR-0054: the review page's engine, jsMLspike, on the DEV SERVER ONLY. jsMLspike is private and
// its licence is not settled, so it is not a package.json dependency (that would make `npm ci` fail
// for anyone without access, including CI) and nothing of it is committed here. Instead the dev
// server resolves `jsmlspike` and its subpaths to a local checkout named by CK_JSMLSPIKE_DIR, which
// must be at the commit pinned in src/lib/review/engine-pin.json (CK_JSMLSPIKE_ALLOW_UNPINNED=1
// overrides, loudly). `apply: 'serve'`: a build never sees it, and lab-check proves nothing of
// jsMLspike reaches dist/. Without CK_JSMLSPIKE_DIR the dev server runs as before.
function reviewEngineOnServe() {
  return {
    name: 'review-engine-on-serve',
    apply: 'serve',
    config() {
      const dir = process.env.CK_JSMLSPIKE_DIR
      if (!dir) return
      const here = path.dirname(fileURLToPath(import.meta.url))
      const root = path.resolve(dir)
      const pin = JSON.parse(readFileSync(path.join(here, 'src/lib/review/engine-pin.json'), 'utf8'))
      let head = null
      try { head = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch {}
      if (head !== pin.commit) {
        const msg = `CK_JSMLSPIKE_DIR (${root}) is at ${head ?? 'no git commit'}, not the pinned ${pin.commit} (src/lib/review/engine-pin.json)`
        if (process.env.CK_JSMLSPIKE_ALLOW_UNPINNED !== '1') throw new Error(`${msg}. Check out the pin, or set CK_JSMLSPIKE_ALLOW_UNPINNED=1.`)
        console.warn(`\n  !! ${msg}. Running UNPINNED because CK_JSMLSPIKE_ALLOW_UNPINNED=1.\n`)
      }
      const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const alias = Object.entries(pkg.exports ?? {}).map(([sub, file]) => ({
        find: new RegExp(`^jsmlspike${sub === '.' ? '' : esc(sub.slice(1))}$`),
        replacement: path.join(root, file),
      }))
      return { resolve: { alias }, server: { fs: { allow: [here, root] } } }
    },
    // The review page's data (jsMLspike ADR 3ca2). The results folder is CK_REVIEW_DIR, else the
    // gitignored exports/review/. Endpoints: an index of every result (what the queue needs, built from
    // the result JSONs), each result file by basename out of the listing (never a joined path), the
    // optional blind-key file, and the decision log: the SECOND write path of lab mode, allowed by Tony
    // (ADR 3ca2 decision 6). It appends one JSON line to jsmlspike_review.jsonl, never changes a line,
    // and replies with the file as read back.
    configureServer(server) {
      const here = path.dirname(fileURLToPath(import.meta.url))
      const dir = process.env.CK_REVIEW_DIR ? path.resolve(process.env.CK_REVIEW_DIR) : path.join(here, 'exports', 'review')
      const keyPath = process.env.CK_REVIEW_KEY ? path.resolve(process.env.CK_REVIEW_KEY) : path.join(dir, 'review_key.json')
      const logPath = path.join(dir, REVIEW_LOG)
      const cache = new Map()
      const files = () => { try { return readdirSync(dir) } catch { return null } }
      const send = (res, code, type, body) => { res.statusCode = code; res.setHeader('Content-Type', type); res.end(body) }

      server.middlewares.use('/__review/index', (_req, res) => {
        const all = files()
        if (all === null) return send(res, 200, 'application/json', JSON.stringify({ dir: dir, missing: true, entries: [], key: false }))
        const entries = [], problems = []
        for (const f of all.filter((n) => n.endsWith('.json') && n !== path.basename(keyPath)).sort()) {
          const full = path.join(dir, f), m = statSync(full).mtimeMs
          let hit = cache.get(f)
          if (!hit || hit.m !== m) {
            try {
              const rec = JSON.parse(readFileSync(full, 'utf8'))
              hit = { m, entry: rec.format === 'jsmlspike-result/1' ? indexEntry(f.replace(/\.json$/, ''), rec) : null }
            } catch (e) { hit = { m, entry: null, problem: `${f}: ${e.message}` } }
            cache.set(f, hit)
          }
          if (hit.entry) entries.push(hit.entry)
          if (hit.problem) problems.push(hit.problem)
        }
        send(res, 200, 'application/json', JSON.stringify({ dir: process.env.CK_REVIEW_DIR ? 'CK_REVIEW_DIR' : 'exports/review', missing: false, entries, problems, key: existsSync(keyPath) }))
      })

      server.middlewares.use('/__review/file', (req, res) => {
        const name = path.basename(new URL(req.url, 'http://review').searchParams.get('name') || '')
        if (!/\.(json|bin)$/.test(name) || !(files() ?? []).includes(name)) return send(res, 404, 'text/plain', 'not a result file here')
        const full = path.join(dir, name)
        res.setHeader('Content-Length', statSync(full).size)
        send(res, 200, name.endsWith('.json') ? 'application/json' : 'application/octet-stream', readFileSync(full))
      })

      server.middlewares.use('/__review/key', (_req, res) => {
        if (!existsSync(keyPath)) return send(res, 404, 'text/plain', 'no key file')
        send(res, 200, 'application/json', readFileSync(keyPath))
      })

      server.middlewares.use('/__review/decisions', (req, res) => {
        const readLog = () => (existsSync(logPath) ? readFileSync(logPath, 'utf8') : '')
        if (req.method === 'GET') return send(res, 200, 'text/plain; charset=utf-8', readLog())
        if (req.method !== 'POST') return send(res, 405, 'text/plain', 'GET or POST')
        let body = ''
        req.on('data', (c) => { body += c; if (body.length > 200000) req.destroy() })
        req.on('end', () => {
          try {
            if (files() === null) throw new Error('the results folder does not exist')
            const recs = JSON.parse(body)
            const lines = (Array.isArray(recs) ? recs : [recs]).map((r) => {
              if (r?.format !== 'jsmlspike-review/1' || !r.id || !r.kind) throw new Error('not a jsmlspike-review/1 record')
              return JSON.stringify(r)
            })
            const text = lines.join('\n') + '\n'
            appendFileSync(logPath, text)
            const after = readLog()
            if (!after.endsWith(text)) throw new Error('written, but the record did not read back')
            send(res, 200, 'text/plain; charset=utf-8', after)
          } catch (e) { send(res, 400, 'text/plain', String(e?.message ?? e)) }
        })
      })
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
  plugins: [svelte(), injectCspOnBuild(), assertFullHistoryOnBuild(), labRecordingsOnServe(), reviewEngineOnServe()],
  define: {
    __BUILD_BORN__: JSON.stringify(BUILD_BORN),
    __BUILD_UPDATED__: JSON.stringify(BUILD_UPDATED),
  },
})
