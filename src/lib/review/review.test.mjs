// The review page's logic (src/lib/review/model.js), without a browser or jsMLspike.   npm run test:review
import {
  indexEntry, split, burstFlags, flagsOf, wellDetermined, orderItems, neighbours, sliceSuggestion, suggestionsFor,
  preselect, inForce, makeRecord, bulkPlan, progress, mss, shuffled, lastReviewer, rangeOf, meanOf,
} from './model.js';

let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log('  FAIL ' + what); } };

// a minimal jsmlspike-result/1 record
function rec({ rec = 'synth-1', roi = 1, ff = 0, status = 'ok', ok = true, a = 0.02, tau = 1.2, nEv = 3, flat = 0.2, onBound = [], evFrames = [100, 900, 1800], jumps = null, epoch = 1, codes = [] }) {
  return {
    format: 'jsmlspike-result/1', status, refusal: status === 'refused' ? { codes, message: 'x' } : null, message: null,
    identity: { recording: rec, roi_viewer_id: roi, epoch_index: epoch, frame_first: ff, frame_last: ff + 2999, signal: 'ROI dF/F0', n_frames: 3000 },
    timing: { dt_s: 0.1 }, provenance: { mode: 'upgrade', options: { autocal: { amin: 0.0025, amax: 0.03, tauMin: 0.4, tauMax: 2.5 } } },
    kernel: status === 'ok' ? { a, tau, source: ok ? 'own' : 'fallback' } : null,
    autocal: status === 'refused' ? null : { ok, reason: ok ? null : 'no isolated event found', a: ok ? a : null, tau: ok ? tau : null,
      determinacy: ok ? { nEvents: nEv, flatness: flat, onBound } : null, events: ok ? evFrames.map(f => ({ frame: ff + f, time_s: 0, count: 1 })) : [] },
    events: status === 'ok' ? { columns: { jump_frame: (jumps ?? evFrames).map(f => ff + f) } } : null,
  };
}
const E = (stem, r) => indexEntry(stem, r);

// a recording: 6 ROIs x 3 chunks; ROI 6's events coincide with ROIs 1-4's (a burst)
const idx = [];
for (let c = 0; c < 3; c++) for (let roi = 1; roi <= 6; roi++) {
  const ff = c * 3000, epoch = c < 2 ? 1 : 2;
  const opts = roi === 5 ? { ok: false, status: 'no-kernel' } : roi === 4 ? { nEv: 1, onBound: ['amax'], evFrames: [1500] }
    : roi === 6 ? { evFrames: [500, 501, 2500], jumps: [500, 501, 2500] } : { a: 0.01 * roi, tau: 0.5 + 0.2 * roi, evFrames: [100 * roi, 500, 2500] };
  idx.push(E(`s_roi${roi}_f${ff}`, rec({ roi, ff, epoch, ...opts })));
}
idx.push(E('s_roi7_f0', rec({ roi: 7, ff: 0, status: 'refused', codes: ['DRIVER.F0_LOW'] })));

const { items, misses } = split(idx);
check(items.length === 18 && misses.length === 1 && misses[0].codes[0] === 'DRIVER.F0_LOW', 'refused results are screening misses, not review items');

const bursts = burstFlags(idx);
check(bursts.get('s_roi6_f0')?.mostlyBurst === true, 'a kernel whose events coincide with most other ROIs is flagged as resting mostly on burst events');
check(bursts.get('s_roi1_f0')?.mostlyBurst === true && bursts.get('s_roi1_f0').nBurst === 2, 'events at 500 and 2500 (shared by ROIs 1-3 and 6) are burst events; the one at 100 is not');
check(flagsOf(idx.find(e => e.stem === 's_roi4_f0'), bursts).join() === 'single-event,on-limit', 'flags: single event and on a limit');
check(flagsOf(idx.find(e => e.stem === 's_roi5_f0'), bursts).includes('no-kernel'), "flags: 'no-kernel'");
check(!wellDetermined(idx.find(e => e.stem === 's_roi4_f0'), bursts) && preselect(idx.find(e => e.stem === 's_roi4_f0'), bursts) === null,
  'a poorly determined unit is not well determined, and nothing is pre-selected');

