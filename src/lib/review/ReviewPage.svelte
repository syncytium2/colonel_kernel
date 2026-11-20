<script>
  // The review page (ADR-0054; jsMLspike ADRs f3b6, 3dfe, e18f, 3ca2). Lab-only, dev server only:
  // reached solely through the dynamic import behind import.meta.env.DEV in App.svelte. Blind: it never
  // shows a recording, ROI, treatment, group or window position unless the reviewer uses the logged
  // reveal switch. Keyboard-first: 1-7 choose, T tries, N note, Enter saves and goes to the next, ←/→ move.
  import { onMount, tick } from 'svelte';
  import Plot from '../Plot.svelte';
  import Heatmap from './Heatmap.svelte';
  import { decodeResult } from 'jsmlspike/result-format';
  import { calibEnergy, AUTOCAL_DEFAULTS } from 'jsmlspike/autocal';
  import {
    PAGE_VERSION, split, burstFlags, flagsOf, orderItems, suggestionsFor, neighbours, preselect, inForce,
    makeRecord, bulkPlan, progress, mss, wellDetermined, THRESHOLDS, lastReviewer, rangeOf, meanOf,
  } from './model.js';
  import pin from './engine-pin.json';

  // ---------------------------------------------------------------- data
  let index = $state.raw([]), problems = $state.raw([]), folder = $state(''), missingFolder = $state(false);
  let keyMap = $state.raw(new Map()), hasKey = $state(false);
  let log = $state.raw([]), logError = $state(null);
  let engineVersion = $state(null), engineError = $state(null);

  // ---------------------------------------------------------------- settings
  let view = $state('queue');                  // 'queue' | 'misses' | 'log'
  let orderMode = $state('worst-first');
  let seed = $state((Date.now() % 1e9) >>> 0);
  let excludeLimit = $state(false), excludeBurst = $state(false);
  let reviewer = $state('');
  let reviewerFromLog = $state(false);         // the initials were filled in from the decision log, not typed
  let revealedOrder = $state(false);           // reveal 'order' used this session

  const parts = $derived(split(index));
  const bursts = $derived(burstFlags(index));
  const decided = $derived(inForce(log));
  const queue = $derived(orderItems(parts.items, orderMode, seed, bursts, keyMap));
  let spotCheck = $state.raw(new Set());       // stems drawn for a bulk acceptance's spot check
  const queueSorted = $derived([...queue.filter((e) => spotCheck.has(e.stem) && !decided.has(e.stem)), ...queue.filter((e) => !(spotCheck.has(e.stem) && !decided.has(e.stem)))]);
  let pos = $state(0);
  const item = $derived(queueSorted[pos] ?? null);

  // ---------------------------------------------------------------- the open item
  let loaded = $state.raw(null);               // { stem, record, arrays, sha256 }
  let loadError = $state(null);
  const cache = new Map();                     // stem -> Promise<loaded>
  let selected = $state(null);                 // a suggestion source, or 'hand-set'
  let handA = $state(''), handTau = $state('');
  let note = $state(''), overrideReason = $state('');
  let tried = $state.raw([]);                  // { source, a, tau, n_events, n_spikes }
  let tryResult = $state.raw(null);            // the worker's last runChunk result for this item
  let trying = $state(false), saving = $state(false), saveError = $state(null);
  let reveals = $state.raw([]);                // reveal records made while this item is open
  let revealAsk = $state(null), revealReason = $state('');
  let openedAt = 0;
  let durations = $state.raw([]);
  let noteEl = $state(null);

  const suggestions = $derived(item ? suggestionsFor(item, index, bursts, seed, { excludeLimit, excludeBurst }) : []);
  const flags = $derived(item ? flagsOf(item, bursts) : []);
  const current = $derived(item ? decided.get(item.stem) ?? null : null);
  const chosen = $derived.by(() => {
    if (selected === 'hand-set') { const a = Number(handA), t = Number(handTau); return a > 0 && t > 0 ? { source: 'hand-set', a, tau: t } : null; }
    const s = suggestions.find((x) => x.source === selected);
    return s ? { source: s.source, a: s.a, tau: s.tau } : null;
  });
  const prog = $derived(progress(parts.items.length, parts.items.filter((e) => decided.has(e.stem)).length, durations));

  async function sha256(jsonText, bin) {
    const enc = new TextEncoder().encode(jsonText), all = new Uint8Array(enc.length + bin.byteLength);
    all.set(enc, 0); all.set(new Uint8Array(bin), enc.length);
    const h = await crypto.subtle.digest('SHA-256', all);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function load(stem) {
    if (!cache.has(stem)) cache.set(stem, (async () => {
      const jr = await fetch('/__review/file?name=' + encodeURIComponent(stem + '.json'));
      if (!jr.ok) throw new Error(await jr.text());
      const jsonText = await jr.text();
      const rec0 = JSON.parse(jsonText);
      const binName = Object.values(rec0.arrays ?? {})[0]?.file ?? stem + '.bin';
      const br = await fetch('/__review/file?name=' + encodeURIComponent(binName));
      const bin = br.ok ? await br.arrayBuffer() : new ArrayBuffer(0);
      const { record, arrays } = decodeResult(jsonText, () => bin);
      return { stem, record, arrays, sha256: await sha256(jsonText, bin) };
    })());
    return cache.get(stem);
  }

  $effect(() => {
    const it = item;
    if (!it) { loaded = null; return; }
    loaded = null; loadError = null; tried = []; tryResult = null; note = ''; xZoom = null; overrideReason = ''; reveals = []; saveError = null;
    selected = preselect(it, bursts); handA = ''; handTau = ''; openedAt = performance.now();
    load(it.stem).then((l) => { if (item?.stem === l.stem) loaded = l; }).catch((e) => (loadError = String(e?.message ?? e)));
    for (const nx of queueSorted.slice(pos + 1, pos + 4)) load(nx.stem).catch(() => {});   // prepare the next windows
    for (const k of [...cache.keys()]) if (!queueSorted.slice(Math.max(0, pos - 3), pos + 6).some((e) => e.stem === k)) cache.delete(k);
  });

  // ---------------------------------------------------------------- plots (window time from 0: blind)
  const t0 = $derived(loaded?.arrays.times_s ? loaded.arrays.times_s[0] : 0);
  const xs = $derived(loaded?.arrays.times_s ? Array.from(loaded.arrays.times_s, (t) => t - t0) : []);
  const traceSeries = $derived.by(() => {
    if (!loaded) return [];
    const a = loaded.arrays, s = [];
    if (a.values) s.push({ ys: Array.from(a.values), stroke: 'var(--text)', width: 1 });
    if (a.fit) s.push({ ys: Array.from(a.fit), stroke: '#2f6db5', width: 1.5 });
    if (a.drift) s.push({ ys: Array.from(a.drift), stroke: '#999', width: 1, dash: [4, 3] });
    if (tryResult?.fit) s.push({ ys: Array.from(tryResult.fit), stroke: '#e8590c', width: 1.5 });
    return s;
  });
  const spikeYs = $derived.by(() => {
    if (!loaded) return [];
    const n = xs.length, y = new Array(n).fill(0), ff = loaded.record.identity.frame_first ?? 0;
    const src = tryResult ? tryResult.events.map((e) => [e.frame, e.count]) : (loaded.record.events?.columns.jump_frame ?? []).map((f, k) => [f, loaded.record.events.columns.count[k]]);
    for (const [f, c] of src) if (f - ff >= 0 && f - ff < n) y[f - ff] = c;
    return y;
  });
  // Panel B: autocalibration's stage-2 trace (the trace over its mean, other events removed) and the
  // fits, multiplied back by that mean so B shares the trace's y-axis (the fits are linear in it).
  const panelB = $derived.by(() => {
    if (!loaded?.arrays.autocal_mod) return null;
    const rec = loaded.record, dt = rec.timing.dt_s, ff = rec.identity.frame_first ?? 0, mod = Float64Array.from(loaded.arrays.autocal_mod);
    const m = meanOf(loaded.arrays.values) ?? 1, scale = (ys) => Array.from(ys, (v) => v * m);
    const spikes = Float64Array.from((rec.autocal?.events ?? []).flatMap((e) => Array(e.count ?? 1).fill((e.frame - ff + 1) * dt)));
    const s = [{ ys: scale(mod), stroke: 'var(--text)', width: 1 }];
    if (loaded.arrays.autocal_mod_fit) s.push({ ys: scale(loaded.arrays.autocal_mod_fit), stroke: '#2f6db5', width: 1.5 });
    if (chosen?.a != null && spikes.length) {
      const fit = calibEnergy(chosen.a, chosen.tau, spikes, mod, dt, AUTOCAL_DEFAULTS.tDrift, rec.provenance.event_placement ?? 'matlab').fit;
      s.push({ ys: scale(fit), stroke: '#e8590c', width: 1.5 });
    }
    return s;
  });

  // One y-axis for both trace rows: this window's range, or a range the reviewer fixed (kept across windows)
  let yMode = $state('auto');                  // 'auto' | 'fixed'
  let yLo = $state(''), yHi = $state('');
  const yAuto = $derived(rangeOf([...traceSeries.map((s) => s.ys), ...(panelB ?? []).map((s) => s.ys)]));
  const yFixedOk = $derived(Number.isFinite(Number(yLo)) && Number.isFinite(Number(yHi)) && yLo !== '' && yHi !== '' && Number(yHi) > Number(yLo));
  const yRange = $derived(yMode === 'fixed' && yFixedOk ? [Number(yLo), Number(yHi)] : yAuto);
  function fixYHere() { if (yAuto) { yLo = yAuto[0].toPrecision(4); yHi = yAuto[1].toPrecision(4); yMode = 'fixed'; } }
  // one x-axis: drag on any row zooms all three, double-click resets; a new window starts unzoomed
  let xZoom = $state(null);

  // ---------------------------------------------------------------- try (the worker)
  let worker = null, reqId = 0;
  const pending = new Map();
  function ask(msg) { const id = ++reqId; return new Promise((res) => { pending.set(id, res); worker.postMessage({ ...msg, id }); }); }
  function chunkOf(l) {
    const r = l.record, a = l.arrays, id = r.identity;
    return {
      recording: id.recording, clock: id.clock, roi: { viewer_id: id.roi_viewer_id, archive_position: id.roi_archive_position },
      archive_variant: id.archive_variant, signal: id.signal, timestamps: a.times_s, frame_first: id.frame_first, frame_last: id.frame_last,
      source_frames: id.source_frames, values: a.signal_values, mask: a.mask,
      F0: a.f0_interface2 ?? (typeof r.f0?.value === 'number' && r.f0.method === 'interface2' ? r.f0.value : undefined),
      cleaning: (r.cleaning?.intervals ?? []).filter((c) => c.reasons?.length).map((c) => ({ frame_first: c.frame_first, frame_last: c.frame_last, reason: c.reasons[0] })),
      // the result passed R1 with its t=0 review when it was made; the rerun inherits that
      t0_review: { source: 'db4', reviewed: true, note: 'rerun of a result that passed R1' },
    };
  }
  async function tryKernel() {
    if (!chosen || chosen.a == null || !loaded?.arrays.signal_values || !worker) return;
    trying = true;
    const opt = { ...(loaded.record.provenance.options ?? {}), kernel: { a: chosen.a, tau: chosen.tau } };
    const r = await ask({ type: 'run', chunk: chunkOf(loaded), opt });
    trying = false;
    if (!r.ok || r.result.status !== 'ok') { saveError = `try failed: ${r.error ?? r.result?.message}`; return; }
    tryResult = r.result;
    tried = [...tried, { source: chosen.source, a: chosen.a, tau: chosen.tau, n_events: r.result.events.length, n_spikes: r.result.spikeTimes.length }];
  }

  // ---------------------------------------------------------------- saving
  const engine = () => ({ jsmlspike_version: engineVersion, engine_commit: pin.commit });
  const orderCtx = () => ({ mode: orderMode, seed, revealed_order: revealedOrder, switches: { exclude_limit: excludeLimit, exclude_burst: excludeBurst } });
  async function post(recs) {
    const r = await fetch('/__review/decisions', { method: 'POST', body: JSON.stringify(recs) });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    log = parseLog(text);
  }
  function parseLog(text) { return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  const itemRef = (e, sha) => ({ stem: e.stem, blind_key: blindKeyOf(e), result_sha256: sha ?? null });

  async function save() {
    if (!item || !loaded || !chosen || saving) return;
    saveError = null;
    try {
      if (current && !overrideReason.trim()) throw new Error('this window already has a decision: give a reason to override it');
      saving = true;
      const rec = makeRecord('decision', {
        item: itemRef(item, loaded.sha256), choice: { source: chosen.source, a: chosen.a, tau: chosen.tau },
        bulk: false, spot_check: spotCheck.has(item.stem), suggestions: suggestions.map(({ range, ...s }) => s),
        tried, flags, note: note.trim() || null, overrides: current?.id ?? null, override_reason: current ? overrideReason.trim() : null,
        reveals: reveals.map((r) => r.id),
      }, { reviewer, engine: engine(), order: orderCtx() });
      await post([rec]);
      durations = [...durations, performance.now() - openedAt];
      next(true);
    } catch (e) { saveError = String(e?.message ?? e); }
    saving = false;
  }
  function next(undecidedOnly = false) {
    for (let p = pos + 1; p < queueSorted.length; p++) if (!undecidedOnly || !decided.has(queueSorted[p].stem)) { pos = p; return; }
    if (pos < queueSorted.length - 1 && !undecidedOnly) pos++;
  }
  function prev() { if (pos > 0) pos--; }

  // ---------------------------------------------------------------- reveal (logged, with a reason)
  async function reveal(what) {
    if (!revealReason.trim()) { saveError = 'a reveal needs a reason'; return; }
    const rec = makeRecord('reveal', { what, reason: revealReason.trim(), item: item ? { stem: item.stem, blind_key: blindKeyOf(item) } : null },
      { reviewer, engine: engine(), order: orderCtx() });
    try { await post([rec]); } catch (e) { saveError = String(e?.message ?? e); return; }
    reveals = [...reveals, rec];
    if (what === 'order') revealedOrder = true;
    revealAsk = null; revealReason = '';
  }
  const revealedIdentity = $derived(reveals.some((r) => r.what === 'identity'));
  const revealedNb = $derived(item && (revealedOrder || reveals.some((r) => r.what === 'order')) ? neighbours(item, index, seed).realOrder : null);

  // ---------------------------------------------------------------- bulk acceptance
  let bulkConfirm = $state(null);
  function planBulk() { bulkConfirm = bulkPlan(parts.items, decided, bursts, seed); }
  async function doBulk() {
    const plan = bulkConfirm; bulkConfirm = null;
    const recs = plan.accept.map((e) => makeRecord('decision', {
      item: itemRef(e, null), choice: { source: 'own', a: e.autocal.a, tau: e.autocal.tau }, bulk: true, spot_check: false,
      suggestions: [], tried: [], flags: flagsOf(e, bursts), note: 'bulk-accepted', overrides: null, override_reason: null, reveals: [],
    }, { reviewer, engine: engine(), order: { ...orderCtx(), bulk: { accepted: plan.accept.length, spot_check: plan.spotCheck.length } } }));
    try { if (recs.length) await post(recs); } catch (e) { saveError = String(e?.message ?? e); return; }
    spotCheck = new Set([...spotCheck, ...plan.spotCheck.map((e) => e.stem)]);
    pos = 0;
  }

  // ---------------------------------------------------------------- screening misses
  async function missAction(e, action) {
    const prevRec = decided.get(e.stem);
    let reason = null;
    if (prevRec) { reason = prompt('This miss already has a decision. Reason for changing it:'); if (!reason?.trim()) return; }
    const rec = makeRecord('miss', { item: itemRef(e, null), codes: e.codes, action, overrides: prevRec?.id ?? null, override_reason: reason, note: null, reveals: [] },
      { reviewer, engine: engine(), order: orderCtx() });
    try { await post([rec]); } catch (err) { saveError = String(err?.message ?? err); }
  }

  // ---------------------------------------------------------------- the blind key shown
  let blindKeys = $state.raw(new Map());
  const blindKeyOf = (e) => keyMap.get(e.stem)?.blind_key ?? blindKeys.get(e.stem) ?? '…';
  async function computeBlindKeys(entries) {
    const m = new Map();
    for (const e of entries) {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(e.stem));
      m.set(e.stem, 'K' + [...new Uint8Array(h)].slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join(''));
    }
    blindKeys = m;
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(ev) {
    if (view !== 'queue' || revealAsk || bulkConfirm) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target?.tagName);
    // Enter in the y-scale boxes applies the scale (leaves the box), it never saves the decision
    if (ev.key === 'Enter' && ev.target?.closest?.('.yctl')) { ev.target.blur(); ev.preventDefault(); return; }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); save(); return; }
    if (typing) { if (ev.key === 'Escape') ev.target.blur(); return; }
    const keys = ['own', 'neighbour-A', 'neighbour-B', 'slice', 'default', 'none', 'hand-set'];
    if (/^[1-7]$/.test(ev.key)) { const s = keys[+ev.key - 1]; const sg = suggestions.find((x) => x.source === s); if (s === 'hand-set' || s === 'none' || sg?.a != null) selected = s; ev.preventDefault(); }
    else if (ev.key === 't' || ev.key === 'T') { tryKernel(); ev.preventDefault(); }
    else if (ev.key === 'n' || ev.key === 'N') { noteEl?.focus(); ev.preventDefault(); }
    else if (ev.key === 'ArrowRight') { next(); ev.preventDefault(); }
    else if (ev.key === 'ArrowLeft') { prev(); ev.preventDefault(); }
  }

  // ---------------------------------------------------------------- start
  async function refresh() {
    const r = await (await fetch('/__review/index')).json();
    folder = r.dir; missingFolder = r.missing; problems = r.problems ?? []; hasKey = r.key;
    index = r.entries;
    computeBlindKeys(r.entries);
    if (r.key) {
      try { const k = await (await fetch('/__review/key')).json(); keyMap = new Map((k.entries ?? []).map((e) => [e.stem, e])); } catch { keyMap = new Map(); }
    }
    try { log = parseLog(await (await fetch('/__review/decisions')).text()); } catch (e) { logError = String(e); }
    // remember the reviewer from the folder's own log (no browser storage: the privacy rule); never over typed initials
    if (!reviewer.trim()) { const r = lastReviewer(log); if (r) { reviewer = r; reviewerFromLog = true; } }
  }
  onMount(() => {
    refresh();
    try {
      worker = new Worker(new URL('./engine.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const f = pending.get(e.data.id); pending.delete(e.data.id); f?.(e.data); };
      worker.onerror = (e) => (engineError = 'the engine did not start: is CK_JSMLSPIKE_DIR set? ' + (e.message ?? ''));
      ask({ type: 'version' }).then((v) => (engineVersion = v.jsmlspike));
    } catch (e) { engineError = String(e); }
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); worker?.terminate(); };
  });

  const logRows = $derived(log.filter((r) => r.kind !== 'reveal').slice().reverse());
  let logFilter = $state('all');
  function reopen(stem) { const i = queueSorted.findIndex((e) => e.stem === stem); if (i >= 0) { pos = i; view = 'queue'; } }
  const fmt = (x, d = 4) => (x == null ? '—' : Number(x).toPrecision(d));
  // a refusal message names the source frame ("frame 4234"), which would give away the window's position
  // in the recording; blind review shows the sample within the window only
  const blindMessage = (m) => (m ?? '').replace(/\s*\(frame \d+\)/g, '').replace(/\b(\d+\.\d{4})\d+/g, '$1');
  const etaText = $derived(prog.etaMs == null ? '—' : prog.etaMs > 3600e3 ? `${(prog.etaMs / 3600e3).toFixed(1)} h` : `${Math.round(prog.etaMs / 60e3)} min`);
