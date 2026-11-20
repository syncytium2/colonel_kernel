// The review page's logic, without any UI (ADR-0054; jsMLspike ADRs f3b6, 3dfe, e18f, 3ca2).
// Pure functions over the server's index of jsMLspike results, so they can be tested without a browser.
//
// An index entry (built by the dev server from each result's JSON, see vite.config.js):
//   { stem, status, codes, dt, mode, identity: { recording, roi_viewer_id, epoch_index, frame_first,
//     frame_last, signal, n_frames }, kernel: { a, tau, source } | null,
//     autocal: { ok, reason, a, tau, nEvents, flatness, onBound, eventFrames } | null, eventFrames }
// Identity is used to group and order; the page never displays it unless the reveal switch is used.

export const PAGE_VERSION = 'review-page/0.1.0';
export const REVIEW_FORMAT = 'jsmlspike-review/1';

/** Provisional thresholds (ADR 3dfe: Tony sets them after seeing the distributions). */
export const THRESHOLDS = Object.freeze({
  flat: 0.02,            // flatness below this: the error barely changes across the allowed box
  surfaceCapPct: 20,     // panel C's colour scale: 0% (the best kernel) to this % worse; worse is drawn at the top colour
  burstFraction: 0.30,   // a burst event: more than this share of the other ROIs have an event within the window
  burstWindowS: 1.0,
  mostlyBurst: 0.5,      // a kernel rests mostly on burst events when more than this share of its events are
});

/** The lab's default kernel (interface2 MLspike_runProps3.m, ROI arm), used when a result names none. */
export const LAB_DEFAULT = Object.freeze({ a: 0.007, tau: 1.5 });

