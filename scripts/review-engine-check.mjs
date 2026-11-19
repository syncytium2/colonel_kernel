// ADR-0054: check that the dev server can reach the review page's engine, jsMLspike, through the same
// resolution the page will use, and that it is the pinned commit.
//
//   CK_JSMLSPIKE_DIR=<jsMLspike checkout> npm run review-engine-check
//
// Starts Vite in middleware mode with this repository's config (so reviewEngineOnServe() applies its
// pin check and aliases), loads `jsmlspike/engine` through Vite, and asks it for its version. Exits 0
// on success; 1 with the reason otherwise. Never part of a build; reads no recordings.
import { createServer } from 'vite'

if (!process.env.CK_JSMLSPIKE_DIR) {
  console.error('CK_JSMLSPIKE_DIR is not set: name a jsMLspike checkout at the commit in src/lib/review/engine-pin.json')
  process.exit(1)
}
let server
try {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  const { handleMessage } = await server.ssrLoadModule('jsmlspike/engine')
  const { reply } = handleMessage({ id: 1, type: 'version' })
  if (!reply.ok) throw new Error(reply.error)
  console.log(`  jsMLspike engine reachable on the dev server: version ${reply.jsmlspike}, driver ${reply.driver}, results ${reply.resultFormat}`)
  await server.close()
  process.exit(0)
} catch (e) {
  console.error(`  review engine NOT reachable: ${e.message}`)
  if (server) await server.close()
  process.exit(1)
}
