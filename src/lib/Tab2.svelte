<script>
  // Tab 2 — the flagship (FOUNDATIONS §2). SINGLE-COLUMN SLICE VIEWER: the verified
  // single-ROI readout, fanned behind a column selector so every ROI column in a
  // recording can be read one slice at a time (§4). This is assembly over a proven
  // core — no recovery math lives here.
  //
  // Per slice it shows, for the SELECTED recovery method:
  //   • the four §3 checks as raw-number readouts (ADR-0011: machinery gated, fit
  //     reported — NO rollup verdict);
  //   • the recovered kernel + STA overlaid on one shared zero-lag origin (ADR-0009),
  //     with the ADR-0024 amplitude-axis toggle (shared-y default / normalized opt-in);
  //   • the reconstruction (density ⊛ recovered kernel) vs the actual dF/F₀;
  //   • the ADR-0025 indicator facts (τ-railed, peak-at-boundary) — facts, never verdicts.
  //
  // Two recovery methods are reachable (ADR-0021): free-vector (method 1, regularized
  // LSQ) and constrained-parametric (method 2, double-exponential). Their spread is the
  // diagnostic; the human reads it (ADR-0014 / ADR-0018).
  import Plot from './Plot.svelte';
  import Shell from './Shell.svelte';
  import { downloadTemplateXlsx, downloadTemplateCsv } from './template-download.js';
  import {
    loadCsv,
    rasterize,
    nextPow2,
    recoverKernel,
    deconvolveCircular,
    circularConvolve,
    kernelDiagnostics,
    preZeroBaselineMean,
    spikeTriggeredAverage,
    recoverKernelParametric,
    reconstructParametric,
    recoverKernelShaped,
    recoverRegion,
    tauRailed,
    peakAtBoundary,
    normalizeUnitPeak,
    rebinCounts,
    addAWGN,
    sigmaForLevel,
    mulberry32,
    mixApIndependent,
  } from './core/index.js';
  import methodsSvg from './assets/methods_explainer.svg?url'; // "About the methods" modal (data-safe explainer)
  import { LAMBDA_EXPLAINER_URL } from './methods-url.js'; // "?" beside the λ slider
  // Per-recording summary + Save-as-PDF (summaries & export, Phase 1). The builder is
  // SheetJS-free (region helpers are injected via xlsxApi), so importing it here does
  // NOT pull SheetJS into the main chunk (FOUNDATIONS §6 code-split).
  import SummaryReport from './SummaryReport.svelte';
  import { buildRecordingSummary } from './core/recording-summary.js';

  // Shared plot-width preference from App (2026-07-03 layout unification): false =
  // capped (1600px), true = full-bleed. Was the old `main.wide` cap; now driven by
  // the shared nav-row toggle so both tabs obey one control.
  //
  // `handoff` = a synthetic recording pushed from Tab 1 (FOUNDATIONS §11.3 cross-tab
  // flow): { id, csv, label, sourceKernel }. Each distinct `id` is loaded through the
  // SAME loadCsv path a file uses, exactly once (see the guarded $effect below). A file
  // the user drops does NOT change the id, so it is never re-clobbered; a fresh Tab 2
  // entry carries a new id and reloads the current Tab 1 signal.
  let {
    wide = false,
    handoff = null,
    // AP-independent calcium (FOUNDATIONS §3, modeled on _80 ROI 1): 0 = the loaded trace as
    // it is, every event assumed kernel-explained; 1 = a trace whose calcium the spike train
    // cannot account for at all. GLOBAL and set from the strip above the tabs (ADR-0050) —
    // this tab applies it to whatever is loaded, so the cost of a known violation is measured
    // on THIS recording's §3 checks rather than argued in the abstract. The Tab 1 handoff
    // arrives UNCONTAMINATED for that reason: the events are placed here, once.
    // A what-if dial, never a correction.
    apIndepMix = 0,
  } = $props();

  // Pipeline constants — match the validated lab driver / machinery check.
  // User-settable kernel + STA windows (2026-07-03). Were consts WIN=5 / staWinS=2; now state so
  // the recovered-kernel and STA extents can be dialed. Kernel default ±5 s, STA default ±1 s.
  let winS = $state(5); // kernel half-window (s); windowSamples = round(winS/dt) (ADR-0004)
  let staWinS = $state(1); // STA half-window (s)
  let rasterMode = $state('binned'); // spike raster display: 'binned' counts | 'raw' spike times
  const STABASE = 0.5; // STA per-event pre-spike baseline window (s)
  const NOISE_SEED = 20240; // reproducible noise realization for the selected ROI

  // Regularization slider is LOG-λ over the canon-characterized sweep 0.002–3 (ADR-0004).
  const LAM_LO = 0.002;
  const LAM_HI = 3.0;
  const LOG_LO = Math.log10(LAM_LO);
  const LOG_HI = Math.log10(LAM_HI);
  const NSWEEP = 13; // stability sweep points (geometric, 0.002→3)

  // Spike-histogram review window (DISPLAY ONLY — never feeds recovery). Default 1.0 s
  // (burst review); minimum is the frame dt (then the histogram = the §13 recovery input);
  // max 5 s for a coarse overview.
  const HIST_WIN_DEFAULT = 1.0;
  const HIST_WIN_MAX = 5.0;

  // Shared plot-area right padding (px). uPlot only auto-reserves a right gutter
  // when an x-axis is shown; the reconstruction band hides its x-axis while the
  // raster shows one, so without a pinned value their right edges (and thus the
  // shared recording-time x) shear apart. Pinning both to one value forces
  // identical right edges — the ADR-0026 co-registration lock. Must exceed the
  // widest last x-tick label's right overhang (~25px for "1,100") so nothing clips.
  const PLOT_PAD_R = 32;

  // ADR-0027 region color identity — Okabe-Ito, colorblind-safe (the family used in the
  // lab's R work). v1 cap: ≤4 metadata regions, so no cycling/interpolation. ONE hue per
  // region, carried everywhere: background band shading, the region's kernel, its STA.
  // (Assignment order is PROVISIONAL — easy to reorder after Tony's first read.)
  const REGION_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#D55E00']; // orange / sky / green / vermillion
  const regionColor = (i) => REGION_COLORS[i % REGION_COLORS.length];
  /** Hex (#rrggbb) → rgba() string at the given alpha — for the low-alpha band shading. */
  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  let recording = $state(null); // LoadedRecording (xlsx, has .regions) or LoadedRegion (csv) — the loaded file
  let xlsxApi = $state(null); // load-xlsx fns stashed after dynamic import (keeps SheetJS code-split, §6)

  // --- input template offered on the empty dropzone (ADR-0019 §5) ---
  // Same files Tab 0 hands out; the shared module is the single source so the two can
  // never drift. The xlsx writer is dynamically imported inside it, so SheetJS stays
  // code-split even when the template is offered on a tab that has not loaded a file.
  let tplXlsx = $state('idle');
  let tplError = $state(null);
  async function getTemplateXlsx() {
    if (tplXlsx === 'working') return;
    tplXlsx = 'working';
    tplError = null;
    try {
      await downloadTemplateXlsx();
    } catch (e) {
      tplError = String(e && e.message ? e.message : e);
    }
    tplXlsx = 'idle';
  }
  async function getTemplateCsv() {
    tplError = null;
    try {
      await downloadTemplateCsv();
    } catch (e) {
      tplError = String(e && e.message ? e.message : e);
    }
  }

  // --- per-recording summary + Save-as-PDF (summaries & export, Phase 1) ---
  let showSummary = $state(false);
  let summary = $state(null);
  let summaryBusy = $state(false);
  let summaryError = $state(null);
  async function openSummary() {
    if (!recording || !xlsxApi) return; // xlsx (with regions) only — the summary is per-region
    showSummary = true;
    summary = null;
    summaryError = null;
    summaryBusy = true;
    // Let the "building…" overlay paint before the heavy recovery (all ROIs × regions × 3 methods + STA).
    await new Promise((r) => setTimeout(r, 30));
    try {
      summary = buildRecordingSummary(recording, { xlsx: xlsxApi });
    } catch (e) {
      summaryError = String(e && e.message ? e.message : e);
    } finally {
      summaryBusy = false;
    }
  }
  function closeSummary() {
    showSummary = false;
  }
  let error = $state(null);
  let fileName = $state('');
  let dragging = $state(false);

  let lambdaLog = $state(LOG_LO); // log10(λ); default λ = 0.002 (sweep floor / UI default)
  let noiseLevel = $state(0); // × cohort-typical σ, 0–10, default 0/off (ADR-0015)
  const lambda = $derived(10 ** lambdaLog);

  // ADR-0035 region-protocol windowing — user-adjustable (minutes); defaults mirror
  // the bus-contract-v1.1 constants (2 / 12 / 20 min). Fed to windowRegion(protocol).
  let solutionDelayMin = $state(2); // treatment wash-in trim (baseline: none)
  let regionMinMin = $state(12); // duration floor → flag, never drop
  let regionMaxMin = $state(20); // analysis-window cap (baseline + treatment)
  const protocolOpts = $derived({
    protocol: true,
    solutionDelayS: solutionDelayMin * 60,
    regionMinS: regionMinMin * 60,
    regionMaxS: regionMaxMin * 60,
  });

  // --- slice-viewer state ---
  let selectedCol = $state(0); // which ROI column (0 = the expected target, §4)
  let method = $state('free'); // 'free' (ADR-0004) | 'parametric' (ADR-0021 m2) | 'shaped' (ADR-0021 m3 / ADR-0023)
  let showMethods = $state(false); // "About the methods" explainer modal
  let overlayMode = $state('shared'); // 'shared' (default) | 'normalized' (ADR-0024)
  let showRailed = $state(false); // ADR-0025: reveal default-hidden railed-parametric output
  let histWinS = $state(HIST_WIN_DEFAULT); // spike-histogram review window (s), display only
  let advancedOpen = $state(false); // ADR-0026: λ/noise live in a default-collapsed Advanced fold (§11.1)
  let settingsOpen = $state(true); // ADR-0028: Settings is a collapsible fold (rail density)
  let zoomRange = $state(null); // ADR-0026 view-only x-zoom: [min,max] recording-time s, or null = full

  // ADR-0028 — regional-only recovery, zoom-driven region selection (no Mode toggle).
  // currentRegionIdx = the zoom-selected current region (null = full view, no current). A
  // single-region recording is always current via effectiveCurrentIdx.
  let currentRegionIdx = $state(null); // zoom-selected current region; null = full view, no current (ADR-0028 §2)
  let bandMode = $state('all'); // kernel band: 'all' (every region's kernel+STA) | 'current' (current region alone)

  async function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    fileName = file.name;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // ADR-0019 xlsx path. SheetJS stays in its own code-split chunk (FOUNDATIONS §6); we
        // stash the (SheetJS-free) windowing fns so the reactive view-mode deriveds can call
        // them synchronously without statically importing the SheetJS module.
        const mod = await import('./core/load-xlsx.js');
        const rec = mod.loadWorkbook(await file.arrayBuffer(), { source: file.name });
        xlsxApi = mod;
        recording = rec;
        clearSourceKernel();
        resetSlice();
        // ADR-0022: a fully silent recording (no APs) is surfaced by the displayAnalyzable
        // guard below as the single-file no-AP message — not fit, not an error.
        error = null;
        return;
      }
      const text = await file.text();
      xlsxApi = null;
      recording = loadCsv(text, { source: file.name });
      clearSourceKernel();
      resetSlice();
      error = null;
    } catch (e) {
      error = String(e && e.message ? e.message : e);
      recording = null;
    }
  }

  // DEV-ONLY lab picker (ADR-0048): load straight from the local exports/ folder instead of
  // walking the file dialog every iteration. This dynamic import is the ONLY reference to
  // LabPicker.svelte anywhere — with `import.meta.env.DEV` substituted to `false` at build
  // time the branch is dead code, so Rollup emits no chunk and dist/ carries no trace of the
  // component, the endpoints, or the folder. `npm run lab-check` enforces exactly that.
  let LabPicker = $state(null);
  if (import.meta.env.DEV) import('./LabPicker.svelte').then((m) => (LabPicker = m.default));

  function resetSlice() {
    selectedCol = 0;
    method = 'free';
    showRailed = false;
    histWinS = HIST_WIN_DEFAULT;
    zoomRange = null;
    currentRegionIdx = null;
  }

  // Tab 1 → Tab 2 handoff (FOUNDATIONS §11.3). Load each distinct handoff (by monotonic id)
  // exactly once, through the same CSV path a file uses. Guarding on the id — not clearing the
  // prop — means a recording the user then drops (which does NOT bump the id) is never reloaded
  // over, and a fresh Tab 2 entry (new id) reliably reloads the current Tab 1 signal.
  let lastHandoffId = -1;
  // The ground-truth kernel that generated the handoff (Tab 1's kernel on the lag axis), for the
  // source-vs-recovered overlay. null for a real file load (no ground truth). ADR-0034.
  let sourceKernel = $state(null);
  $effect(() => {
    if (!handoff || handoff.id === lastHandoffId) return;
    lastHandoffId = handoff.id;
    try {
      xlsxApi = null;
      recording = loadCsv(handoff.csv, { source: handoff.label });
      fileName = handoff.label;
      sourceKernel = handoff.sourceKernel ?? null;
      resetSlice();
      error = null;
    } catch (e) {
      error = String(e && e.message ? e.message : e);
      recording = null;
    }
  });
  // A dropped file has no ground truth — clear any stale source overlay from a prior handoff.
  function clearSourceKernel() {
    sourceKernel = null;
  }

  // View-only x-zoom (ADR-0026). The parent owns the displayed range and feeds it to BOTH
  // recording-time bands (xView). A DRAG (min/max) is a manual zoom and leaves the current
  // region untouched; a SINGLE-CLICK reset (min == null) returns to full view AND clears the
  // current region — back to the all-regions/no-current default (ADR-0028 §2).
  function handleZoom(min, max) {
    if (min == null) {
      zoomRange = null;
      currentRegionIdx = null;
    } else {
      zoomRange = [min, max];
    }
  }

  // ADR-0028 zoom-driven region selection: double-click a region → zoom the view to its
  // boundaries AND make it the CURRENT region (its §3/kernel become regional, it bolds in the
  // band). Double-click off any region resets to full view / no current. View-only on the
  // trace; recovery follows the current region (§1-3), never a whole-signal kernel.
  function handleRegionDblClick(dataX) {
    const idx = metaRegions.findIndex((rg) => dataX >= rg.startS && dataX <= rg.endS);
    if (idx >= 0 && xRange) {
      currentRegionIdx = idx;
      const r = metaRegions[idx];
      zoomRange = [Math.max(r.startS, xRange[0]), Math.min(r.endS, xRange[1])];
    } else {
      currentRegionIdx = null;
      zoomRange = null;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer?.files);
  }

  // --- ADR-0028 region model: regional-only recovery, DISPLAY decoupled from RECOVERY ---
  // metaRegions = the recording's REAL metadata regions (xlsx). For CSV / no-metadata we
  // synthesize ONE implicit region spanning the whole recording — the single-region boundary
  // case where whole == regional (FOUNDATIONS §3 / ADR-0028 §5).
  const metaRegions = $derived(recording && recording.regions ? recording.regions : []);
  const hasRegions = $derived(metaRegions.length > 0); // TRUE metadata regions (shading / dbl-click)
  const regions = $derived(
    metaRegions.length
      ? metaRegions
      : recording
        ? [{ name: 'recording', startS: recording.meta.t0, endS: recording.meta.tEnd }]
        : [],
  );
  const regionCount = $derived(regions.length);
  const multiRegion = $derived(regionCount > 1);
  // A single-region recording is ALWAYS current (whole == regional); a multi-region one has a
  // current region only when one is zoom-selected (null = full view, no current — ADR-0028 §2).
  const effectiveCurrentIdx = $derived(
    regionCount === 1 ? 0 : currentRegionIdx != null ? Math.min(currentRegionIdx, regionCount - 1) : null,
  );

  // Per-region timing + AP count, surfaced so the timing can be CONFIRMED at a glance. Region
  // markers come from the xlsx metadata sheet (name / start_s / end_s per region, ADR-0019); the
  // AP count is the spikes falling in [startS, endS]. A treatment that blocks APs (e.g. TTX) should
  // read ~0 APs — if it doesn't, the markers are mislabeled or misaligned.
  const regionTimings = $derived.by(() => {
    if (!recording || !metaRegions.length) return null;
    const st = recording.spikeTimes;
    return metaRegions.map((r) => {
      let n = 0;
      for (let i = 0; i < st.length; i++) if (st[i] >= r.startS && st[i] <= r.endS) n++;
      return { name: r.name, startS: r.startS, endS: r.endS, nSpikes: n };
    });
  });

  // Window one region [startS,endS] to its spikes (ADR-0019 §4) → a LoadedRegion the readout
  // consumes. CSV (no xlsxApi) has only the whole recording, returned as-is.
  function regionToLR(span, label) {
    if (!recording) return null;
    if (xlsxApi && recording.regions) {
      const v = xlsxApi.windowRegion(recording, span, protocolOpts);
      if (!v.analyzable) return { analyzable: false, regionName: span.name, reason: v.reason };
      const lr = xlsxApi.regionViewToLoadedRegion(v, { source: `${fileName} — ${label ?? span.name}` });
      lr.analyzable = true;
      lr.regionName = span.name;
      return lr;
    }
    return Object.assign({ analyzable: recording.spikeTimes.length >= 2, regionName: span.name }, recording);
  }

  // DISPLAY region = the whole recording (all APs). The recon trace + spike raster ALWAYS show
  // the full recording; zoom is view-only (ADR-0027 §1). NO kernel is recovered from it — a
  // whole-signal kernel across >1 region is not informative (FOUNDATIONS §3 / ADR-0028 §1).
  // DISPLAY = the ENTIRE recording, every frame — NOT spike-bracketed. The full calcium signal is
  // always shown, even where APs stop well before the end (this is ADR-0027 §1 view-only display).
  // The raw LoadedRecording (xlsx OR csv) already carries the whole grid/rois/spikeTimes, so use it
  // directly — the old regionToLR({whole}) call ran windowRegion, which brackets to
  // [firstSpike−buffer … lastSpike+buffer] and truncated the trace after the last AP. Recovery is
  // separate and DOES bracket to spikes (recoveryRegion below).
  const displayRegion = $derived(
    recording
      ? {
          analyzable: recording.spikeTimes.length >= 2,
          regionName: 'whole',
          grid: recording.grid,
          spikeTimes: recording.spikeTimes,
          rois: recording.rois,
          meta: recording.meta,
        }
      : null,
  );
  const displayAnalyzable = $derived(!!displayRegion && displayRegion.analyzable !== false);

  // RECOVERY region = the CURRENT region (zoom-selected; single-region → always region 0).
  // null when multi-region at full view → no §3/kernel/predicted (kernel band shows all regions).
  const recoveryRegion = $derived(
    recording && effectiveCurrentIdx != null ? regionToLR(regions[effectiveCurrentIdx]) : null,
  );
  const analyzable = $derived(!!recoveryRegion && recoveryRegion.analyzable !== false);

  // --- shared display axes — the WHOLE recording (display); zoom view-only ---
  const gridTimes = $derived(displayAnalyzable ? Array.from(displayRegion.grid.times) : []);
  const xRange = $derived(displayAnalyzable ? [displayRegion.meta.t0, displayRegion.meta.tEnd] : null);
  const xView = $derived(zoomRange ?? xRange);
  const kernelXRange = [-winS, winS]; // the overlay axis; STA (±staWinS) sits inside it.

  // Metadata regions as low-alpha Okabe-Ito background shading on the recording-time bands —
  // always shown (zoom-driven model: regions are visible at every zoom; ADR-0028).
  const bandRegions = $derived(
    hasRegions
      ? metaRegions.map((r, i) => ({
          x0: r.startS,
          x1: r.endS,
          color: hexToRgba(regionColor(i), 0.13),
          label: r.name,
          labelColor: regionColor(i),
        }))
      : null,
  );

  // The selected ROI column — in the DISPLAY region (recon trace) and the RECOVERY region (kernel).
  const displaySelected = $derived(displayAnalyzable ? displayRegion.rois[selectedCol] : null);
  const selected = $derived(analyzable ? recoveryRegion.rois[selectedCol] : null);

  // RECOVERY binned-count density — over the CURRENT region (§13, ADR-0013 keep; ADR-0017 raw),
  // zero-padded to a power of two. Drives the §3 recovery for the current region only.
  const density = $derived.by(() => {
    if (!analyzable) return null;
    const n = recoveryRegion.grid.n;
    const N = nextPow2(n);
    const sd = rasterize(recoveryRegion.spikeTimes, recoveryRegion.grid, {
      amplitudeMode: 'binned-count',
      preFirstBin: 'keep',
    });
    const sdPad = new Float64Array(N);
    sdPad.set(sd.samples);
    return { n, N, sdPad, placed: sd.placed, dropped: sd.dropped };
  });

  // DISPLAY binned-count density — over the WHOLE recording, for the co-registered raster
  // (display only, never feeds recovery). Shows all APs across all regions at every zoom.
  const displayDensity = $derived.by(() => {
    if (!displayAnalyzable) return null;
    const sd = rasterize(displayRegion.spikeTimes, displayRegion.grid, {
      amplitudeMode: 'binned-count',
      preFirstBin: 'keep',
    });
    return { n: displayRegion.grid.n, counts: Array.from(sd.samples), placed: sd.placed };
  });
  const frameCounts = $derived(displayDensity ? displayDensity.counts : []);

  // Co-registered spike histogram — the spike train re-binned over the review window
  // (DISPLAY ONLY, never feeds recovery). At histWinS = dt the bars ARE the recovery
  // input; wider windows sum frames so bursts read as tall bars. Count axis is pinned
  // [0, maxCount] so EMPTY stretches under a calcium hump stay as legible as tall ones
  // (the decoupling read must not be auto-scaled away).
  const histo = $derived.by(() => {
    if (!displayAnalyzable || !displayDensity) return null;
    const dt = displayRegion.grid.dt;
    const { values, group, windowS } = rebinCounts(frameCounts, dt, histWinS);
    const centers = new Array(values.length);
    for (let b = 0; b < values.length; b++) {
      const start = b * group;
      const end = Math.min(start + group, displayDensity.n) - 1;
      centers[b] = (gridTimes[start] + gridTimes[end]) / 2;
    }
    let maxCount = 0;
    for (const v of values) if (v > maxCount) maxCount = v;
    return { centers, values, group, windowS, isFrameGrid: group === 1, maxCount: Math.max(1, maxCount) };
  });
  // Pin the count axis at [0, maxCount] (small headroom) so zero regions read clearly.
  const histYRange = $derived(histo ? [0, histo.maxCount + 0.3] : null);

  // Raw spike times as unit-height stems (the 'raw' raster mode) — the actual event times,
  // not binned counts. Co-registered with band A like the binned view.
  const rawStems = $derived.by(() => {
    if (!displayRegion || !displayRegion.spikeTimes) return null;
    const xs = Array.from(displayRegion.spikeTimes);
    return { xs, ys: xs.map(() => 1), n: xs.length };
  });

  // AP-independent calcium mixed into the WHOLE recording's selected column. Placed against
  // the whole spike train, not the current region's, so the plotted trace and the recovered
  // kernel are looking at the same events — contaminating each region separately would put
  // humps in different places depending on which region happened to be current.
  const contaminated = $derived.by(() => {
    if (!displayAnalyzable || !displaySelected) return null;
    return mixApIndependent(
      displaySelected.samples,
      displayRegion.grid,
      displayRegion.spikeTimes,
      apIndepMix,
    );
  });

  // The current region's view of that trace. The recovery region is a pure index slice of the
  // display grid (windowRegion brackets to spikes; same dt, same t0 origin), so the slice is
  // exact — no resampling, no second placement pass.
  const recSamples = $derived.by(() => {
    if (!analyzable || !selected) return null;
    if (!contaminated || !(apIndepMix > 0)) return selected.samples;
    const off = Math.round(
      (recoveryRegion.grid.times[0] - displayRegion.grid.times[0]) / displayRegion.grid.dt,
    );
    const src = contaminated.samples;
    const out = new Float64Array(selected.samples.length);
    for (let k = 0; k < out.length; k++) {
      const i = off + k;
      out[k] = i >= 0 && i < src.length ? src[i] : selected.samples[k];
    }
    return out;
  });

  // One noise realization for the selected ROI (region + column + noise level).
  const noisyTrace = $derived.by(() => {
    if (!analyzable || !density || !recSamples) return null;
    const { n, N } = density;
    const sigma = sigmaForLevel(noiseLevel);
    const noise = sigma > 0 ? addAWGN(new Float64Array(n), sigma, mulberry32(NOISE_SEED)) : null;
    const recReal = new Float64Array(N); // NaN→0 + noise, zero-padded
    for (let k = 0; k < n; k++) {
      const v = Number.isFinite(recSamples[k]) ? recSamples[k] : 0;
      recReal[k] = v + (noise ? noise[k] : 0);
    }
    let staTrace = recSamples; // raw (NaN preserved → omitnan) + noise
    if (noise) {
      staTrace = new Float64Array(n);
      for (let k = 0; k < n; k++) staTrace[k] = recSamples[k] + noise[k];
    }
    return { recReal, staTrace };
  });

  /** Embed a symmetric kernel back into a length-N circular signal (zero-lag at 0). */
  function embedKernel(kernel, N, ws) {
    const kPad = new Float64Array(N);
    kPad[0] = kernel.samples[ws];
    for (let j = 1; j <= ws; j++) {
      kPad[j] = kernel.samples[ws + j];
      kPad[N - j] = kernel.samples[ws - j];
    }
    return kPad;
  }

  /** STA samples re-aligned onto the kernel lag grid (shared dt/origin), null elsewhere. */
  function staOntoKernel(sta, kernelLen, ws, staWs) {
    const out = new Array(kernelLen).fill(null);
    if (sta.empty) return out;
    for (let k = 0; k < sta.samples.length; k++) {
      const idx = ws - staWs + k;
      if (idx >= 0 && idx < out.length) out[idx] = sta.samples[k];
    }
    return out;
  }

  /** Source (ground-truth) kernel resampled onto the kernel lag grid (ADR-0034). Both share the
   *  handoff dt, so map by lag rounded to a sample; 0 outside the source support (causal padding). */
  function sourceOntoKernel(src, lagAxis, dt) {
    if (!src || !lagAxis) return null;
    const map = new Map();
    for (let k = 0; k < src.lag.length; k++) map.set(Math.round(src.lag[k] / dt), src.samples[k]);
    return lagAxis.map((L) => {
      const v = map.get(Math.round(L / dt));
      return v == null ? 0 : v;
    });
  }

  // --- the live readout for the selected ROI: BOTH methods + STA + ADR-0025 facts ---
  const analysis = $derived.by(() => {
    if (!analyzable || !density || !noisyTrace) return null;
    const dt = recoveryRegion.grid.dt;
    const { n, N, sdPad } = density;
    const ws = Math.round(winS / dt);
    const staWs = Math.round(staWinS / dt);
    const { recReal, staTrace } = noisyTrace;

    // ---- METHOD 1: free-vector (ADR-0004) ----
    const fvKernel = recoverKernel(recReal, sdPad, { windowSamples: ws, dt, lambda });
    const fvDiag = kernelDiagnostics(fvKernel);
    const fvPreBaseline = preZeroBaselineMean(fvKernel, STABASE);
    const fvKPad = embedKernel(fvKernel, N, ws);
    const fvReconArr = circularConvolve(sdPad, fvKPad);
    let ssRes = 0, ssTot = 0, mean = 0;
    for (let k = 0; k < n; k++) mean += recReal[k];
    mean /= n;
    for (let k = 0; k < n; k++) {
      const r = recReal[k] - fvReconArr[k];
      ssRes += r * r;
      const d = recReal[k] - mean;
      ssTot += d * d;
    }
    const fvR2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;
    const fvRmse = Math.sqrt(ssRes / n);
    // machinery sanity: the full latent inverts the trace exactly (R²≈1).
    const latent = deconvolveCircular(recReal, sdPad, lambda);
    const reconFull = circularConvolve(sdPad, latent);
    let ssResFull = 0;
    for (let k = 0; k < n; k++) { const r = recReal[k] - reconFull[k]; ssResFull += r * r; }
    const fvR2Full = ssTot > 0 ? 1 - ssResFull / ssTot : NaN;
    const fvBoundary = peakAtBoundary(fvKernel); // ADR-0025 fact

    // ---- METHOD 2: constrained-parametric (ADR-0021) ----
    const pm = recoverKernelParametric(recReal, sdPad, { windowSamples: ws, dt, fitLength: n });
    const pmDiag = kernelDiagnostics(pm);
    // Option B reconstruction: FULL analytic kernel (untruncated tail) over the real region.
    const pmReconArr = reconstructParametric(sdPad, pm.fit.theta, dt, n, ws);
    const pmRailed = tauRailed(pm.fit.theta); // ADR-0025 fact

    // ---- STA (method-independent) ----
    const sta = spikeTriggeredAverage(recoveryRegion.spikeTimes, staTrace, recoveryRegion.grid.times, {
      window: staWinS,
      baseline: STABASE,
    });
    let staPeakLagS = NaN, staPeakAmp = NaN;
    if (!sta.empty) {
      let bi = 0;
      for (let i = 1; i < sta.samples.length; i++) if (sta.samples[i] > sta.samples[bi]) bi = i;
      staPeakLagS = sta.times[bi];
      staPeakAmp = sta.samples[bi];
    }
    const staOnKernel = staOntoKernel(sta, fvKernel.samples.length, ws, staWs);

    const kernelLag = Array.from(fvKernel.times); // both methods share this lag grid

    return {
      dt, ws, kernelLag, staOnKernel, staEmpty: sta.empty,
      fv: {
        kernelV: Array.from(fvKernel.samples),
        reconTrace: Array.from(fvReconArr.slice(0, n)),
        peakLagS: fvDiag.peakLagS,
        peakAmp: fvDiag.peakAmp,
        peakAmpAdj: fvDiag.peakAmp - fvPreBaseline,
        tauDecayS: fvDiag.tauDecayS,
        acausalRatio: fvDiag.acausalRatio,
        r2: fvR2, rmse: fvRmse, r2Full: fvR2Full,
        boundary: fvBoundary,
      },
      pm: {
        kernelV: Array.from(pm.samples),
        reconTrace: Array.from(pmReconArr),
        peakLagS: pm.fit.peakLagS,
        peakAmp: pmDiag.peakAmp,
        tauRiseS: pm.fit.theta.tauRise,
        tauDecayS: pm.fit.theta.tauDecay,
        acausalRatio: pmDiag.acausalRatio,
        r2: pm.fit.r2,
        converged: pm.fit.converged,
        railed: pmRailed,
      },
      sta: {
        empty: sta.empty,
        nEvents: sta.nEvents,
        nAccepted: sta.nAccepted,
        staPeakLagS,
        staPeakAmp,
      },
    };
  });

  // ---- METHOD 3: shape-regularized + drift basis (ADR-0021 m3 / ADR-0023) ----
  // Computed LAZILY and SEPARATELY from `analysis` — only when shaped is the selected
  // method, and gated on the SAME non-λ primitives `analysis` uses (NOT `analysis` itself,
  // which depends on λ). Shaped uses its own fixed dials (SHAPED_DIALS), so it does not
  // depend on the λ slider; keeping it out of the λ-reactive path keeps that slider
  // responsive even while shaped is shown. Free-vector-family taps → same readout fields as
  // method 1 (peak lag, peak amp vs base, decay τ, acausal), plus the recovered drift folded
  // into the reconstruction (ADR-0023: a kernel-protection device, NOT a drift measurement).
  const shapedAnalysis = $derived.by(() => {
    if (method !== 'shaped' || !analyzable || !density || !noisyTrace) return null;
    const dt = recoveryRegion.grid.dt;
    const { n, N, sdPad } = density;
    const ws = Math.round(winS / dt);
    const { recReal } = noisyTrace;
    const m3 = recoverKernelShaped(recReal, sdPad, { windowSamples: ws, dt, fitLength: n });
    const m3Diag = kernelDiagnostics(m3);
    const m3PreBaseline = preZeroBaselineMean(m3, STABASE);
    const m3KPad = embedKernel(m3, N, ws);
    const m3ReconArr = circularConvolve(sdPad, m3KPad);
    let ssRes = 0, ssTot = 0, mean = 0;
    for (let k = 0; k < n; k++) mean += recReal[k];
    mean /= n;
    const recon = new Array(n);
    for (let k = 0; k < n; k++) {
      const pred = m3ReconArr[k] + m3.fit.drift[k]; // density ⊛ kernel + recovered drift
      recon[k] = pred;
      const r = recReal[k] - pred;
      ssRes += r * r;
      const d = recReal[k] - mean;
      ssTot += d * d;
    }
    return {
      kernelV: Array.from(m3.samples),
      reconTrace: recon,
      peakLagS: m3Diag.peakLagS,
      peakAmp: m3Diag.peakAmp,
      peakAmpAdj: m3Diag.peakAmp - m3PreBaseline,
      tauDecayS: m3Diag.tauDecayS,
      acausalRatio: m3Diag.acausalRatio,
      r2: ssTot > 0 ? 1 - ssRes / ssTot : NaN,
      rmse: Math.sqrt(ssRes / n),
      boundary: peakAtBoundary(m3), // ADR-0025 neutral fact (free-vector-family, no fail flag)
      driftDegree: m3.fit.driftDegree,
    };
  });

  // CHECK 3 — free-vector stability across the log-λ sweep (a property of the FV
  // recovery; the parametric method has no λ knob, so this stays the FV diagnostic).
  const stability = $derived.by(() => {
    if (!analyzable || !density || !noisyTrace) return null;
    const dt = recoveryRegion.grid.dt;
    const { N, sdPad } = density;
    const ws = Math.round(winS / dt);
    const { recReal } = noisyTrace;
    const sweep = [];
    for (let s = 0; s < NSWEEP; s++) {
      const lam = LAM_LO * Math.pow(LAM_HI / LAM_LO, s / (NSWEEP - 1));
      const k = recoverKernel(recReal, sdPad, { windowSamples: ws, dt, lambda: lam });
      const d = kernelDiagnostics(k);
      sweep.push({ lambda: lam, peakLagS: d.peakLagS, peakAmp: d.peakAmp });
    }
    const lags = sweep.map((s) => s.peakLagS);
    const amps = sweep.map((s) => s.peakAmp);
    return {
      sweep,
      peakLagMinS: Math.min(...lags),
      peakLagMaxS: Math.max(...lags),
      peakLagRangeS: Math.max(...lags) - Math.min(...lags),
      peakAmpMin: Math.min(...amps),
      peakAmpMax: Math.max(...amps),
    };
  });

  // Spike-rate context (ADR-0005 three regimes — which method to believe).
  const spikeContext = $derived.by(() => {
    if (!analyzable || !density) return null;
    const duration = recoveryRegion.meta.tEnd - recoveryRegion.meta.t0;
    return { rateHz: density.placed / duration, placed: density.placed, nSpikes: recoveryRegion.meta.nSpikes, duration };
  });

  // --- the active method's view, applying the ADR-0025 railed default-hide ---
  const active = $derived(
    method === 'shaped'
      ? shapedAnalysis
      : analysis
        ? method === 'free'
          ? analysis.fv
          : analysis.pm
        : null,
  );
  // Parametric output is default-HIDDEN when its fit railed — but always reversible (ADR-0025).
  // Shaped is a free-vector-family method (taps under penalties), NOT parametric — it never
  // receives an automated failure flag and is never railed-hidden (task / ADR-0025).
  const railedHidden = $derived(
    method === 'parametric' && analysis && analysis.pm.railed.railed && !showRailed,
  );
  // Display label for the active method (tags / band captions).
  const methodLabel = $derived(
    method === 'free' ? 'free-vector' : method === 'shaped' ? 'shaped' : 'parametric',
  );

  function rangeOf(arrays) {
    let lo = Infinity, hi = -Infinity;
    for (const a of arrays) for (const v of a) {
      if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) return null;
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }

  // The shared kernel lag axis (±WIN), from the recording dt — available whenever a file is
  // loaded, independent of whether a region is currently selected (so the all-regions band
  // can draw even at full view with no current region).
  const kernelLag = $derived.by(() => {
    if (!recording) return null;
    const dt = recording.meta.dt;
    const ws = Math.round(winS / dt);
    const lag = new Array(2 * ws + 1);
    for (let j = -ws; j <= ws; j++) lag[ws + j] = j * dt;
    return lag;
  });

  // ADR-0028 regional kernel/STA overlays — one recoverRegion per metadata region (noise-off;
  // stability skipped, the band needs only kernel + STA). Every region shares the lag grid
  // (same whole-recording dt → same ws). null = a non-analyzable region.
  const regionOverlays = $derived.by(() => {
    if (!recording || !xlsxApi || !hasRegions) return null;
    return metaRegions.map((r) => {
      const v = xlsxApi.windowRegion(recording, r, protocolOpts);
      if (!v.analyzable) return null;
      const rr = recoverRegion(v, { col: selectedCol, lambda, stability: false });
      if (!rr.analyzable) return null;
      // recoverRegion (core, untouched) computes fv + pm; method 3 is recovered region-local
      // here in the UI from the SAME windowed view, so the all-regions overlay follows the
      // selected method for shaped too (one method at a time — no multi-trace overlay).
      const kSamples =
        method === 'free'
          ? rr.fv.kernel.samples
          : method === 'shaped'
            ? shapedKernelForView(v)
            : rr.pm.kernel.samples;
      const staWs = Math.round(staWinS / rr.dt);
      return { kernelV: Array.from(kSamples), staV: staOntoKernel(rr.sta, kSamples.length, rr.ws, staWs) };
    });
  });

  // Region-local method-3 kernel from an already-windowed view — mirrors recoverRegion's
  // density/trace prep (binned-count §13, NaN→0, zero-pad to a power of two) so the shaped
  // all-regions overlay is computed identically to fv/pm. UI-only (core stays untouched).
  function shapedKernelForView(v) {
    const grid = v.grid;
    const n = grid.n;
    const N = nextPow2(n);
    const dt = grid.dt;
    const ws = Math.round(winS / dt);
    const sd = rasterize(v.spikeTimes, grid, { amplitudeMode: 'binned-count', preFirstBin: 'keep' });
    const sdPad = new Float64Array(N);
    sdPad.set(sd.samples);
    const traceRaw = v.rois[selectedCol].samples;
    const tracePad = new Float64Array(N);
    for (let k = 0; k < n; k++) tracePad[k] = Number.isFinite(traceRaw[k]) ? traceRaw[k] : 0;
    return recoverKernelShaped(tracePad, sdPad, { windowSamples: ws, dt, fitLength: n }).samples;
  }

  // The kernel-band series list. all-regions → every region's kernel (solid) + STA (dashed)
  // in its Okabe-Ito hue, the CURRENT region highlighted by a NON-color channel (full
  // opacity + thicker; others same hue, dimmed + thinner — never grey-out). current →
  // the active method's kernel + STA. Each series is tagged with its curve TYPE so the
  // ADR-0029 scale-target modes can pool the y-range by type. The whole-recording kernel is
  // NOT in the all-regions overlay (whole is not a region — ADR-0027 §3 / ADR-0028 §1).
  const kernelBand = $derived.by(() => {
    if (!kernelLag) return null;
    const norm = overlayMode === 'normalized';
    const nv = (a) => (norm ? normalizeUnitPeak(a) : a);
    const series = [];
    const showAll = multiRegion && regionOverlays && (bandMode === 'all' || effectiveCurrentIdx == null);
    if (showAll) {
      const hi = effectiveCurrentIdx; // current region index, or null at full view (none highlighted)
      regionOverlays.forEach((ov, i) => {
        if (!ov) return;
        const hue = regionColor(i);
        const cur = hi != null && i === hi;
        const alpha = hi == null ? 0.95 : cur ? 1 : 0.38;
        const w = cur ? 2.8 : hi == null ? 1.8 : 1.2;
        series.push({ ys: nv(ov.kernelV), stroke: hexToRgba(hue, alpha), width: w, dash: null, type: 'kernel' });
        series.push({ ys: nv(ov.staV), stroke: hexToRgba(hue, alpha), width: Math.max(1, w - 0.8), dash: [6, 4], type: 'sta' });
      });
    } else if (analysis) {
      // The current region's kernel + STA. When the recording has metadata regions, the
      // current region wears its Okabe-Ito hue (kernel solid, STA dashed); a single implicit
      // region (CSV / no metadata) uses the neutral purple/orange single-slice colors.
      const kv = railedHidden ? null : active.kernelV.slice();
      const sv = analysis.staOnKernel;
      const hue = hasRegions && effectiveCurrentIdx != null ? regionColor(effectiveCurrentIdx) : null;
      const kColor = hue ?? 'var(--series-you)';
      const sColor = hue ?? '#e76f51';
      if (kv) series.push({ ys: nv(kv), stroke: kColor, width: 2.4, dash: null, type: 'kernel' });
      series.push({ ys: nv(sv), stroke: sColor, width: hue ? 1.8 : 2, dash: hue ? [6, 4] : null, type: 'sta' });
    }
    // Source (ground-truth) kernel from the Tab 1 handoff (ADR-0034): a dashed reference so the
    // eye can read recovered vs. the kernel that GENERATED the data. Only present for a handoff
    // (null for a real file). Pooled as a 'kernel' curve so scale-to-kernels includes it.
    if (sourceKernel) {
      const srcYs = sourceOntoKernel(sourceKernel, kernelLag, recording.meta.dt);
      if (srcYs) series.push({ ys: nv(srcYs), stroke: 'var(--series-truth)', width: 1.8, dash: [2, 3], type: 'kernel', source: true });
    }
    // ADR-0029 scale targets — ONE shared axis; the mode only chooses whose range sets it.
    // kernels/sta pool by curve TYPE across regions; shared/normalized pool all curves. A
    // type with no curves (e.g. railed-hidden kernel) falls back to all so the axis never empties.
    const byType = (t) => series.filter((s) => s.type === t).map((s) => s.ys);
    let yRange;
    if (overlayMode === 'kernels') yRange = rangeOf(byType('kernel')) ?? rangeOf(series.map((s) => s.ys));
    else if (overlayMode === 'sta') yRange = rangeOf(byType('sta')) ?? rangeOf(series.map((s) => s.ys));
    else yRange = rangeOf(series.map((s) => s.ys)); // shared-y and normalized span all curves
    return { lag: kernelLag, series, yRange };
  });
  // uPlot fixes its series count at init, so remount the band Plot ({#key}) when the count/
  // config changes. Value-only changes update in place.
  const kernelBandKey = $derived(
    kernelBand ? `${kernelBand.series.length}-${railedHidden}-${effectiveCurrentIdx}-${bandMode}` : 'none',
  );
  // Whether the band is drawing ALL regions (multi-region, toggle 'all' or no current region).
  const bandShowsAll = $derived(
    multiRegion && !!regionOverlays && (bandMode === 'all' || effectiveCurrentIdx == null),
  );

  // Key for the kernel band. The band draws up to four curve kinds at once and had no legend
  // at all, so a reader had to already know the conventions to read it. Derived from the SAME
  // branch conditions and the SAME colors as kernelBand.series, so the key cannot drift from
  // what is drawn. Which channel carries what changes with the mode, and the key follows: in
  // all-regions mode hue carries the REGION and dash carries the curve type (so the swatches
  // name regions and one note states the dash convention), while in single mode hue separates
  // kernel from STA directly (ADR-0024).
  const kernelKey = $derived.by(() => {
    if (!kernelBand) return null;
    const keys = [];
    let note = '';
    if (bandShowsAll) {
      metaRegions.forEach((r, i) => {
        if (!regionOverlays?.[i]) return;
        keys.push({
          label: r.name + (effectiveCurrentIdx === i ? ' · current' : ''),
          color: regionColor(i),
          dashed: false,
        });
      });
      note =
        'solid = kernel · dashed = STA' + (effectiveCurrentIdx != null ? ' · current = bold' : '');
    } else if (analysis) {
      const hue = hasRegions && effectiveCurrentIdx != null ? regionColor(effectiveCurrentIdx) : null;
      if (!railedHidden) keys.push({ label: 'recovered kernel', color: hue ?? 'var(--series-you)', dashed: false });
      // With a region hue the two curves share a color and separate by dash; without one they
      // separate by color and the STA is drawn SOLID. The key has to say whichever is true.
      keys.push({ label: 'STA', color: hue ?? '#e76f51', dashed: !!hue });
    }
    // The Tab 1 handoff's known kernel — the ground truth the recovery is judged against.
    if (sourceKernel) keys.push({ label: 'source kernel', color: 'var(--series-truth)', dashed: true });
    return keys.length ? { keys, note } : null;
  });
  // What is left in the summary's "kernel overlay" block once the swatches move out — so the
  // header is not rendered above an empty row.
  const overlayPeakNumbers = $derived(
    !bandShowsAll && !!analysis && !railedHidden && !analysis.staEmpty,
  );
  const overlayRailedToggle = $derived(
    !bandShowsAll && !!analysis && showRailed && method === 'parametric' && analysis.pm.railed.railed,
  );
  // A dashed swatch has to be drawn, not stroked: the <i> is a 3px bar, so the dash becomes a
  // repeating gradient in the curve's own color.
  const keySwatch = (k) =>
    k.dashed
      ? `background:repeating-linear-gradient(90deg, ${k.color} 0 4px, transparent 4px 7px)`
      : `background:${k.color}`;

  // Reconstruction predicted overlay (current region) placed onto the WHOLE-recording timeline
  // at the region's offset, null elsewhere — so it aligns with the full recon trace. Null while
  // railed-hidden or when no region is current.
  const reconTrace = $derived.by(() => {
    if (!displayAnalyzable) return [];
    // Always a full-length array (nulls where there's no prediction) so it can be the main `ys`
    // series with the actual drawn ON TOP — a good fit otherwise hides the actual behind it.
    const out = new Array(displayRegion.grid.n).fill(null);
    if (!active || railedHidden || !analysis || !recoveryRegion) return out;
    const dt = displayRegion.grid.dt;
    const off = Math.round((recoveryRegion.grid.times[0] - displayRegion.grid.times[0]) / dt);
    const rt = active.reconTrace;
    for (let j = 0; j < rt.length; j++) {
      const i = off + j;
      if (i >= 0 && i < out.length) out[i] = rt[j];
    }
    return out;
  });
  // Actual dF/F₀ = the WHOLE recording trace for the selected column (display; zoom view-only).
  // Reads the contaminated trace so the AP-independent dial is VISIBLE, not just felt in the
  // numbers — at mix 0 this is the loaded samples themselves, unchanged.
  const traceYs = $derived(
    contaminated ? Array.from(contaminated.samples, (v) => (Number.isFinite(v) ? v : null)) : [],
  );

  // ADR-0025 indicator facts for the current slice (neutral; never pass/fail).
  const facts = $derived.by(() => {
    if (!analysis) return [];
    const out = [];
    if (analysis.fv.boundary.atBoundary) {
      out.push({
        method: 'free-vector',
        text: 'peak at boundary',
        detail: 'max sample sits at the window edge — the peak-lag readout is not a transient peak',
      });
    }
    if (analysis.pm.railed.railed) {
      out.push({
        method: 'parametric',
        text: `τ at bound (${analysis.pm.railed.which.join(', ')})`,
        detail: 'a fitted τ is pinned to its solver bound — the fit is at a wall, not an interior optimum',
      });
    }
    // Shaped: only the neutral peak-at-boundary FACT (free-vector-family — no failure flag,
    // ADR-0025). Surfaced only when shaped is the computed method.
    if (shapedAnalysis && shapedAnalysis.boundary.atBoundary) {
      out.push({
        method: 'shaped',
        text: 'peak at boundary',
        detail: 'max sample sits at the window edge — the peak-lag readout is not a transient peak',
      });
    }
    return out;
  });

  const f = (x, p = 4) => (Number.isFinite(x) ? x.toFixed(p) : '—');
  const e = (x) => (Number.isFinite(x) ? x.toExponential(2) : '—');
  const colLabel = (i) => (i === 0 ? `${displayRegion.rois[0].id} (target)` : displayRegion.rois[i].id);