for (const mode of ['worst-first', 'priority', 'datecode', 'random']) {
  const o = orderItems(items, mode, 42, bursts);
  check(o.length === items.length && new Set(o.map(e => e.stem)).size === items.length, `${mode}: nothing is filtered out`);
  check(orderItems(items, mode, 42, bursts).map(e => e.stem).join() === o.map(e => e.stem).join(), `${mode}: reproducible from the seed`);
}
{
  const o = orderItems(items, 'worst-first', 7, bursts), tiers = o.map(e => (e.status !== 'ok' ? 0 : e.identity.roi_viewer_id === 4 ? 1 : 3));
  check(tiers.every((t, i) => i === 0 || t >= tiers[i - 1] || tiers[i - 1] === 3), 'worst first: failures, then single-event on a limit, then the rest');
  // windows of one ROI are not shown in experiment order, across seeds
  let inOrder = 0;
  for (let s = 1; s <= 40; s++) {
    const f = orderItems(items, 'datecode', s, bursts).filter(e => e.identity.roi_viewer_id === 1).map(e => e.identity.frame_first);
    if (f.join() === '0,3000,6000') inOrder++;
  }
  check(inOrder < 40 / 2, `datecode: one ROI's windows are shuffled (in experiment order in ${inOrder} of 40 seeds, ~1 in 6 by chance)`);
}
{
  const mid = idx.find(e => e.stem === 's_roi1_f3000');
  let swapped = 0;
  for (let s = 1; s <= 40; s++) { const nb = neighbours(mid, idx, s); if (nb.realOrder.A === 'after') swapped++; check(new Set([nb.A?.stem, nb.B?.stem]).size === 2 && [nb.A, nb.B].every(x => x.identity.roi_viewer_id === 1), 'neighbours are the same ROI\'s adjacent chunks'); }
  check(swapped > 5 && swapped < 35, `neighbour A is the later chunk in ${swapped} of 40 seeds: the label does not reveal the order`);
  const first = neighbours(idx.find(e => e.stem === 's_roi1_f0'), idx, 3);
  check([first.A, first.B].filter(Boolean).length === 1, 'the first chunk has one neighbour');
}
{
  const e = idx.find(x => x.stem === 's_roi1_f0');
  const s = sliceSuggestion(e, idx, bursts);
  check(s.cells === 4 && s.kernels === 8 && s.used === 8 && s.singleEvent === 2 && s.onLimit === 2,
    `slice: every other fitted kernel of the epoch (ROIs 2,3,4,6 over its two chunks; not itself, not ROI 5): ${s.kernels} kernels of ${s.cells} cells`);
  const s2 = sliceSuggestion(e, idx, bursts, { excludeLimit: true }), s3 = sliceSuggestion(e, idx, bursts, { excludeLimit: true, excludeBurst: true });
  check(s2.used === 6 && s2.usedCells === 3 && s3.used <= s2.used, 'the switches drop range-limit kernels, then kernels resting mostly on bursts');
  check(sliceSuggestion(idx.find(x => x.stem === 's_roi1_f6000'), idx, bursts).kernels === 4, 'slice: the second epoch (one chunk) has its own pool');
  const sg = suggestionsFor(e, idx, bursts, 1, {});
  check(sg.map(x => x.source).join() === 'own,neighbour-A,neighbour-B,slice,default,none' && /from 8 kernels of 4 cells/.test(sg[3].detail),
    'suggestions in key order 1-6, the slice one saying how well-founded it is');
}
{
  const ctx = { reviewer: 'TD', engine: { jsmlspike_version: '0.0.1', engine_commit: 'x' }, order: { mode: 'worst-first', seed: 1 }, timeUtc: '2026-11-19T10:00:00.000Z' };
  const r1 = makeRecord('decision', { item: { stem: 'a' }, choice: { source: 'own', a: 1, tau: 1 } }, { ...ctx, id: '1' });
  let threw = false; try { makeRecord('decision', { item: { stem: 'a' }, choice: { source: 'none' }, overrides: '1' }, ctx); } catch { threw = true; }
  check(threw, 'an override without a reason is refused');
  threw = false; try { makeRecord('reveal', { what: 'identity', reason: ' ' }, ctx); } catch { threw = true; }
  check(threw, 'a reveal without a reason is refused');
  const r2 = makeRecord('decision', { item: { stem: 'a' }, choice: { source: 'none' }, overrides: '1', override_reason: 'second look' }, { ...ctx, id: '2', timeUtc: '2026-11-19T10:05:00.000Z' });
  check(r1.format === 'jsmlspike-review/1' && r2.overrides === '1' && inForce([r1, r2]).get('a').id === '2', 'the newest record is in force, and names the one it replaces');
}
{
  const many = Array.from({ length: 95 }, (_, i) => E(`w${i}`, rec({ roi: 100 + i, ff: 0, evFrames: [100, 900], jumps: [100 + i * 20, 900 + i * 20] })));
  const b = burstFlags(many);
  const plan = bulkPlan(many, new Map(), b, 3);
  check(plan.accept.length + plan.spotCheck.length === 95 && plan.spotCheck.length === 10, `bulk: 1 in 10 drawn for a spot check (${plan.spotCheck.length} of 95)`);
  check(bulkPlan(many, new Map(), b, 3).spotCheck.map(e => e.stem).join() === plan.spotCheck.map(e => e.stem).join(), 'bulk: the draw is reproducible from the seed');
}
{
  const p = progress(100, 40, [2000, 4000, 3000]);
  check(p.left === 60 && p.etaMs === 180000, 'progress: ETA = windows left x median time per decision');
  check(mss(0) === '0:00' && mss(299.9) === '5:00' && mss(61) === '1:01', 'window time as m:ss from 0');
  check(shuffled([1, 2, 3, 4, 5], 9).slice().sort().join() === '1,2,3,4,5', 'shuffle is a permutation');
}

// the reviewer's initials come back from the log: the latest record that has any
check(lastReviewer([]) === '', 'lastReviewer: empty log');
check(lastReviewer([{ reviewer: 'TD' }, { reviewer: 'AB' }]) === 'AB', 'lastReviewer: latest wins');
check(lastReviewer([{ reviewer: 'TD' }, { reviewer: null }, { reviewer: '  ' }, {}]) === 'TD', 'lastReviewer: skips records without initials');
check(lastReviewer([{ reviewer: ' TD ' }]) === 'TD', 'lastReviewer: trimmed');

// the shared y-axis covers every series; panel B is rescaled by the trace's mean
check(JSON.stringify(rangeOf([[1, 2], [0.5, NaN, 3]], 0)) === '[0.5,3]', 'rangeOf: union, NaN skipped');
const rp = rangeOf([[0, 10]]); check(Math.abs(rp[0] + 0.3) < 1e-12 && Math.abs(rp[1] - 10.3) < 1e-12, 'rangeOf: 3% padding');
check(rangeOf([[], null, [NaN]]) === null, 'rangeOf: nothing finite');
check(rangeOf([[2, 2]], 0)[1] > rangeOf([[2, 2]], 0)[0], 'rangeOf: a constant trace still gets a span');
check(meanOf([1, 2, NaN, 3]) === 2 && meanOf([]) === null, 'meanOf');

console.log(`review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
