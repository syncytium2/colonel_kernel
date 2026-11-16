// Screenshot the lab page (ADR-0053) from a running dev server, so a change to it can be
// looked at, not assumed.
//
//   npm run dev                      (in another shell)
//   node scripts/lab-shot.mjs OUTDIR [recording-option-index]
//
// Writes OUTDIR/lab-whole.png (free-vector, whole recording) and OUTDIR/lab-region.png
// (shaped, first region), and prints any console error the page raised.
import { chromium } from 'playwright';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/lab-shot.mjs OUTDIR [recording-option-index]');
const which = Number(process.argv[3] ?? 1);

// PW_CHROMIUM names a browser binary when the one this Playwright version expects is absent.
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 1, colorScheme: process.env.LAB_SCHEME === 'dark' ? 'dark' : 'light' });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto('http://localhost:5173/#lab');
await page.waitForSelector('.labpage select');
await page.selectOption('.labpage select', { index: which });
await page.waitForSelector('.labpage table', { timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/lab-whole.png`, fullPage: true });

const selects = await page.$$('.labpage .rail select');
await selects[2].selectOption({ index: 1 }); // window: first region
await page.waitForTimeout(2500);
await selects[3].selectOption('shaped');
await page.waitForTimeout(1500);
// LAB_VERDICT=accept|reject|unsure also saves a verdict (it APPENDS a line to the review log
// in the recordings folder), so the save and the read-back can be seen working.
if (process.env.LAB_VERDICT) {
  await page.fill('.labpage .notebox', 'written by scripts/lab-shot.mjs');
  await page.click(`.labpage .review button:has-text("${process.env.LAB_VERDICT}")`);
  await page.waitForSelector(`.labpage .review .saved b:has-text("${process.env.LAB_VERDICT}")`, { timeout: 10000 });
}
await page.screenshot({ path: `${out}/lab-region.png`, fullPage: true });

// A folded view: controls, the STA, the table and the raw band put away.
for (const name of ['hide controls', 'Spike-triggered average', 'Diagnostics by extraction', 'Raw fluorescence']) {
  await page.click(`.labpage .foldhead:has-text("${name}")`);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/lab-folded.png`, fullPage: true });

console.log('console errors:', JSON.stringify(errors));
await browser.close();
process.exit(errors.length ? 1 : 0);
