// Drive the review page on the dev server and screenshot it (ADR-0054), as lab-shot.mjs does for #lab.
//   node scripts/review-shot.mjs OUTDIR [--save]
// Needs the dev server running with CK_JSMLSPIKE_DIR set, and results in exports/review (npm run review-fixture).
// --save also saves one decision with Enter (it appends to the folder's jsmlspike_review.jsonl).
// Prints every console error and page error; exits 1 if there was any.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'review-shots';
const doSave = process.argv.includes('--save');
fs.mkdirSync(out, { recursive: true });
for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:5173/')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, colorScheme: process.env.REVIEW_SCHEME === 'dark' ? 'dark' : 'light' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('page: ' + e.message));
await page.goto('http://localhost:5173/#review');
await page.waitForSelector('text=item 1 /', { timeout: 60000 });
await page.waitForSelector('canvas[aria-label="error surface"], text=no surface', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const shot = (name) => page.screenshot({ path: path.join(out, name), fullPage: true });
await shot('1-queue.png');
console.log('header:', (await page.textContent('header.facts'))?.replace(/\s+/g, ' ').trim());

// choose the own fit (key 1) if it is offered, else the default (5), and try it in the worker
const ownDisabled = await page.locator('input[value="own"]').isDisabled();
await page.keyboard.press(ownDisabled ? '5' : '1');
await page.keyboard.press('t');
await page.waitForSelector('text=tried', { timeout: 60000 }).catch(() => errors.push('try: no "tried" line appeared'));
await shot('2-tried.png');
console.log('tried:', (await page.locator('text=tried').allTextContents()).join(' | '));

if (doSave) {
  const before = await (await fetch('http://localhost:5173/__review/decisions')).text();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const after = await (await fetch('http://localhost:5173/__review/decisions')).text();
  const added = after.slice(before.length).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('saved:', added.map((r) => `${r.kind} ${r.choice?.source} key ${r.item?.blind_key} sha ${r.item?.result_sha256?.slice(0, 12)} tried ${r.tried?.length}`).join(' | ') || 'NOTHING');
  if (added.length !== 1) errors.push('save: expected one new record');
  console.log('after save:', (await page.textContent('header.facts'))?.replace(/\s+/g, ' ').trim().slice(0, 80));
}
// step to the first fitted unit: panels B and C have content there
for (let i = 0; i < 12; i++) {
  const h = (await page.textContent('header.facts')) ?? '';
  if (/fitted on/.test(h)) break;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
}
await page.waitForTimeout(1500);
await shot('5-fitted.png');
console.log('fitted item:', (await page.textContent('header.facts'))?.replace(/\s+/g, ' ').trim());
await page.click('button:has-text("Screening misses")');
await page.waitForTimeout(500);
await shot('3-misses.png');
await page.click('button:has-text("Review the review")');
await page.waitForTimeout(500);
await shot('4-log.png');
await browser.close();
for (const e of errors) console.log('ERROR ' + e);
console.log(errors.length ? `${errors.length} error(s)` : 'no errors');
process.exit(errors.length ? 1 : 0);