// ---- deterministic randomness, so an order and its A/B labels are reproducible from a seed ----
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hashString(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function shuffled(arr, seed) {
  const a = arr.slice(), r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * The index entry of one result record (jsmlspike-result/1, parsed JSON): what the queue, the
 * suggestions and the burst flags need, without the per-frame arrays. Run by the dev server.
 */
export function indexEntry(stem, rec) {
  const id = rec.identity ?? {}, ac = rec.autocal, d = ac?.determinacy;
  return {
    stem, status: rec.status, codes: rec.refusal?.codes ?? [], message: rec.message ?? null,
    dt: rec.timing?.dt_s ?? null, mode: rec.provenance?.mode ?? null,
    identity: { recording: id.recording ?? null, roi_viewer_id: id.roi_viewer_id ?? null, epoch_index: id.epoch_index ?? null,
      frame_first: id.frame_first ?? null, frame_last: id.frame_last ?? null, signal: id.signal ?? null, n_frames: id.n_frames ?? null },
    kernel: rec.kernel && rec.kernel.a != null ? { a: rec.kernel.a, tau: rec.kernel.tau, source: rec.kernel.source } : null,
    autocal: ac ? { ok: ac.ok, reason: ac.reason ?? null, a: ac.a, tau: ac.tau, nEvents: d?.nEvents ?? (ac.events?.length ?? null),
      flatness: d?.flatness ?? null, onBound: d?.onBound ?? [], eventFrames: (ac.events ?? []).map(x => x.frame) } : null,
    eventFrames: rec.events?.columns?.jump_frame ?? [],
    maxCount: Math.max(0, ...(rec.events?.columns?.count ?? [])),   // most spikes in one frame: the spike row's height over the set
    bounds: rec.provenance?.options?.autocal ?? null,
  };
}

/** Results that are review items, and those that are screening misses (refused: ADR 3ca2 decision 3). */
export function split(index) {
  return { items: index.filter(e => e.status !== 'refused'), misses: index.filter(e => e.status === 'refused') };
}

const groupKey = e => [e.identity.recording, e.identity.frame_first, e.identity.frame_last, e.identity.signal, e.mode].join('|');
const epochKey = e => [e.identity.recording, e.identity.epoch_index ?? 'none', e.identity.signal, e.mode].join('|');

/**
 * Burst events (ADR 3ca2 decision 4; jsMLspike VALIDATION, slice-hint census): an event of a unit is a
 * burst event when more than THRESHOLDS.burstFraction of the OTHER ROIs of the same chunk have an
 * event within +-burstWindowS. Returns stem -> { nEvents, nBurst, mostlyBurst } for fitted units.
 */
export function burstFlags(index) {
  const groups = new Map();
  for (const e of index) if (e.status === 'ok') { const k = groupKey(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const out = new Map();
  for (const members of groups.values()) {
    for (const e of members) {
      const frames = e.autocal?.ok ? e.autocal.eventFrames ?? [] : [];
      if (!frames.length) continue;
      const w = Math.round(THRESHOLDS.burstWindowS / (e.dt || 0.1)), others = members.filter(o => o !== e);
      const isBurst = f => others.length > 0 && others.filter(o => (o.eventFrames ?? []).some(x => Math.abs(x - f) <= w)).length > THRESHOLDS.burstFraction * others.length;
      const nBurst = frames.filter(isBurst).length;
      out.set(e.stem, { nEvents: frames.length, nBurst, mostlyBurst: nBurst > THRESHOLDS.mostlyBurst * frames.length });
    }
  }
  return out;
}

/** The flags shown on a unit (and recorded with its decision). */
export function flagsOf(e, bursts) {
  const f = [];
  if (e.status === 'no-kernel') f.push('no-kernel');
  const d = e.autocal;
  if (d?.ok) {
    if (d.nEvents === 1) f.push('single-event');
    if ((d.onBound ?? []).length) f.push('on-limit');
    if (d.flatness != null && d.flatness < THRESHOLDS.flat) f.push('flat');
  }
  if (bursts?.get(e.stem)?.mostlyBurst) f.push('rests-mostly-on-burst-events');
  return f;
}

/** Well determined (provisional): its own fit, on 2+ events, not on a limit, not flat, not mostly bursts. */
export function wellDetermined(e, bursts) {
  return e.status === 'ok' && e.kernel?.source === 'own' && flagsOf(e, bursts).length === 0;
}

/** Worst-first tier (ADR e18f): failures, then single-event on a limit, then single-event or flat, then the rest. */
export function tier(e, bursts) {
  const f = flagsOf(e, bursts);
  if (e.status !== 'ok' || !e.autocal?.ok) return 0;
  if (f.includes('single-event') && f.includes('on-limit')) return 1;
  if (f.includes('single-event') || f.includes('flat')) return 2;
  return 3;
}

/**
 * The review order (ADR e18f): nothing is filtered out, and one ROI's windows are never shown in
 * experiment order unless revealed. Every order shuffles within its ties, from the seed.
 * @param {'worst-first'|'priority'|'datecode'|'random'} mode
 * @param {Map<string, any>} key  stem -> key entry (may be empty)
 */
export function orderItems(items, mode, seed, bursts, key = new Map()) {
  const r = shuffled(items, seed);   // random tie order, so windows within a recording are shuffled
  const pos = new Map(r.map((e, i) => [e.stem, i]));
  const by = f => r.slice().sort((x, y) => f(x, y) || pos.get(x.stem) - pos.get(y.stem));
  if (mode === 'random') return r;
  if (mode === 'worst-first') return by((x, y) => tier(x, bursts) - tier(y, bursts));
  if (mode === 'datecode') return by((x, y) => String(x.identity.recording).localeCompare(String(y.identity.recording)));
  if (mode === 'priority') {
    const p = e => key.get(e.stem)?.priority ?? Infinity;
    return by((x, y) => (p(x) === p(y) ? 0 : p(x) < p(y) ? -1 : 1));
  }
  throw new Error(`unknown order ${mode}`);
}

/**
 * The neighbour suggestions (ADR 3ca2 decision 1): the chunks just before and just after this one, of
 * the same ROI, signal and mode, labelled A and B in an order drawn from the seed, so the label does
 * not say which comes first. `realOrder` is what the reveal switch shows.
 */
export function neighbours(e, index, seed) {
  const same = index.filter(o => o !== e && o.identity.recording === e.identity.recording && o.identity.roi_viewer_id === e.identity.roi_viewer_id
    && o.identity.signal === e.identity.signal && o.mode === e.mode);
  const before = same.filter(o => o.identity.frame_last < e.identity.frame_first).sort((x, y) => y.identity.frame_first - x.identity.frame_first)[0] ?? null;
  const after = same.filter(o => o.identity.frame_first > e.identity.frame_last).sort((x, y) => x.identity.frame_first - y.identity.frame_first)[0] ?? null;
  const swap = (hashString(`${seed}:${e.stem}`) & 1) === 1;
  const [A, B] = swap ? [after, before] : [before, after];
  return { A, B, realOrder: { A: A === before ? 'before' : A === after ? 'after' : null, B: B === before ? 'before' : B === after ? 'after' : null } };
}

const median = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/**
 * The slice suggestion (ADR 3ca2 decision 4): every OTHER cell's own fitted kernel in the same recording
 * and epoch (same signal and mode), with how well-founded it is. Switches: exclude kernels on a range
 * limit; exclude kernels resting mostly on burst events.
 */
export function sliceSuggestion(e, index, bursts, { excludeLimit = false, excludeBurst = false } = {}) {
  const pool = index.filter(o => o !== e && o.status === 'ok' && o.autocal?.ok && o.kernel?.source === 'own' && epochKey(o) === epochKey(e)
    && o.identity.roi_viewer_id !== e.identity.roi_viewer_id);
  const onLimit = o => (o.autocal.onBound ?? []).length > 0, burst = o => !!bursts.get(o.stem)?.mostlyBurst;
  const used = pool.filter(o => !(excludeLimit && onLimit(o)) && !(excludeBurst && burst(o)));
  const as = used.map(o => o.kernel.a), ts = used.map(o => o.kernel.tau);
  const cellsOf = xs => new Set(xs.map(o => o.identity.roi_viewer_id)).size;
  // a cell has one kernel per chunk of the epoch; every kernel counts, and the cells are counted too
  return {
    kernels: pool.length, cells: cellsOf(pool), used: used.length, usedCells: cellsOf(used),
    singleEvent: pool.filter(o => o.autocal.nEvents === 1).length, onLimit: pool.filter(onLimit).length, mostlyBurst: pool.filter(burst).length,
    a: used.length ? { median: median(as), min: Math.min(...as), max: Math.max(...as) } : null,
    tau: used.length ? { median: median(ts), min: Math.min(...ts), max: Math.max(...ts) } : null,
  };
}

/** The suggestions shown for an item, in key order 1..n (the number keys choose them). */
export function suggestionsFor(e, index, bursts, seed, switches) {
  const nb = neighbours(e, index, seed), sl = sliceSuggestion(e, index, bursts, switches);
  const k = o => (o?.status === 'ok' && o.autocal?.ok ? { a: o.autocal.a, tau: o.autocal.tau } : null);
  const own = e.autocal?.ok ? { a: e.autocal.a, tau: e.autocal.tau } : null;
  const nbDetail = o => (!o ? 'no such chunk' : k(o) ? `${o.autocal.nEvents} event${o.autocal.nEvents === 1 ? '' : 's'}` : `gave up${o.autocal?.reason ? ': ' + o.autocal.reason : ''}`);
  const dflt = e.kernel?.source === 'fallback' ? { a: e.kernel.a, tau: e.kernel.tau } : LAB_DEFAULT;
  return [
    { source: 'own', label: 'own fit', ...(own ?? { a: null, tau: null }), detail: own ? `${e.autocal.nEvents ?? '?'} event${e.autocal.nEvents === 1 ? '' : 's'}${e.autocal.flatness != null ? `, flatness ${(100 * e.autocal.flatness).toFixed(1)}%` : ''}` : `gave up: ${e.autocal?.reason ?? e.status}` },
    { source: 'neighbour-A', label: 'neighbour A', ...(k(nb.A) ?? { a: null, tau: null }), detail: nbDetail(nb.A) },
    { source: 'neighbour-B', label: 'neighbour B', ...(k(nb.B) ?? { a: null, tau: null }), detail: nbDetail(nb.B) },
    { source: 'slice', label: 'slice, this epoch', a: sl.a?.median ?? null, tau: sl.tau?.median ?? null,
      detail: sl.used ? `from ${sl.used} kernels of ${sl.usedCells} cells (of ${sl.kernels} kernels, ${sl.cells} cells fitted in this epoch): ${sl.singleEvent} single-event, ${sl.onLimit} at a range limit, ${sl.mostlyBurst} mostly in bursts`
        : `no kernel to draw on (${sl.kernels} fitted in this epoch)`, range: sl },
    { source: 'default', label: 'default', a: dflt.a, tau: dflt.tau, detail: e.kernel?.source === 'fallback' ? "the result's fallback kernel" : "the lab's default (ROI arm)" },
    { source: 'none', label: 'no reliable kernel', a: null, tau: null, detail: '' },
  ];
}

/** Pre-selection (ADR 3ca2 decision 5): the unit's own fit when it is well determined, else nothing. */
export function preselect(e, bursts) { return wellDetermined(e, bursts) ? 'own' : null; }

/** The decision in force for each stem: its newest decision or miss record. */
export function inForce(log) {
  const m = new Map();
  for (const r of log) if ((r.kind === 'decision' || r.kind === 'miss') && r.item?.stem) {
    const prev = m.get(r.item.stem);
    if (!prev || r.time_utc >= prev.time_utc) m.set(r.item.stem, r);
  }
  return m;
}

export function newId(now = Date.now(), rand = Math.random) {
  return `${now}-${Array.from({ length: 8 }, () => Math.floor(rand() * 16).toString(16)).join('')}`;
}

/** A jsmlspike-review/1 record (docs/result-format.md in jsMLspike). Throws on an override without a reason. */
export function makeRecord(kind, fields, ctx) {
  const rec = {
    format: REVIEW_FORMAT, id: ctx.id ?? newId(), kind, time_utc: ctx.timeUtc ?? new Date().toISOString(),
    reviewer: ctx.reviewer || null, page_version: PAGE_VERSION, engine: ctx.engine ?? null, order: ctx.order ?? null, ...fields,
  };
  if (kind !== 'reveal') {
    rec.overrides = fields.overrides ?? null; rec.override_reason = fields.override_reason ?? null;
    if (rec.overrides && !(rec.override_reason && rec.override_reason.trim())) throw new Error('an override needs a reason');
    rec.note = fields.note ?? null; rec.reveals = fields.reveals ?? [];
  } else if (!(fields.reason && fields.reason.trim())) throw new Error('a reveal needs a reason');
  return rec;
}

/**
 * Bulk acceptance (ADR 3ca2 decision 5): every undecided well-determined item is accepted with its own
 * fit and marked bulk; a random one in ten (at least one) is drawn for a spot check instead, to be
 * reviewed one by one. Returns { accept, spotCheck } (arrays of index entries).
 */
export function bulkPlan(items, decided, bursts, seed) {
  const cand = items.filter(e => !decided.has(e.stem) && wellDetermined(e, bursts));
  const sh = shuffled(cand, seed ^ 0x5eed);
  const nSpot = cand.length ? Math.max(1, Math.round(cand.length / 10)) : 0;
  return { spotCheck: sh.slice(0, nSpot), accept: sh.slice(nSpot) };
}

/** Progress and estimated time left from the durations of the decisions made so far this session. */
export function progress(total, decidedCount, durationsMs) {
  const left = Math.max(0, total - decidedCount);
  const m = durationsMs.length ? median(durationsMs) : null;
  return { total, decided: decidedCount, left, etaMs: m === null ? null : left * m };
}

/** The initials on the most recent record in the decision log that has any, or ''. The log is
 *  append-only, so the last line is the latest. This is how the page remembers the reviewer: from
 *  the results folder's own log, with no browser storage (colonel_kernel's privacy rule). */
export function lastReviewer(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const r = typeof log[i]?.reviewer === 'string' ? log[i].reviewer.trim() : '';
    if (r) return r;
  }
  return '';
}

/** [lo, hi] over every finite value of several series, padded by `pad` of the span on each side;
 *  null if there is none. The review page's shared y-axis for the trace and panel B. */
export function rangeOf(seriesList, pad = 0.03) {
  let lo = Infinity, hi = -Infinity;
  for (const ys of seriesList) if (ys) for (const v of ys) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo > hi) return null;
  if (hi === lo) { const h = Math.abs(hi) * 0.05 || 0.5; return [lo - h, hi + h]; }   // a constant trace still gets a span
  const span = hi - lo;
  return [lo - pad * span, hi + pad * span];
}

/** Mean of the finite values, or null. Autocalibration divides the trace by its mean (jsMLspike
 *  autocal normalise), so panel B times this mean is in the trace's own units. */
export function meanOf(ys) {
  let s = 0, n = 0;
  for (const v of ys ?? []) if (Number.isFinite(v)) { s += v; n++; }
  return n ? s / n : null;
}

/** The single-spike response a * exp(-t / tau) of each kernel, on one shared time axis from 0 to
 *  `span` x the longest tau (at least 1 s), so the kernels on offer compare on the same scale.
 *  kernels: [{ key, a, tau }]; the ones without a finite positive a and tau are skipped. */
export function kernelCurves(kernels, { n = 200, span = 4 } = {}) {
  const ok = kernels.filter((k) => Number.isFinite(k.a) && Number.isFinite(k.tau) && k.a > 0 && k.tau > 0);
  const tMax = Math.max(1, span * Math.max(0, ...ok.map((k) => k.tau)));
  const t = Array.from({ length: n }, (_, i) => (tMax * i) / (n - 1));
  return { t, curves: ok.map((k) => ({ key: k.key, ys: t.map((x) => k.a * Math.exp(-x / k.tau)) })) };
}

/** m:ss from the start of the window (blind review shows window time only). */
export function mss(s) { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
