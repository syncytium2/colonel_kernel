// Headless screenshot for visual verification.
//
//   node scripts/screenshot.mjs [url] [outPath]
//
// Defaults to the Vite dev server. Reports any console / page errors so CSP or
// runtime regressions surface (see ADR-0008). Requires the Playwright Chromium
// browser: `npx playwright install chromium`.
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'screenshot.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1000, height: 800 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(800); // let uPlot draw
await page.screenshot({ path: out, fullPage: true });

console.log('screenshot ->', out);
console.log('console errors:', errors.length ? errors : 'none');

await browser.close();
process.exit(errors.length ? 1 : 0);
