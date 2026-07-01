// Screenshot the Tab 2 single-ROI readout for a dropped .xlsx golden (ADR-0018
// figure check — Tony's eye is the gate). Output goes to gitignored darkroom/
// (real-data-derived, FOUNDATIONS §6).
//
//   node scripts/screenshot-xlsx.mjs [xlsxPath] [outPath] [url]
//
// Requires the dev server running (npm run dev) and Playwright Chromium.
import { chromium } from 'playwright';

const xlsxPath =
  process.argv[2] ||
  '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/golden/APs_xlsx_v1_20241004_80.xlsx';
const out = process.argv[3] || 'darkroom/fig_xlsx_file80_roi1.png';
const url = process.argv[4] || 'http://localhost:5173/#tab2';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// upload the .xlsx through the visible file input (drop and picker share handleFiles)
await page.locator('input[type="file"]').first().setInputFiles(xlsxPath);

// wait for the readout: a uPlot canvas appears once a region is loaded + drawn
await page.waitForSelector('canvas', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500); // let recovery + uPlot settle

await page.screenshot({ path: out, fullPage: true });

console.log('screenshot ->', out);
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
