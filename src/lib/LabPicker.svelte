<script>
  // DEV-ONLY (ADR-0048). Reached exclusively through a dynamic import behind
  // `import.meta.env.DEV`, so this module is never referenced from a production build and
  // Rollup never emits a chunk for it. Do not add a static import of this file anywhere —
  // that would pull it into the shipped bundle and defeat the whole arrangement.
  //
  // Lists the local, gitignored exports/ folder (served by the serve-only Vite plugin in
  // vite.config.js) and hands the chosen file to Tab 2 through the SAME handleFiles path a
  // dropped file takes. Loading by a route the real UI does not use would make this a second
  // ingest path that could drift from the one users exercise; it is a shortcut to the
  // dialog, not a shortcut around the loader.

  // `current` = the filename Tab 2 actually has loaded. The select is driven from THAT, not
  // from a local selection: loading swaps Tab 2 from the dropzone branch to the rail branch,
  // which destroys this component and mounts a fresh one, so instance-local state is gone by
  // the time the load finishes. Deriving from the parent also keeps the control honest when
  // the recording arrives by some other route (drop, dialog, Tab 1 handoff).
  let { onpick, current = '' } = $props();

  let files = $state([]);
  let missing = $state(false);
  let error = $state(null);
  let busy = $state(false);

  let selected = $derived(files.includes(current) ? current : '');

  async function refresh() {
    try {
      const r = await fetch('/__lab/recordings');
      const j = await r.json();
      files = j.files;
      missing = j.missing;
    } catch (e) {
      error = String(e?.message ?? e);
    }
  }
  refresh();

  async function pick(name) {
    if (!name) return;
    busy = true;
    error = null;
    try {
      const r = await fetch('/__lab/file?name=' + encodeURIComponent(name));
      if (!r.ok) throw new Error(await r.text());
      // A real File, so handleFiles takes the identical branch a dropped file does
      // (.text() for CSV, .arrayBuffer() for xlsx) with no lab-specific special-casing.
      onpick(new File([await r.blob()], name));
    } catch (e) {
      error = String(e?.message ?? e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="lab">
  <span class="tag">lab</span>
  {#if missing}
    <span class="note">no <code>exports/</code> folder here</span>
  {:else}
    <select
      aria-label="Load a recording from the local exports folder (dev only)"
      value={selected}
      disabled={busy || !files.length}
      onchange={(e) => pick(e.currentTarget.value)}
    >
      <option value="">{files.length ? `${files.length} local recordings…` : 'reading…'}</option>
      {#each files as f (f)}
        <option value={f}>{f.replace(/\.(csv|xlsx)$/i, '')}</option>
      {/each}
    </select>
  {/if}
  {#if error}<span class="err" title={error}>{error}</span>{/if}
</div>

<style>
  /* Deliberately unlike the rest of the rail: this control does not exist in the app real
     users get, and it should never be mistaken for something that does. */
  .lab {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 6px 9px;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 7px,
      color-mix(in srgb, var(--border) 22%, transparent) 7px,
      color-mix(in srgb, var(--border) 22%, transparent) 14px
    );
  }
  .tag {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-h);
    opacity: 0.7;
  }
  select {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    font-size: 11px;
    padding: 3px 5px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
  }
  .note,
  .err {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-h);
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .err {
    color: var(--danger, #b4232a);
    opacity: 1;
  }
</style>