</script>

<div class="review">
  <aside class="rail">
    <h2>Review inferred events</h2>
    <p class="lab">LAB · dev server only · blind</p>
    {#if missingFolder}
      <p class="err">No results folder ({folder}). Set CK_REVIEW_DIR to a folder of jsMLspike results.</p>
    {:else}
      <p class="muted">{index.length} results · {parts.items.length} to review · {parts.misses.length} screening misses{hasKey ? ' · key file present' : ''}</p>
    {/if}
    {#if engineError}<p class="err">{engineError}</p>{:else}<p class="muted">engine jsMLspike {engineVersion ?? '…'} @ {pin.commit.slice(0, 7)}</p>{/if}
    {#each problems as p}<p class="err">{p}</p>{/each}

    <div class="views">
      <button class:on={view === 'queue'} onclick={() => (view = 'queue')}>Review</button>
      <button class:on={view === 'misses'} onclick={() => (view = 'misses')}>Screening misses ({parts.misses.length})</button>
      <button class:on={view === 'log'} onclick={() => (view = 'log')}>Review the review</button>
    </div>

    <label>order
      <select bind:value={orderMode} onchange={() => (pos = 0)}>
        <option value="worst-first">worst first</option><option value="priority">priority</option>
        <option value="datecode">datecode</option><option value="random">random</option>
      </select>
    </label>
    <label>seed <input type="number" bind:value={seed} onchange={() => (pos = 0)} style="width:8em" /></label>
    <p class="muted small">Nothing is filtered out. Windows of one ROI are shuffled{revealedOrder ? ' (order revealed this session)' : ''}.</p>
    <label class="chk"><input type="checkbox" bind:checked={excludeLimit} /> slice: exclude range-limit kernels</label>
    <label class="chk"><input type="checkbox" bind:checked={excludeBurst} /> slice: exclude kernels resting mostly on burst events</label>

    <label>reviewer <input type="text" bind:value={reviewer} oninput={() => (reviewerFromLog = false)} placeholder="initials" style="width:6em" /></label>
    {#if reviewerFromLog}
      <p class="muted small">From the last decision saved in this folder. Not you? Type your initials.</p>
    {:else if !reviewer.trim()}
      <p class="muted small">Type your initials once; they are saved with each decision and filled in next time.</p>
    {/if}

    <div class="progress">
      <b>{prog.decided}</b> of {prog.total} decided · {prog.left} left · ETA {etaText}
      <div class="bar"><div style={`width:${prog.total ? (100 * prog.decided) / prog.total : 0}%`}></div></div>
    </div>

    <button onclick={planBulk}>Bulk-accept well-determined units…</button>
    <button onclick={() => (revealAsk = 'identity')} disabled={!item}>Reveal identity…</button>
    <button onclick={() => (revealAsk = 'order')}>Reveal window order…</button>
    <p class="muted small">Keys: 1–7 choose · T try · N note · Enter save &amp; next · ←/→ move</p>
  </aside>

  <section class="main">
    {#if revealAsk}
      <div class="modal">
        <b>Reveal {revealAsk === 'identity' ? "this window's identity" : 'the real window order'}?</b> Every reveal is logged with its reason.
        <input type="text" bind:value={revealReason} placeholder="reason (required)" />
        <button onclick={() => reveal(revealAsk)}>Reveal and log</button> <button onclick={() => (revealAsk = null)}>Cancel</button>
      </div>
    {/if}
    {#if bulkConfirm}
      <div class="modal">
        <b>Bulk acceptance.</b> {bulkConfirm.accept.length + bulkConfirm.spotCheck.length} undecided units are well determined
        (own fit, 2+ events, not on a limit, flatness ≥ {100 * THRESHOLDS.flat}%, not mostly on burst events; provisional).
        {bulkConfirm.accept.length} will be accepted with their own fit and marked bulk-accepted; {bulkConfirm.spotCheck.length},
        drawn at random (1 in 10), go to the front of the queue for a spot check.
        <button onclick={doBulk} disabled={!bulkConfirm.accept.length && !bulkConfirm.spotCheck.length}>Accept</button>
        <button onclick={() => (bulkConfirm = null)}>Cancel</button>
      </div>
    {/if}
    {#if saveError}<p class="err">{saveError}</p>{/if}

    {#if view === 'queue'}
      {#if !item}
        <p class="muted">Nothing to review.</p>
      {:else}
        <header class="facts">
          <span class="big">item {pos + 1} / {queueSorted.length}</span>
          <span>key <b>{blindKeyOf(item)}</b></span>
          <span>window 0:00–{mss(((item.identity.n_frames ?? 1) - 1) * (item.dt ?? 0.1))}</span>
          {#if spotCheck.has(item.stem)}<span class="tag">spot check</span>{/if}
          <span>autocalibration: {item.autocal?.ok ? `fitted on ${item.autocal.nEvents} event${item.autocal.nEvents === 1 ? '' : 's'}` : `gave up (${item.autocal?.reason ?? item.status})`}</span>
          {#each flags as f}<span class="flag">⚠ {f.replaceAll('-', ' ')}</span>{/each}
          {#if item.autocal?.flatness != null}<span>flatness {(100 * item.autocal.flatness).toFixed(1)}%</span>{/if}
          {#if current}<span class="tag">decided: {current.choice?.source ?? current.action}{current.bulk ? ' (bulk)' : ''}</span>{/if}
          {#if revealedIdentity}
            <span class="reveal">REVEALED: {item.identity.recording} · ROI {item.identity.roi_viewer_id} · frames {item.identity.frame_first}–{item.identity.frame_last}
              {#if keyMap.get(item.stem)} · {keyMap.get(item.stem).window_name ?? ''} (position {keyMap.get(item.stem).window_position ?? '?'}) · {keyMap.get(item.stem).treatment ?? ''} · {keyMap.get(item.stem).group ?? ''}{/if}</span>
          {/if}
        </header>
        {#if loadError}<p class="err">{loadError}</p>{/if}
        {#if loaded}
          <div class="band">
            <div class="yctl">
              <span>y scale (both traces):</span>
              <label class="chk"><input type="radio" bind:group={yMode} value="auto" /> this window</label>
              <label class="chk"><input type="radio" bind:group={yMode} value="fixed" /> fixed</label>
              <input type="number" step="any" bind:value={yLo} oninput={() => (yMode = 'fixed')} placeholder="min" aria-label="y min" />
              to <input type="number" step="any" bind:value={yHi} oninput={() => (yMode = 'fixed')} placeholder="max" aria-label="y max" />
              <button onclick={fixYHere} title="fix the scale at this window's range, and keep it for the next windows">fix at this window's range</button>
              {#if yMode === 'fixed' && !yFixedOk}<span class="err small">min must be below max (showing this window's range)</span>{/if}
              <span class="muted small">drag on a trace to zoom time; double-click to reset</span>
            </div>
            <div class="cap">A · the trace MLspike received · <span style="color:#2f6db5">fit</span> · <span style="color:#999">drift</span>{#if tryResult} · <span style="color:#e8590c">tried kernel</span>{/if}</div>
            {#key traceSeries.length}
              <Plot axisColor="var(--text-h)" gridColor="var(--border)" {xs} seriesList={traceSeries} height={200} yAxisSize={56} padRight={16} showXAxis={false} syncKey="review"
                {yRange} xRange={xZoom} zoomable dblClickReset onZoom={(a, b) => (xZoom = a == null ? null : [a, b])} />
            {/key}
            <div class="cap">B · the same trace with the other events removed, as autocalibration fitted it ·
              <span style="color:#2f6db5">fit at its own kernel</span>{#if chosen?.a != null} · <span style="color:#e8590c">fit at the chosen kernel</span>{/if}</div>
            {#if panelB}
              {#key panelB.length}
                <Plot axisColor="var(--text-h)" gridColor="var(--border)" {xs} seriesList={panelB} height={200} yAxisSize={56} padRight={16} showXAxis={false} syncKey="review"
                  {yRange} xRange={xZoom} zoomable dblClickReset onZoom={(a, b) => (xZoom = a == null ? null : [a, b])} />
              {/key}
            {:else}<p class="muted nob">autocalibration did not reach this step, so there is no B for this window</p>{/if}
            <!-- no yLabel here: a y-axis title widens this plot's left gutter only, which shifts its time axis against A and B -->
            <div class="cap">inferred spikes{tryResult ? ' with the tried kernel' : ''} (height = spikes in that frame) · {spikeYs.reduce((s, c) => s + c, 0)} in this window</div>
            {#key !!tryResult}
              <Plot axisColor="var(--text-h)" gridColor="var(--border)" {xs} ys={spikeYs} kind="stems" color={tryResult ? '#e8590c' : '#2f6db5'} height={140} yAxisSize={56} padRight={16} syncKey="review"
                xLabel="window time (s)" yRange={[0, Math.max(1, ...spikeYs)]} barSize={[0.6, 3]}
                xRange={xZoom} zoomable dblClickReset onZoom={(a, b) => (xZoom = a == null ? null : [a, b])} />
            {/key}
          </div>
          <div class="band pair">
            <div>
              <div class="cap">C · how well each kernel fits trace B (● own fit, ○ chosen)</div>
              {#if loaded.arrays.autocal_surface}
                <Heatmap surface={loaded.arrays.autocal_surface} aAxis={loaded.record.autocal.surface_a} tauAxis={loaded.record.autocal.surface_tau}
                  own={item.autocal?.ok ? { a: item.autocal.a, tau: item.autocal.tau } : null} chosen={chosen} capPct={THRESHOLDS.surfaceCapPct} />
              {:else}<p class="muted">no surface (autocalibration gave up)</p>{/if}
            </div>
            <div class="howto small">
              <b>Reading C.</b> Each square is one kernel: amplitude <i>a</i> across, decay τ up. Its colour is how much worse
              that kernel fits trace B than the best one does: dark blue fits as well as the best, pale yellow is
              {THRESHOLDS.surfaceCapPct}% worse or more.
              <ul>
                <li><b>A small dark spot</b> around ●: the data pin the kernel down. Trust the own fit.</li>
                <li><b>A large dark area</b>, or a dark streak: many kernels fit about as well; the data barely choose.
                  A neighbour's or the slice's kernel is as defensible as the own fit.</li>
                <li><b>● on the edge</b>: the best fit wanted to go past the allowed range.</li>
              </ul>
              A streak running diagonally means <i>a</i> and τ trade off: a bigger, faster event fits about as well as a
              smaller, slower one.
            </div>
          </div>

          <div class="choose">
            <div class="cap">Choose a kernel — each is a suggestion; the choice is saved with its source</div>
            {#each suggestions as s, k}
              <label class:dim={s.a == null && s.source !== 'none'}>
                <input type="radio" name="k" value={s.source} bind:group={selected} disabled={s.a == null && s.source !== 'none'} />
                <kbd>{k + 1}</kbd> {s.label}{#if revealedNb && (s.source === 'neighbour-A' || s.source === 'neighbour-B')} <i>({revealedNb[s.source.slice(-1)] ?? 'none'})</i>{/if}
                {#if s.a != null}<span class="num">a {fmt(s.a, 3)} · τ {fmt(s.tau, 3)} s</span>{/if}
                {#if s.source === 'slice' && s.range?.a}<span class="num">a [{fmt(s.range.a.min, 2)}–{fmt(s.range.a.max, 2)}] · τ [{fmt(s.range.tau.min, 2)}–{fmt(s.range.tau.max, 2)}]</span>{/if}
                <span class="muted">{s.detail}</span>
              </label>
            {/each}
            <label>
              <input type="radio" name="k" value="hand-set" bind:group={selected} /> <kbd>7</kbd> hand-set by reviewer
              a <input type="number" step="0.001" bind:value={handA} style="width:6em" onfocus={() => (selected = 'hand-set')} />
              τ (s) <input type="number" step="0.05" bind:value={handTau} style="width:5em" onfocus={() => (selected = 'hand-set')} />
            </label>
            <div class="actions">
              <button onclick={tryKernel} disabled={!chosen || chosen.a == null || trying || !!engineError}>{trying ? 'trying…' : 'Try (T)'}</button>
              {#each tried as t}<span class="muted small">tried {t.source} a {fmt(t.a, 3)} τ {fmt(t.tau, 3)}: {t.n_events} events, {t.n_spikes} spikes</span>{/each}
            </div>
            <input bind:this={noteEl} class="note" type="text" bind:value={note} placeholder="note (N)" />
            {#if current}<input class="note" type="text" bind:value={overrideReason} placeholder="reason for overriding the decision in force (required)" />{/if}
            <div class="actions">
              <button class="save" onclick={save} disabled={!chosen || saving}>{saving ? 'saving…' : 'Save & next (Enter)'}</button>
              <button onclick={prev}>← previous</button> <button onclick={() => next()}>skip →</button>
            </div>
          </div>
        {:else if !loadError}<p class="muted">loading…</p>{/if}
      {/if}

    {:else if view === 'misses'}
      <h3>Screening misses: {parts.misses.length}</h3>
      <p class="muted">Refused before inference; they should have been caught upstream (ADR 3ca2). Default action: send back upstream, into the artifact register.</p>
      <table>
        <thead><tr><th>key</th><th>refusal</th><th>measured</th><th>decision</th><th></th></tr></thead>
        <tbody>
          {#each parts.misses as e}
            {@const d = decided.get(e.stem)}
            <tr>
              <td>{blindKeyOf(e)}</td><td>{e.codes.join(', ')}</td><td class="small">{blindMessage(e.message)}</td>
              <td>{d ? d.action : '—'}</td>
              <td><button onclick={() => missAction(e, 'send-back')}>send back upstream</button> <button onclick={() => missAction(e, 'leave-out')}>leave out</button></td>
            </tr>
          {/each}
        </tbody>
      </table>

    {:else}
      <h3>Review the review: {logRows.length} records</h3>
      <p class="muted">Nothing is edited or deleted here. Reopen a window to change its decision; the change is a new record that names the one it replaces, with a reason.</p>
      <label>show
        <select bind:value={logFilter}>
          <option value="all">all</option><option value="inforce">decisions in force</option><option value="bulk">bulk-accepted</option>
          <option value="override">overrides</option><option value="miss">screening misses</option>
        </select>
      </label>
      <table>
        <thead><tr><th>time (UTC)</th><th>key</th><th>kind</th><th>choice</th><th>a</th><th>τ</th><th>reviewer</th><th>note</th><th></th></tr></thead>
        <tbody>
          {#each logRows.filter((r) => logFilter === 'all' || (logFilter === 'inforce' && decided.get(r.item?.stem)?.id === r.id) || (logFilter === 'bulk' && r.bulk) || (logFilter === 'override' && r.overrides) || (logFilter === 'miss' && r.kind === 'miss')) as r}
            <tr class:superseded={decided.get(r.item?.stem)?.id !== r.id}>
              <td class="small">{r.time_utc.slice(0, 19).replace('T', ' ')}</td><td>{r.item?.blind_key}</td><td>{r.kind}{r.bulk ? ' (bulk)' : ''}{r.spot_check ? ' (spot check)' : ''}</td>
              <td>{r.choice?.source ?? r.action}</td><td>{fmt(r.choice?.a, 3)}</td><td>{fmt(r.choice?.tau, 3)}</td><td>{r.reviewer ?? ''}</td>
              <td class="small">{r.override_reason ? `override: ${r.override_reason}` : r.note ?? ''}</td>
              <td>{#if r.kind === 'decision'}<button onclick={() => reopen(r.item.stem)}>reopen</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .review { display: flex; gap: 16px; align-items: flex-start; padding: 8px 12px; color: var(--text); }
  .rail { flex: 0 0 260px; display: flex; flex-direction: column; gap: 8px; border: 2px dashed var(--border); padding: 10px; border-radius: 6px; position: sticky; top: 8px; }
  .rail h2 { margin: 0; font-size: 1.05rem; color: var(--text-h); }
  .lab { margin: 0; font-size: 0.75rem; letter-spacing: 0.05em; color: #b5651d; }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; font-size: 0.9rem; }
  .big { font-size: 1.1rem; font-weight: 600; color: var(--text-h); }
  .flag { color: #b5651d; } .tag { background: var(--border); border-radius: 4px; padding: 0 6px; }
  .reveal { background: #fff3bf; color: #5c3c00; padding: 0 6px; border-radius: 4px; }
  .band { border: 1px solid var(--border); border-radius: 6px; padding: 6px; }
  .pair { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; } .half { flex: 1 1 0; min-width: 0; }
  .howto { flex: 1 1 280px; max-width: 46em; line-height: 1.4; } .howto ul { margin: 4px 0; padding-left: 1.2em; }
  .yctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.85rem; margin-bottom: 6px; }
  .yctl input[type='number'] { width: 7em; }
  .nob { margin: 4px 0 8px 56px; }
  .cap { font-size: 0.8rem; color: var(--text-h); margin-bottom: 4px; }
  .choose { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
  .choose label { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .dim { opacity: 0.5; } .num { font-variant-numeric: tabular-nums; }
  kbd { border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-size: 0.75rem; }
  .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .note { width: 100%; }
  .save { font-weight: 600; }
  .muted { color: var(--text); opacity: 0.7; margin: 0; } .small { font-size: 0.78rem; }
  .err { color: #c92a2a; margin: 0; }
  .views { display: flex; flex-direction: column; gap: 4px; } .views .on { font-weight: 600; outline: 2px solid var(--accent); }
  .progress .bar { height: 6px; background: var(--border); border-radius: 3px; margin-top: 4px; } .progress .bar div { height: 6px; background: var(--accent); border-radius: 3px; }
  .chk { font-size: 0.85rem; }
  .modal { border: 2px solid var(--accent); border-radius: 6px; padding: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  table { border-collapse: collapse; font-size: 0.85rem; } td, th { border-bottom: 1px solid var(--border); padding: 3px 8px; text-align: left; }
  .superseded { opacity: 0.5; }
</style>