</script>

<!-- drop is sensitive across the whole tab; the affordance shrinks once a file loads. -->
<section
  class="tab2"
  class:capped={!wide}
  class:dragging
  aria-label="Tab 2 — drop a recording file to load"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  {#if !recording}
    <!-- Not role="button": this is a drop TARGET with no click handler, and the false
         role made assistive tech announce the entire panel — spec paragraph and all —
         as one button label. The real control is the file input inside, which is now
         focusable (see .filebtn input in the styles) instead of display:none. -->
    <div class="dropzone" class:dragging>
      <p>Drop a recording (.xlsx) or region CSV here, or</p>
      <label class="filebtn">
        choose a file
        <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
      </label>
      {#if fileName}<p class="fname">{fileName}</p>{/if}
      {#if error}<p class="error">Could not load: {error}</p>{/if}
      {#if LabPicker}<LabPicker onpick={(f) => handleFiles([f])} current={fileName} />{/if}
      <!-- The dropzone used to name two extensions and stop, leaving the schema
           documented only in ADR-0016/0019 — which a visitor has never read. State the
           shape here, where someone is standing when they need it, and offer the
           template as a working starting point rather than a spec to implement. -->
      <p class="dz-spec">
        A workbook needs a <code>trace</code> sheet (<code>time</code> + one column per
        ROI), a <code>spikes</code> sheet of action-potential times in seconds, and an
        optional <code>metadata</code> sheet of regions. A CSV needs
        <code>time</code>, <code>spikes</code> and one or more ROI columns in one file.
      </p>
      <p class="dz-actions">
        New here? Start from the template —
        <button type="button" class="dz-dl" onclick={getTemplateXlsx}>{tplXlsx === 'working' ? 'preparing…' : 'workbook (.xlsx)'}</button>
        <span class="dz-sep">·</span>
        <button type="button" class="dz-dl" onclick={getTemplateCsv}>CSV</button>
        <br />It is a small working recording: drop it straight back in to see the whole
        loop before you use your own data.
      </p>
      {#if tplError}<p class="error">Could not build the template: {tplError}</p>{/if}
    </div>
  {:else if !displayAnalyzable}
    <!-- ADR-0022: no APs in the whole recording — a policy SKIP, not a fit (and not an error). -->
    <div class="dropzone">
      <div class="fileline">
        <span class="fn" title={fileName}>{fileName}</span>
        <label class="filebtn-sm">
          change
          <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
        </label>
      </div>
      {#if LabPicker}<LabPicker onpick={(f) => handleFiles([f])} current={fileName} />{/if}
      <p class="error">{fileName}: no APs in this recording — deconvolution not possible (ADR-0022 policy skip; not fit).</p>
    </div>
  {:else}
    <!-- ADR-0026/0028: workflow-staged left rail (controls + §3 checks for the CURRENT
         region) + a stage of co-equal plot bands. The recon trace + raster show the WHOLE
         recording; §3/kernel are regional (current region, double-click-selected). -->
    <!-- Shared 20/80 shell (2026-07-03): rail controls · summary(§3 checks) · square kernel · bands. -->
    <Shell {wide}>
      {#snippet rail()}
        <!-- ADR-0028: tab title folded into the rail (the top row is tab nav only). -->
        <div class="railtitle">
          <strong>colonel_kernel</strong>
          <span>recover the kernel: <code>output, input → kernel</code></span>
        </div>
        <!-- file management — collapsed to a line post-load (ADR-0026) -->
        <div class="fileline">
          <span class="fn" title={fileName}>{fileName}</span>
          <label class="filebtn-sm">
            change
            <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
          </label>
        </div>
        {#if LabPicker}<LabPicker onpick={(f) => handleFiles([f])} current={fileName} />{/if}
        <!-- Entering Tab 2 by the nav auto-loads the Tab 1 handoff, so a user who wants
             their OWN recording lands here and never sees the empty dropzone where the
             format is explained. This fold is that guidance on the path people actually
             take. Collapsed by default so it costs the analyze view nothing. -->
        <details class="ownfile">
          <summary>Loading your own recording?</summary>
          <p>
            A workbook needs a <code>trace</code> sheet (<code>time</code> + one column per
            ROI), a <code>spikes</code> sheet of AP times in seconds, and an optional
            <code>metadata</code> sheet of regions. Every data cell a number, one shared
            clock starting at 0. Region <em>names</em> pick the analysis window — see
            Tab 0 for the full rules.
          </p>
          <p>
            Start from the template —
            <button type="button" class="dz-dl" onclick={getTemplateXlsx}>{tplXlsx === 'working' ? 'preparing…' : '.xlsx'}</button>
            <span class="dz-sep">·</span>
            <button type="button" class="dz-dl" onclick={getTemplateCsv}>.csv</button>
            — it is a working recording, so you can load it as-is first.
          </p>
          {#if tplError}<p class="error">Could not build the template: {tplError}</p>{/if}
        </details>
        {#if error}<p class="error">{error}</p>{/if}

        <!-- Per-recording summary → Save as PDF (summaries & export). xlsx w/ regions only. -->
        {#if hasRegions && xlsxApi}
          <button class="summary-btn" onclick={openSummary} disabled={summaryBusy}>
            {summaryBusy ? 'Building summary…' : '📄 Summary report / Save as PDF'}
          </button>
        {/if}

        <!-- concise summary -->
        <p class="summary">
          <strong>{displayRegion.rois.length} ROIs</strong> · showing <strong>{colLabel(selectedCol)}</strong><br />
          {displayRegion.grid.n} frames · dt {displayRegion.grid.dt.toFixed(3)} s · {#if hasRegions}{metaRegions.length} regions{:else}whole recording{/if}
          {#if hasRegions}<br /><span class="muted">double-click a shaded region to read its kernel</span>{/if}
          {#if analysis && spikeContext}<br /><span class="muted">{recoveryRegion.regionName}: {spikeContext.placed} spikes · {f(spikeContext.rateHz, 3)} Hz</span>{/if}
        </p>

        <!-- Region timing + AP count — confirm the baseline/treatment windows (ADR-0019 markers). -->
        {#if regionTimings}
          <div class="regions-list">
            {#each regionTimings as rt, i}
              <div class="region-row" class:noaps={rt.nSpikes < 2}>
                <span class="region-dot" style="background:{regionColor(i)}"></span>
                <span class="region-name">{rt.name}</span>
                <span class="region-time">{rt.startS.toFixed(0)}–{rt.endS.toFixed(0)} s</span>
                <span class="region-n">{rt.nSpikes} AP{rt.nSpikes === 1 ? '' : 's'}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Settings (collapsible, ADR-0028) -->
        <div class="rail-sec" class:collapsed={!settingsOpen}>
          <button class="rail-h toggle" aria-expanded={settingsOpen} onclick={() => (settingsOpen = !settingsOpen)}>
            <span>Settings</span><span class="chev">{settingsOpen ? '▾' : '▸'}</span>
          </button>
          {#if settingsOpen}
          <div class="rail-bd">
            <label class="field">
              <span>Column</span>
              <select bind:value={selectedCol}>
                {#each displayRegion.rois as roi, i}
                  <option value={i}>{colLabel(i)}</option>
                {/each}
              </select>
            </label>
            <div class="field">
              <span class="field-lab">Method
                <button class="help-btn" onclick={() => (showMethods = true)} aria-label="About the recovery methods" title="About the methods">?</button>
              </span>
              <div class="seg" role="group" aria-label="Recovery method">
                <button class:on={method === 'free'} onclick={() => (method = 'free')}>Free-vector</button>
                <button class:on={method === 'parametric'} onclick={() => (method = 'parametric')}>Parametric</button>
                <button class:on={method === 'shaped'} onclick={() => (method = 'shaped')}>Shaped</button>
              </div>
            </div>
            <label class="field">
              <span>Overlay scale</span>
              <select bind:value={overlayMode} aria-label="Overlay amplitude scale">
                <option value="shared">Shared-y (all curves)</option>
                <option value="normalized">Normalized (shape only)</option>
                <option value="kernels">Scale to kernels</option>
                <option value="sta">Scale to STA</option>
              </select>
            </label>
            <label class="ctl">
              <span>Kernel window ±(s)</span>
              <input type="range" min="1" max="10" step="0.5" bind:value={winS} />
              <output>{winS.toFixed(1)}</output>
            </label>
            <label class="ctl">
              <span>STA window ±(s)</span>
              <input type="range" min="0.25" max="3" step="0.25" bind:value={staWinS} />
              <output>{staWinS.toFixed(2)}</output>
            </label>
            <div class="field">
              <span>Spike raster</span>
              <div class="seg" role="group" aria-label="Spike raster display">
                <button class:on={rasterMode === 'binned'} onclick={() => (rasterMode = 'binned')}>Binned</button>
                <button class:on={rasterMode === 'raw'} onclick={() => (rasterMode = 'raw')}>Raw spikes</button>
              </div>
            </div>
            {#if rasterMode === 'binned'}
              <label class="ctl">
                <span>Spike bin window (s)</span>
                <input type="range" min={displayRegion.grid.dt} max={HIST_WIN_MAX} step={displayRegion.grid.dt} bind:value={histWinS} />
                <output>{(histo ? histo.windowS : histWinS).toFixed(2)}</output>
              </label>
            {/if}
            {#if hasRegions}
              <div class="field">
                <span>Kernel band</span>
                <div class="seg" role="group" aria-label="Kernel band overlay">
                  <button class:on={bandMode === 'current'} onclick={() => (bandMode = 'current')}>Current</button>
                  <button class:on={bandMode === 'all'} onclick={() => (bandMode = 'all')}>All regions</button>
                </div>
              </div>
            {/if}
          </div>
          {/if}
        </div>

        <!-- Advanced fold (λ + noise) — collapsed by default (§11.1 tiering) -->
        <div class="rail-sec" class:collapsed={!advancedOpen}>
          <button class="rail-h toggle" aria-expanded={advancedOpen} onclick={() => (advancedOpen = !advancedOpen)}>
            <span>Advanced</span><span class="chev">{advancedOpen ? '▾' : '▸'}</span>
          </button>
          {#if advancedOpen}
            <div class="rail-bd">
              <!-- A div, not a label, because of the "?": a wrapping <label> would put a
                   second interactive element inside the label's own hit area, so a click on
                   help would also drive the slider. The explicit for/id pairing keeps the
                   label association without that nesting. (Verified: clicking "?" leaves
                   lambdaLog untouched.)

                   The "?" opens Tab 0's λ section in a NEW BROWSER TAB, and the ↗ says so.
                   It must not switch tabs in place: this tab is mounted under {#if tab === 2},
                   so leaving it unmounts the reader's loaded recording, ROI selection, open
                   folds and λ value. Measured: an in-place jump returned λ 2.000 to its
                   0.0020 default. The Method "?" beside it opens a modal and stays put, so
                   the two are deliberately marked differently.

                   `.field-lab` is the existing class for a label with a "?" beside it; the
                   "?" must sit INLINE after the label text, not in its own flex column —
                   at rail widths ~940-1220px the label wraps to two lines and a centered
                   flex child orphans into the gutter, reading as a note on the value. -->
              <div class="ctl">
                <span class="field-lab"
                  ><label for="lam-reg">Regularization λ</label
                  ><a
                    class="help-btn"
                    href={LAMBDA_EXPLAINER_URL}
                    target="_blank"
                    rel="noopener"
                    aria-label="What is the regularization strength λ? Opens the explainer in a new tab."
                    title="What is λ? (opens in a new tab)">?</a
                  ></span
                >
                <input id="lam-reg" type="range" min={LOG_LO} max={LOG_HI} step="0.01" bind:value={lambdaLog} />
                <output>{lambda < 0.1 ? lambda.toFixed(4) : lambda.toFixed(3)}</output>
              </div>
              <label class="ctl">
                <span>Noise (× cohort σ)</span>
                <input type="range" min="0" max="10" step="0.5" bind:value={noiseLevel} />
                <output>{noiseLevel.toFixed(1)}×</output>
              </label>
              <!-- The AP-independent dial is NOT here: it is in the strip above the tabs,
                   the same place on every tab (ADR-0050). It used to sit in this fold, which
                   is the one place a control that must always be at hand cannot be. What
                   remains is the statement of what it did to THIS recording. -->
              {#if apIndepMix > 0 && contaminated}
                <p class="ctl-note">
                  <strong>AP-independent calcium is mixed in ({apIndepMix.toFixed(2)}).</strong>
                  {contaminated.events.length} synthetic event{contaminated.events.length === 1 ? '' : 's'}
                  with no AP underneath, {Math.round(contaminated.share * 100)}% of the trace's
                  variance — the recovery and all four §3 checks are running on the
                  contaminated trace.
                </p>
              {/if}
              {#if hasRegions}
                <p class="ctl-note">Region windows (ADR-0035) — baseline uses the last <em>max</em>; treatments delay by <em>delay</em> then run to <em>max</em>; hiK uses the whole period.</p>
                <label class="ctl">
                  <span>Solution delay</span>
                  <input type="number" min="0" max="20" step="0.5" bind:value={solutionDelayMin} />
                  <output>min</output>
                </label>
                <label class="ctl">
                  <span>Min duration</span>
                  <input type="number" min="0" max="60" step="1" bind:value={regionMinMin} />
                  <output>min</output>
                </label>
                <label class="ctl">
                  <span>Max duration</span>
                  <input type="number" min="1" max="60" step="1" bind:value={regionMaxMin} />
                  <output>min</output>
                </label>
              {/if}
              {#if method === 'parametric'}<p class="ctl-note">λ drives the free-vector recovery; the parametric fit has no λ.</p>
              {:else if method === 'shaped'}<p class="ctl-note">λ drives the free-vector recovery + the stability check; shaped uses its own fixed smoothness + drift dials.</p>{/if}
            </div>
          {/if}
        </div>

        <!-- ADR-0025 indicator strip: neutral facts for this slice, never pass/fail -->
        {#if facts.length}
          <div class="indicators" aria-label="Computed facts for this slice (not verdicts)">
            {#each facts as fact}
              <span class="fact" title={fact.detail}>
                <span class="dot" aria-hidden="true"></span>
                <span class="fact-method">{fact.method}</span>
                <span class="fact-text">{fact.text}</span>
              </span>
            {/each}
          </div>
        {/if}
      {/snippet}

      <!-- SUMMARY — the four §3 checks, beside the square kernel (was pinned in the rail).
           Readouts here, not a time band: a narrower band would break x co-registration (ADR-0030). -->
      {#snippet summary()}
        <div class="checks-h">§3 checks <span class="cap">numbers; figures are the instrument</span></div>
        <div class="checks-body">
            {#if !analysis}
            {#if recoveryRegion && recoveryRegion.analyzable === false}
              <p class="ctl-note">{recoveryRegion.regionName}: {recoveryRegion.reason ?? 'no APs in this region — not analyzed'}</p>
            {:else if multiRegion}
              <p class="ctl-note">Double-click a shaded region to read its kernel & §3 checks.</p>
            {:else}
              <p class="ctl-note">No analyzable region.</p>
            {/if}
            {:else}
            <div class="cgrp">
              <div class="cgh">1 · Plausibility <span class="tag">{methodLabel}</span></div>
              {#if railedHidden}
                <div class="crow note">railed — hidden (<button class="linkbtn" onclick={() => (showRailed = true)}>show anyways</button>)</div>
              {:else if method === 'free' || method === 'shaped'}
                <div class="crow"><span>peak lag</span><span class="v">{f(active.peakLagS, 2)} s</span></div>
                <div class="crow"><span>peak amp (vs base)</span><span class="v">{f(active.peakAmpAdj)}</span></div>
                <div class="crow"><span>decay τ</span><span class="v">{Number.isFinite(active.tauDecayS) ? `${f(active.tauDecayS, 2)} s` : 'n/a (tilt)'}</span></div>
                <div class="crow"><span>acausal ratio</span><span class="v">{f(active.acausalRatio)}</span></div>
              {:else}
                <div class="crow"><span>peak lag</span><span class="v">{f(active.peakLagS, 2)} s</span></div>
                <div class="crow"><span>peak amp</span><span class="v">{f(active.peakAmp)}</span></div>
                <div class="crow"><span>τ rise</span><span class="v">{f(active.tauRiseS, 2)} s</span></div>
                <div class="crow"><span>τ decay</span><span class="v">{f(active.tauDecayS, 2)} s</span></div>
                <div class="crow"><span>acausal ratio</span><span class="v">{f(active.acausalRatio)}</span></div>
              {/if}
            </div>

            <div class="cgrp">
              <div class="cgh">2 · Reconstruction <span class="tag">reported, not gated</span></div>
              {#if railedHidden}
                <div class="crow note">railed — hidden</div>
              {:else if method === 'free'}
                <div class="crow"><span>full-latent R²</span><span class="v">{f(active.r2Full)}</span></div>
                <div class="crow"><span>retained-kernel R²</span><span class="v">{f(active.r2)}</span></div>
                <div class="crow"><span>RMSE</span><span class="v">{e(active.rmse)}</span></div>
                <div class="crow note">full-latent ≈1 = path sane; low retained = §3 decoupling</div>
              {:else if method === 'shaped'}
                <div class="crow"><span>reconstruction R²</span><span class="v">{f(active.r2)}</span></div>
                <div class="crow"><span>RMSE</span><span class="v">{e(active.rmse)}</span></div>
                <div class="crow note">density ⊛ kernel + degree-{active.driftDegree} drift basis (kernel-protection, not a drift readout); low R² = §3 decoupling</div>
              {:else}
                <div class="crow"><span>full-kernel R²</span><span class="v">{f(active.r2)}</span></div>
                <div class="crow note">Option B forward path; low R² = §3 decoupling, reported not gated</div>
              {/if}
            </div>

            <div class="cgrp">
              <div class="cgh">3 · Stability <span class="tag">free-vector λ {LAM_LO}–{LAM_HI}</span></div>
              {#if stability}
                <div class="crow"><span>peak lag range</span><span class="v">{f(stability.peakLagMinS, 2)}–{f(stability.peakLagMaxS, 2)} s</span></div>
                <div class="crow"><span>lag drift</span><span class="v">{f(stability.peakLagRangeS, 3)} s</span></div>
                <div class="crow"><span>peak amp range</span><span class="v">{e(stability.peakAmpMin)} … {e(stability.peakAmpMax)}</span></div>
              {/if}
            </div>

            <div class="cgrp">
              <div class="cgh">4 · STA agreement <span class="tag">vs {methodLabel}</span></div>
              {#if analysis.sta.empty}
                <div class="crow note">STA empty — no accepted events</div>
              {:else}
                <div class="crow"><span>kernel / STA peak</span><span class="v">{railedHidden ? '—' : f(active.peakLagS, 2)} / {f(analysis.sta.staPeakLagS, 2)} s</span></div>
                <div class="crow"><span>Δ lag</span><span class="v">{railedHidden ? '—' : f(active.peakLagS - analysis.sta.staPeakLagS, 2)} s</span></div>
                <div class="crow"><span>STA events</span><span class="v">{analysis.sta.nAccepted}/{analysis.sta.nEvents}</span></div>
                {#if spikeContext}<div class="crow"><span>spike rate</span><span class="v">{f(spikeContext.rateHz, 3)} Hz</span></div>{/if}
              {/if}
            </div>
            {/if}
        </div>
        <!-- Kernel-overlay NUMBERS. The swatch key that used to live here now sits under the
             kernel square instead: a key has to be next to the figure it explains, and down
             here it fell below the fold of the summary panel, so in practice the overlay had
             no key at all. It had also drifted — it still named the kernel's old literal
             purple after the series moved to a token. The numbers stay ("numbers; figures are
             the instrument", ADR-0026), as does the railed-output toggle. -->
        {#if kernelBand && !bandShowsAll && analysis && (overlayPeakNumbers || overlayRailedToggle)}
          <div class="overlay-legend">
            <div class="checks-h">kernel overlay</div>
            <div class="legend">
              {#if overlayRailedToggle}
                <button class="linkbtn" onclick={() => (showRailed = false)}>Hide railed output</button>
              {/if}
              {#if overlayPeakNumbers}
                <span class="agree">
                  kernel peak {f(active.peakLagS, 2)} s · amp {f(method === 'parametric' ? active.peakAmp : active.peakAmpAdj)} · STA peak {f(analysis.sta.staPeakLagS, 2)} s
                </span>
              {/if}
            </div>
          </div>
        {/if}
      {/snippet}

      {#snippet bands()}
      <!-- BAND A — reconstruction: actual dF/F₀ vs predicted; spike-window slider inline.
           Shares the recording-time x with the raster band below (same xRange + yAxisSize
           gutter ⇒ the axes lock, not merely coincide). -->
      <div class="band">
        <div class="band-head">
          <span class="plot-label">reconstruction — actual dF/F₀ vs predicted (density ⊛ {methodLabel} kernel), {colLabel(selectedCol)}</span>
          <div class="head-right">
            <!-- The AP-independent dial lives in a collapsed fold, and everything on this
                 page — the trace, the kernel, all four §3 checks — is computed from the
                 doctored trace once it is off zero. Say so where the numbers are, not only
                 where the control is: a contaminated recovery must never be mistakable for
                 a measurement of the loaded file. -->
            {#if apIndepMix > 0}
              <span class="contam" title="Synthetic AP-independent calcium is mixed into this trace — the recovery below is not a measurement of the loaded file. Clear it with the dial above the tabs.">
                ⚠ AP-independent mix {apIndepMix.toFixed(2)} — synthetic
              </span>
            {/if}
            {#if zoomRange}
              <span class="zoomnote zoomed">zoomed {zoomRange[0].toFixed(0)}–{zoomRange[1].toFixed(0)} s · click plot to reset</span>
            {:else}
              <span class="zoomnote">drag to zoom · view only</span>
            {/if}
          </div>
        </div>
        <div class="band-body">
          {#if railedHidden}
            <div class="hidden-note">
              Parametric fit railed (τ at bound) — reconstruction hidden by default.
              <button class="linkbtn" onclick={() => (showRailed = true)}>Show anyways</button>
              <span class="sta-still">spike raster still shown below.</span>
            </div>
          {:else}
            <!-- actual dF/F₀ (calcium) is the base; the reconstruction is drawn ON TOP (ys2) so
                 the fit reads over the real trace. -->
            <Plot
              fill
              xs={gridTimes}
              ys={traceYs}
              color="var(--series-trace)"
              ys2={reconTrace}
              color2="var(--series-machine)"
              xRange={xView}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              syncKey="tab2-rec-x"
              cursorPoints={true}
              zoomable
              onZoom={handleZoom}
              onRegionDblClick={hasRegions ? handleRegionDblClick : null}
              regions={bandRegions}
              yLabel="dF/F₀"
              showXAxis={false}
              height={172}
            />
          {/if}
        </div>
        <div class="legend">
          <!-- Classes, not inline style: these two are STATIC, so Svelte bakes them into the
               template's HTML string, and parsing a `style` attribute trips the strict CSP's
               style-src-attr (FOUNDATIONS §6 / ADR-0008). The dynamic swatches nearby are set
               through CSSOM by the runtime and are fine. -->
          <span class="key"><i class="k-trace"></i>actual dF/F₀</span>
          <span class="key"><i class="k-machine"></i>predicted</span>
          {#if analysis && !railedHidden}<span class="agree">{recoveryRegion.regionName} reconstruction R² {f(active.r2)} — reported, not gated (§3)</span>{/if}
        </div>
      </div>

      <!-- BAND B — spike raster, FIRST-CLASS (equal height to the others; it is the recovery
           input). Binned-count + pinned [0, maxCount] axis (decoupling visibility, ADR-0024);
           wider filled bars so sparse, low-count cells read. Co-registered with band A. -->
      <div class="band axis">
        <div class="band-head">
          <span class="plot-label">
            {#if rasterMode === 'raw'}
              spike raster — raw spike times{#if rawStems}&nbsp;({rawStems.n} spikes){/if} · the §13 recovery input, un-binned
            {:else}
              spike raster — binned count per {(histo ? histo.windowS : histWinS).toFixed(2)} s bin · pinned [0, {histo ? histo.maxCount : 1}] (decoupling visibility){#if histo} · {#if histo.isFrameGrid}at the frame grid — this <strong>is</strong> the §13 recovery input{:else}drag to {displayRegion.grid.dt.toFixed(2)} s for the §13 recovery input{/if}{/if}
            {/if}
          </span>
        </div>
        <div class="band-body">
          {#if rasterMode === 'raw'}
            {#if rawStems}
              <Plot
                fill
                xs={rawStems.xs}
                ys={rawStems.ys}
                kind="stems"
                barSize={[0.9, 2]}
                color="var(--series-spikes)"
                xRange={xView}
                yRange={[0, 1.25]}
                yAxisSize={44}
                padRight={PLOT_PAD_R}
                syncKey="tab2-rec-x"
                cursorPoints={true}
                zoomable
                onZoom={handleZoom}
                onRegionDblClick={hasRegions ? handleRegionDblClick : null}
                regions={bandRegions}
                yLabel=" "
                xLabel="recording time (s)"
                height={104}
              />
            {/if}
          {:else if histo}
            <Plot
              fill
              xs={histo.centers}
              ys={histo.values}
              kind="stems"
              barSize={[0.9, 6]}
              color="var(--series-spikes)"
              xRange={xView}
              yRange={histYRange}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              syncKey="tab2-rec-x"
              cursorPoints={true}
              zoomable
              onZoom={handleZoom}
              onRegionDblClick={hasRegions ? handleRegionDblClick : null}
              regions={bandRegions}
              yLabel="count"
              xLabel="recording time (s)"
              height={104}
            />
          {/if}
        </div>
      </div>

      {/snippet}

      <!-- SQUARE KERNEL — recovered kernel + STA on one shared zero-lag origin (ADR-0009/0024/0027).
           Was the full-width Band C; now the top-right square. Kernel-band toggle unchanged; the
           long descriptive label is trimmed to fit the square (full text stays in the ADRs). -->
      {#snippet kernelPanel()}
        <div class="sq-label">
          <span>{#if bandShowsAll}all kernels + STA — lag (s){:else}kernel + STA — lag (s){/if}</span>
          {#if overlayMode === 'normalized'}<span class="norm-badge" title="shape only, peaks scaled to 1; amplitude is in the readout">NORM</span>
          {:else if overlayMode === 'kernels'}<span class="norm-badge" title="STA overflows honestly on one shared axis (ADR-0029)">AXIS: KERNELS</span>
          {:else if overlayMode === 'sta'}<span class="norm-badge" title="kernels sit small on the same axis (ADR-0029)">AXIS: STA</span>{/if}
        </div>
        {#if railedHidden && !bandShowsAll}
          <div class="hidden-note">
            Parametric fit railed (τ at bound) — kernel hidden by default.
            <button class="linkbtn" onclick={() => (showRailed = true)}>Show anyways</button>
          </div>
        {/if}
        <div class="sq-body">
          {#if kernelBand}
            {#key kernelBandKey}
              <Plot
                fill
                xs={kernelBand.lag}
                seriesList={kernelBand.series}
                xRange={kernelXRange}
                yRange={kernelBand.yRange}
                yAxisSize={44}
                padRight={PLOT_PAD_R}
                cursorPoints={false}
                yLabel="amplitude (dF/F₀)"
                zeroLine
                xLabel="lag (s)"
                height={186}
              />
            {/key}
          {/if}
        </div>
        {#if kernelKey}
          <div class="legend kernel-key">
            {#each kernelKey.keys as k (k.label)}
              <span class="key"><i style={keySwatch(k)}></i>{k.label}</span>
            {/each}
            {#if kernelKey.note}<span class="dashnote">{kernelKey.note}</span>{/if}
          </div>
        {/if}
      {/snippet}
    </Shell>
  {/if}

  {#if showMethods}
    <div class="methods-modal-bg">
      <button class="methods-scrim" onclick={() => (showMethods = false)} aria-label="Close methods explainer"></button>
      <div class="methods-modal" role="dialog" aria-modal="true" aria-label="About the recovery methods">
        <button class="methods-close" onclick={() => (showMethods = false)} aria-label="Close">×</button>
        <img src={methodsSvg} alt="Explainer of the four kernel-recovery methods: free-vector, parametric, shaped, and STA" />
      </div>
    </div>
  {/if}

  <!-- Per-recording summary report (summaries & export, Phase 1). -->
  {#if showSummary}
    {#if summary}
      <SummaryReport {summary} onClose={closeSummary} />
    {:else}
      <div class="summary-loading" role="status">
        <div class="sl-card">
          {#if summaryError}
            <p class="sl-err">Could not build summary: {summaryError}</p>
            <button class="btn" onclick={closeSummary}>Close</button>
          {:else}
            <p>Building summary… <span class="muted">(recovering every ROI across regions)</span></p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  /* Per-recording summary (summaries & export, Phase 1) */
  .summary-btn {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    margin: 2px 0 4px;
    border: 1px solid var(--accent-border);
    border-radius: 8px;
    background: var(--accent-bg);
    color: var(--text-h);
    cursor: pointer;
    text-align: left;
  }
  .summary-btn:hover:not(:disabled) { border-color: var(--accent); }
  .summary-btn:disabled { opacity: 0.7; cursor: default; }
  .summary-loading {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }
  .sl-card {
    background: var(--bg);
    color: var(--text-h);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px 26px;
    font-size: 15px;
    text-align: center;
    max-width: 90vw;
  }
  .sl-card .muted { color: var(--text); }
  .sl-err { color: #c0392b; margin: 0 0 12px; }
  .sl-card button {
    font: inherit;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg);
    color: var(--text-h);
    cursor: pointer;
  }

  /* "About the methods" — help affordance + explainer modal.
     NOT inline-flex: the "?" has to sit in normal inline flow so that when the label
     wraps (narrow rail, ~940-1220px viewport) it trails the last word instead of being
     centred in the gutter between the two lines. `gap` therefore becomes a margin. */
  .field-lab {
    display: inline;
  }
  .field-lab .help-btn {
    margin-left: 6px;
  }
  .help-btn {
    position: relative; /* anchors the enlarged ::after hit box below */
    text-decoration: none; /* the λ one is an <a>; without this it inherits the link underline */
    width: 16px;
    height: 16px;
    box-sizing: border-box; /* a <button> gets this from the UA sheet; be explicit */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: baseline;
    line-height: 1;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border, #bbb);
    background: transparent;
    color: var(--text, #555);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .help-btn:hover {
    background: var(--accent, #6b46c1);
    color: #fff;
    border-color: var(--accent, #6b46c1);
  }
  /* 16px is the visual circle; the HIT box is grown to 24px (WCAG 2.2 §2.5.8) by an
     overlay rather than padding, so the layout is unmoved. Measured clearance to the
     adjacent .seg button group: 5.6px — keep it if this grows. */
  .help-btn::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 24px;
    height: 24px;
    transform: translate(-50%, -50%);
  }
  .methods-modal-bg {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .methods-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.55);
    cursor: pointer;
  }
  .methods-modal {
    position: relative;
    background: #fff; /* the figure has a white background; keep it light in either theme */
    border-radius: 10px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    padding: 14px;
    max-width: min(1100px, 94vw);
    max-height: 92vh;
    overflow: auto;
  }
  .methods-modal img {
    display: block;
    width: 100%;
    height: auto;
  }
  .methods-close {
    position: absolute;
    top: 6px;
    right: 10px;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.06);
    color: #333;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .methods-close:hover {
    background: rgba(0, 0, 0, 0.14);
  }

  .tab2 {
    display: flex;
    flex-direction: column;
    gap: 16px;
    /* fill the full-height app shell (App.svelte .appmain) so the rail + bands
       own the viewport (ADR-0026); harmless when the parent isn't height-bound. */
    flex: 1;
    min-height: 0;
  }
  /* shared width preference (was the old main.wide cap; now the nav-row toggle) */
  .tab2.capped {
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
  }
  .tab2.dragging {
    outline: 2px dashed var(--accent);
    outline-offset: 6px;
    border-radius: 8px;
  }
  .filebtn-sm {
    cursor: pointer;
    color: var(--accent);
    font-weight: 500;
    font-size: 13px;
  }
  /* Same reason as .filebtn input — hidden, not removed from the tab order. */
  .filebtn-sm input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .filebtn-sm:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .dropzone {
    border: 1.5px dashed var(--border);
    border-radius: 10px;
    padding: 16px;
    text-align: center;
    color: var(--text);
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone.dragging {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .dropzone p {
    margin: 0 0 8px;
  }
  .filebtn {
    display: inline-block;
    cursor: pointer;
    color: var(--accent);
    font-weight: 500;
  }
  /* Visually hidden but still FOCUSABLE. `display: none` removed the input from the
     tab order entirely, which left no keyboard path to load a file at all — the label
     is not focusable and the dropzone has no key handler. Clipping keeps the styled
     label as the visual affordance while the real control stays reachable. */
  .filebtn input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .filebtn:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .dz-spec,
  .dz-actions {
    margin: 14px auto 0 !important;
    max-width: 62ch;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--text);
  }
  .dz-spec code {
    font-family: var(--mono);
    font-size: 0.9em;
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .dz-actions { padding-top: 12px; border-top: 1px solid var(--border); }
  .dz-dl {
    font: inherit;
    font-size: 13.5px;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .dz-dl:hover { text-decoration: underline; }
  .dz-sep { opacity: 0.5; margin: 0 4px; }

  /* rail fold: the input contract, on the path a user actually takes to load a file */
  .ownfile summary {
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-h);
  }
  .ownfile p {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--text);
  }
  .ownfile code {
    font-family: var(--mono);
    font-size: 0.92em;
    background: var(--code-bg);
    padding: 0 3px;
    border-radius: 3px;
  }
  .ownfile .dz-dl { font-size: 12px; }
  .fname {
    margin-top: 8px !important;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-h);
  }
  .error {
    color: #c0392b;
    font-size: 14px;
  }
  /* ADR-0028: compact tab title folded into the rail top */
  .railtitle {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--border);
  }
  .railtitle strong {
    font-size: 15px;
    color: var(--text-h);
  }
  .railtitle span {
    font-size: 11px;
    color: var(--text);
  }
  .summary {
    font-size: 14px;
    color: var(--text);
    margin: 0;
  }
  /* region timing + AP count (confirm baseline/treatment windows) */
  .regions-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .region-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 7px;
    font-size: 12px;
  }
  .region-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .region-name {
    color: var(--text-h);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .region-time {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text);
  }
  .region-n {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-h);
  }
  .region-row.noaps .region-n {
    color: var(--text);
    opacity: 0.55;
  }
  .summary strong {
    color: var(--text-h);
  }
  .summary .muted {
    color: var(--text);
    opacity: 0.65;
  }

  /* method / overlay-scale segmented toggles (in the rail Settings section) */
  .seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .seg button {
    font: inherit;
    font-size: 13px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .seg button:first-of-type {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-of-type {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }
  .seg button.on {
    background: var(--accent-bg);
    border-color: var(--accent-border);
    color: var(--text-h);
    font-weight: 600;
  }
  .seg button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .ctl {
    display: grid;
    grid-template-columns: auto 160px 64px;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: var(--text-h);
    font-weight: 500;
  }
  .ctl output {
    font-family: var(--mono);
    font-size: 13px;
    text-align: right;
  }
  .ctl-note {
    font-size: 12px;
    color: var(--text);
    opacity: 0.75;
    font-style: italic;
  }
  /* Contamination badge — deliberately loud, and always visible while the dial is off zero. */
  .contam {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    white-space: nowrap;
    color: var(--text-h);
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    border-radius: 999px;
    padding: 2px 9px;
  }

  /* indicator strip — neutral facts (ADR-0025), deliberately NOT pass/fail colored */
  .indicators {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .fact {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    font-size: 12px;
    color: var(--text-h);
    cursor: default;
  }
  .fact .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text);
    opacity: 0.55;
    flex: none;
  }
  .fact-method {
    font-family: var(--mono);
    color: var(--text);
    opacity: 0.8;
  }
  .fact-text {
    font-weight: 500;
  }

  .norm-badge {
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: 4px;
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    color: var(--text-h);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  .hidden-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 14px 12px;
    font-size: 13px;
    color: var(--text);
    background: var(--code-bg);
    border-radius: 8px;
  }
  .hidden-note .sta-still {
    opacity: 0.7;
    font-style: italic;
  }
  .linkbtn {
    font: inherit;
    font-size: 13px;
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
  }
  .linkbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .plot-label {
    font-size: 11px;
    color: var(--text);
    margin: 6px 0 2px;
  }
  .head-right {
    display: inline-flex;
    align-items: center;
    gap: 14px;
  }
  /* zoom-state hint / reset (ADR-0026 view-only x-zoom) */
  .zoomnote {
    font-size: 11px;
    color: var(--text);
    opacity: 0.7;
    white-space: nowrap;
  }
  .zoomnote.zoomed {
    border: 1px solid var(--accent-border);
    background: var(--accent-bg);
    color: var(--text-h);
    opacity: 1;
    border-radius: 6px;
    padding: 2px 8px;
  }
  /* kernel-overlay legend + readout, moved into the summary so the kernel plot fills its square */
  .overlay-legend {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--text);
  }
  .legend .key {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend .key i {
    width: 14px;
    height: 3px;
    border-radius: 2px;
    display: inline-block;
  }
  .legend .agree {
    margin-left: auto;
    font-family: var(--mono);
    color: var(--text-h);
  }
  /* The kernel band's key sits inside the square panel (ADR-0033), so it stays tight and is
     allowed to wrap: with several regions the swatch row can run to two lines rather than
     stealing width from the plot. Not `.agree` — that pushes right, which reads as a stray
     fragment in a narrow panel. */
  .legend.kernel-key {
    gap: 10px;
    margin-top: 4px;
    flex: none;
  }
  .legend.kernel-key .dashnote {
    color: var(--text);
    opacity: 0.85;
  }

  /* ===== shared shell (2026-07-03): rail content · summary(§3) · square kernel · bands.
     The layout wrappers (.layout/.rail/.rail-top/.rail-bottom/.stage) are gone — Shell.svelte
     owns the 20/80 structure; Tab 2 supplies content via snippets. ===== */

  /* §3 checks now live in the summary panel beside the square kernel */
  .checks-h {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-h);
    margin-bottom: 10px;
  }
  .checks-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* square kernel inner (was Band C; now Shell's top-right square) */
  .sq-label {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-h);
    margin-bottom: 4px;
    flex: none;
  }
  .sq-body { flex: 1; min-height: 0; }

  .fileline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 10px;
    background: var(--bg);
  }
  .fileline .fn {
    flex: 1;
    font-family: var(--mono);
    color: var(--text-h);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rail-sec {
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg);
    overflow: hidden;
  }
  .rail-h {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 11px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-h);
  }
  .rail-h.toggle {
    width: 100%;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-h);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
  }
  .rail-h .chev {
    color: var(--text);
    opacity: 0.6;
    font-size: 10px;
  }
  .checks-h .cap {
    font-weight: 400;
    font-size: 10px;
    color: var(--text);
    opacity: 0.7;
    font-style: italic;
  }
  .rail-sec.collapsed .rail-h.toggle {
    color: var(--text);
  }
  .rail-bd {
    display: flex;
    flex-direction: column;
    gap: 11px;
    padding: 2px 11px 11px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 14px;
  }
  .field > span {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
  }
  .field select {
    font-family: var(--mono);
    font-size: 13px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text-h);
    width: 100%;
  }
  .rail-bd .seg {
    display: flex;
  }
  .rail-bd .seg button {
    flex: 1;
  }
  /* compact λ/noise sliders in the narrow rail */
  .rail-bd .ctl {
    grid-template-columns: 1fr auto;
    grid-template-areas: 'lab out' 'rng rng';
    gap: 3px 8px;
  }
  .rail-bd .ctl > span {
    grid-area: lab;
    font-size: 12px;
  }
  .rail-bd .ctl > output {
    grid-area: out;
  }
  .rail-bd .ctl > input {
    grid-area: rng;
    width: 100%;
  }

  /* §3 checks — compact label:value readout (now in the summary panel) */
  .cgrp {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cgh {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-h);
    margin-bottom: 1px;
  }
  .cgh .tag {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 500;
    color: var(--text);
    opacity: 0.7;
  }
  .crow {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 11.5px;
    color: var(--text);
    line-height: 1.45;
  }
  .crow .v {
    font-family: var(--mono);
    color: var(--text-h);
    text-align: right;
  }
  .crow.note {
    display: block;
    font-size: 10.5px;
    opacity: 0.7;
    font-style: italic;
  }

  /* full-width co-equal time-course bands (recon + raster) inside Shell's .bands */
  .band {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 12px;
    background: var(--bg);
  }
  /* The raster is FIRST-CLASS and co-equal by ADR-0026 — but it is also the band drawing the
     x-axis and its label, ~31px of uPlot chrome paid out of an equal share, so an equal split
     of the CONTAINERS left its PLOT that much shorter than the reconstruction's (measured
     117 vs 86px). Equal flex-grow with a matching head start on the basis makes the plots
     equal, which is what ADR-0026 actually asked for. Same rule as Tab 3 (ADR-0043). */
  .band.axis { flex: 1 1 31px; }
  /* Legend swatches whose color is fixed: a class, never an inline style attribute (CSP). */
  .legend .key i.k-trace { background: var(--series-trace); }
  .legend .key i.k-machine { background: var(--series-machine); }
  .band-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: none;
  }
  .band-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* the fill-mode Plot grows to the band body's remaining height */
  .band-body :global(.plot.fill) {
    flex: 1;
    min-height: 0;
  }
  .band .legend {
    flex: none;
  }
</style>
