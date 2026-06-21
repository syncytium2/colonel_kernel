import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

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
  plugins: [svelte(), injectCspOnBuild()],
})
