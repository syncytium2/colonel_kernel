// The review page's engine in a Web Worker (ADR-0054): jsMLspike's message protocol, unchanged. Runs a
// reviewer's "try this kernel" off the main thread. `jsmlspike/engine` resolves only on the dev server,
// to the pinned checkout (vite.config.js reviewEngineOnServe); this file is reached only from the
// dev-only review page and never reaches dist/ (lab-check).
import { handleMessage } from 'jsmlspike/engine';

self.onmessage = (event) => {
  const { reply, transfer } = handleMessage(event.data);
  self.postMessage(reply, transfer);
};
