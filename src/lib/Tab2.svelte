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
    tauRailed,
    peakAtBoundary,
    normalizeUnitPeak,
    rebinCounts,
    addAWGN,
    sigmaForLevel,
    mulberry32,
  } from './core/index.js';

  // Pipeline constants — match the validated lab driver / machinery check.
  const WIN = 5; // kernel half-window (s); windowSamples = round(WIN/dt) (ADR-0004)
  const STAWIN = 2; // STA half-window (s)
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

  let region = $state(null);
  let error = $state(null);
  let fileName = $state('');
  let dragging = $state(false);

  let lambdaLog = $state(LOG_LO); // log10(λ); default λ = 0.002 (sweep floor / UI default)
  let noiseLevel = $state(0); // × cohort-typical σ, 0–10, default 0/off (ADR-0015)
  const lambda = $derived(10 ** lambdaLog);

  // --- slice-viewer state ---
  let selectedCol = $state(0); // which ROI column (0 = the expected target, §4)
  let method = $state('free'); // 'free' (ADR-0004) | 'parametric' (ADR-0021 method 2)
  let overlayMode = $state('shared'); // 'shared' (default) | 'normalized' (ADR-0024)
  let showRailed = $state(false); // ADR-0025: reveal default-hidden railed-parametric output
  let histWinS = $state(HIST_WIN_DEFAULT); // spike-histogram review window (s), display only
  let advancedOpen = $state(false); // ADR-0026: λ/noise live in a default-collapsed Advanced fold (§11.1)

  async function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    fileName = file.name;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // ADR-0019 xlsx path. SheetJS stays in its own code-split chunk (FOUNDATIONS §6).
        // Region selection is a dumb default: the first analyzable region (ADR-0022 skips
        // are not exercised on file-80 — it has one analyzable region). Cross-region
        // comparison is out of scope for this slice.
        const { loadWorkbook, regionsOf, windowRegion, regionViewToLoadedRegion } = await import(
          './core/load-xlsx.js'
        );
        const rec = loadWorkbook(await file.arrayBuffer(), { source: file.name });
        let chosen = null;
        for (const rg of regionsOf(rec)) {
          const w = windowRegion(rec, rg);
          if (w.analyzable) {
            chosen = w;
            break;
          }
        }
        if (!chosen) {
          region = null;
          error = `No analyzable region in ${file.name} (every region has fewer than 2 spikes).`;
          return;
        }
        region = regionViewToLoadedRegion(chosen, { source: `${file.name} — ${chosen.name}` });
        resetSlice();
        error = null;
        return;
      }
      const text = await file.text();
      region = loadCsv(text, { source: file.name });
      resetSlice();
      error = null;
    } catch (e) {
      error = String(e && e.message ? e.message : e);
      region = null;
    }
  }

  function resetSlice() {
    selectedCol = 0;
    method = 'free';
    showRailed = false;
    histWinS = HIST_WIN_DEFAULT;
  }

  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer?.files);
  }

  // --- shared display axes (core untouched) ---
  const gridTimes = $derived(region ? Array.from(region.grid.times) : []);
  const xRange = $derived(region ? [region.meta.t0, region.meta.tEnd] : null);
  const kernelXRange = [-WIN, WIN]; // the overlay axis; STA (±STAWIN) sits inside it.

  // The selected ROI column.
  const selected = $derived(region ? region.rois[selectedCol] : null);

  // binned-count spike density on the trace timebase, zero-padded to a power of two
  // (§13, ADR-0013 preFirstBin 'keep'; ADR-0017 raw). One shared spike train per
  // recording (ADR-0019), so this depends only on the region, not the column.
  const density = $derived.by(() => {
    if (!region) return null;
    const n = region.grid.n;
    const N = nextPow2(n);
    const sd = rasterize(region.spikeTimes, region.grid, {
      amplitudeMode: 'binned-count',
      preFirstBin: 'keep',
    });
    const sdPad = new Float64Array(N);
    sdPad.set(sd.samples);
    return { n, N, sdPad, placed: sd.placed, dropped: sd.dropped };
  });

  // The frame-grid binned-count density, sliced to the real region — the exact §13
  // recovery input (a display-only VIEW of density.sdPad). Re-binned below for the
  // co-registered histogram; recovery keeps reading density.sdPad regardless.
  const frameCounts = $derived(density ? Array.from(density.sdPad.subarray(0, density.n)) : []);

  // Co-registered spike histogram — the spike train re-binned over the review window
  // (DISPLAY ONLY, never feeds recovery). At histWinS = dt the bars ARE the recovery
  // input; wider windows sum frames so bursts read as tall bars. Count axis is pinned
  // [0, maxCount] so EMPTY stretches under a calcium hump stay as legible as tall ones
  // (the decoupling read must not be auto-scaled away).
  const histo = $derived.by(() => {
    if (!region || !density) return null;
    const dt = region.grid.dt;
    const { values, group, windowS } = rebinCounts(frameCounts, dt, histWinS);
    const centers = new Array(values.length);
    for (let b = 0; b < values.length; b++) {
      const start = b * group;
      const end = Math.min(start + group, density.n) - 1;
      centers[b] = (gridTimes[start] + gridTimes[end]) / 2;
    }
    let maxCount = 0;
    for (const v of values) if (v > maxCount) maxCount = v;
    return { centers, values, group, windowS, isFrameGrid: group === 1, maxCount: Math.max(1, maxCount) };
  });
  // Pin the count axis at [0, maxCount] (small headroom) so zero regions read clearly.
  const histYRange = $derived(histo ? [0, histo.maxCount + 0.3] : null);

  // One noise realization for the selected ROI (region + column + noise level).
  const noisyTrace = $derived.by(() => {
    if (!region || !density || !selected) return null;
    const { n, N } = density;
    const sigma = sigmaForLevel(noiseLevel);
    const noise = sigma > 0 ? addAWGN(new Float64Array(n), sigma, mulberry32(NOISE_SEED)) : null;
    const recReal = new Float64Array(N); // NaN→0 + noise, zero-padded
    for (let k = 0; k < n; k++) {
      const v = Number.isFinite(selected.samples[k]) ? selected.samples[k] : 0;
      recReal[k] = v + (noise ? noise[k] : 0);
    }
    let staTrace = selected.samples; // raw (NaN preserved → omitnan) + noise
    if (noise) {
      staTrace = new Float64Array(n);
      for (let k = 0; k < n; k++) staTrace[k] = selected.samples[k] + noise[k];
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

  // --- the live readout for the selected ROI: BOTH methods + STA + ADR-0025 facts ---
  const analysis = $derived.by(() => {
    if (!region || !density || !noisyTrace) return null;
    const dt = region.grid.dt;
    const { n, N, sdPad } = density;
    const ws = Math.round(WIN / dt);
    const staWs = Math.round(STAWIN / dt);
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
    const sta = spikeTriggeredAverage(region.spikeTimes, staTrace, region.grid.times, {
      window: STAWIN,
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

  // CHECK 3 — free-vector stability across the log-λ sweep (a property of the FV
  // recovery; the parametric method has no λ knob, so this stays the FV diagnostic).
  const stability = $derived.by(() => {
    if (!region || !density || !noisyTrace) return null;
    const dt = region.grid.dt;
    const { N, sdPad } = density;
    const ws = Math.round(WIN / dt);
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
    if (!region || !density) return null;
    const duration = region.meta.tEnd - region.meta.t0;
    return { rateHz: density.placed / duration, placed: density.placed, nSpikes: region.meta.nSpikes, duration };
  });

  // --- the active method's view, applying the ADR-0025 railed default-hide ---
  const active = $derived(analysis ? (method === 'free' ? analysis.fv : analysis.pm) : null);
  // Parametric output is default-HIDDEN when its fit railed — but always reversible (ADR-0025).
  const railedHidden = $derived(
    method === 'parametric' && analysis && analysis.pm.railed.railed && !showRailed,
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

  // Overlay series for the active method (kernel + STA). ADR-0024: normalized mode
  // scales each to unit peak so SHAPE is legible; shared mode keeps true magnitude.
  const overlay = $derived.by(() => {
    if (!analysis || !active) return null;
    const len = analysis.kernelLag.length;
    let kernelV = railedHidden ? new Array(len).fill(null) : active.kernelV.slice();
    let staV = analysis.staOnKernel;
    if (overlayMode === 'normalized') {
      kernelV = normalizeUnitPeak(kernelV);
      staV = normalizeUnitPeak(staV);
    }
    return { kernelV, staV, yRange: rangeOf([kernelV, staV]) };
  });

  // Reconstruction predicted trace for the active method (null while railed+hidden).
  const reconTrace = $derived(active && !railedHidden ? active.reconTrace : null);
  const traceYs = $derived(
    selected ? Array.from(selected.samples, (v) => (Number.isFinite(v) ? v : null)) : [],
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
    return out;
  });

  const f = (x, p = 4) => (Number.isFinite(x) ? x.toFixed(p) : '—');
  const e = (x) => (Number.isFinite(x) ? x.toExponential(2) : '—');
  const colLabel = (i) => (i === 0 ? `${region.rois[0].id} (target)` : region.rois[i].id);
</script>

<!-- drop is sensitive across the whole tab; the affordance shrinks once a file loads. -->
<section
  class="tab2"
  class:dragging
  aria-label="Tab 2 — drop a recording file to load"
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  {#if !region}
    <div class="dropzone" class:dragging role="button" tabindex="0">
      <p>Drop a recording (.xlsx) or region CSV here, or</p>
      <label class="filebtn">
        choose a file
        <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
      </label>
      {#if fileName}<p class="fname">{fileName}</p>{/if}
      {#if error}<p class="error">Could not load: {error}</p>{/if}
    </div>
  {:else if analysis}
    <!-- ADR-0026: workflow-staged left rail (all controls + the four §3 checks) +
         a stage of co-equal plot bands. -->
    <div class="layout">
      <aside class="rail">
        <!-- file management — collapsed to a line post-load (ADR-0026) -->
        <div class="fileline">
          <span class="fn" title={fileName}>{fileName}</span>
          <label class="filebtn-sm">
            change
            <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
          </label>
        </div>
        {#if error}<p class="error">{error}</p>{/if}

        <!-- concise summary -->
        <p class="summary">
          <strong>{region.rois.length} ROIs</strong> · showing <strong>{colLabel(selectedCol)}</strong><br />
          {region.meta.nSpikes} spikes · {region.grid.n} frames · dt {region.grid.dt.toFixed(3)} s
          {#if spikeContext}· <span class="muted">{f(spikeContext.rateHz, 3)} Hz</span>{/if}
        </p>

        <!-- Settings -->
        <div class="rail-sec">
          <div class="rail-h">Settings</div>
          <div class="rail-bd">
            <label class="field">
              <span>Column</span>
              <select bind:value={selectedCol}>
                {#each region.rois as roi, i}
                  <option value={i}>{colLabel(i)}</option>
                {/each}
              </select>
            </label>
            <div class="field">
              <span>Method</span>
              <div class="seg" role="group" aria-label="Recovery method">
                <button class:on={method === 'free'} onclick={() => (method = 'free')}>Free-vector</button>
                <button class:on={method === 'parametric'} onclick={() => (method = 'parametric')}>Parametric</button>
              </div>
            </div>
            <div class="field">
              <span>Overlay scale</span>
              <div class="seg" role="group" aria-label="Overlay amplitude scale">
                <button class:on={overlayMode === 'shared'} onclick={() => (overlayMode = 'shared')}>Shared-y</button>
                <button class:on={overlayMode === 'normalized'} onclick={() => (overlayMode = 'normalized')}>Normalized</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Advanced fold (λ + noise) — collapsed by default (§11.1 tiering) -->
        <div class="rail-sec" class:collapsed={!advancedOpen}>
          <button class="rail-h toggle" aria-expanded={advancedOpen} onclick={() => (advancedOpen = !advancedOpen)}>
            <span>Advanced</span><span class="chev">{advancedOpen ? '▾' : '▸'}</span>
          </button>
          {#if advancedOpen}
            <div class="rail-bd">
              <label class="ctl">
                <span>Regularization λ (log)</span>
                <input type="range" min={LOG_LO} max={LOG_HI} step="0.01" bind:value={lambdaLog} />
                <output>{lambda < 0.1 ? lambda.toFixed(4) : lambda.toFixed(3)}</output>
              </label>
              <label class="ctl">
                <span>Noise (× cohort σ)</span>
                <input type="range" min="0" max="10" step="0.5" bind:value={noiseLevel} />
                <output>{noiseLevel.toFixed(1)}×</output>
              </label>
              {#if method === 'parametric'}<p class="ctl-note">λ drives the free-vector recovery; the parametric fit has no λ.</p>{/if}
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

        <!-- the four §3 checks — compact label:value readout (ADR-0026); figures lead -->
        <div class="rail-sec checks-rail">
          <div class="rail-h">§3 checks <span class="cap">numbers; figures are the instrument</span></div>
          <div class="rail-bd">
            <div class="cgrp">
              <div class="cgh">1 · Plausibility <span class="tag">{method === 'free' ? 'free-vector' : 'parametric'}</span></div>
              {#if railedHidden}
                <div class="crow note">railed — hidden (<button class="linkbtn" onclick={() => (showRailed = true)}>show anyways</button>)</div>
              {:else if method === 'free'}
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
              <div class="cgh">4 · STA agreement <span class="tag">vs {method === 'free' ? 'free-vector' : 'parametric'}</span></div>
              {#if analysis.sta.empty}
                <div class="crow note">STA empty — no accepted events</div>
              {:else}
                <div class="crow"><span>kernel / STA peak</span><span class="v">{railedHidden ? '—' : f(active.peakLagS, 2)} / {f(analysis.sta.staPeakLagS, 2)} s</span></div>
                <div class="crow"><span>Δ lag</span><span class="v">{railedHidden ? '—' : f(active.peakLagS - analysis.sta.staPeakLagS, 2)} s</span></div>
                <div class="crow"><span>STA events</span><span class="v">{analysis.sta.nAccepted}/{analysis.sta.nEvents}</span></div>
                {#if spikeContext}<div class="crow"><span>spike rate</span><span class="v">{f(spikeContext.rateHz, 3)} Hz</span></div>{/if}
              {/if}
            </div>
          </div>
        </div>
      </aside>

      <main class="stage">
      <!-- BAND A — reconstruction: actual dF/F₀ vs predicted; spike-window slider inline.
           Shares the recording-time x with the raster band below (same xRange + yAxisSize
           gutter ⇒ the axes lock, not merely coincide). -->
      <div class="band">
        <div class="band-head">
          <span class="plot-label">reconstruction — actual dF/F₀ vs predicted (density ⊛ {method === 'free' ? 'free-vector' : 'parametric'} kernel), {colLabel(selectedCol)}</span>
          <label class="histctl">
            <span>spike window</span>
            <input type="range" min={region.grid.dt} max={HIST_WIN_MAX} step={region.grid.dt} bind:value={histWinS} />
            <output>{(histo ? histo.windowS : histWinS).toFixed(2)} s</output>
          </label>
        </div>
        <div class="band-body">
          {#if railedHidden}
            <div class="hidden-note">
              Parametric fit railed (τ at bound) — reconstruction hidden by default.
              <button class="linkbtn" onclick={() => (showRailed = true)}>Show anyways</button>
              <span class="sta-still">spike raster still shown below.</span>
            </div>
          {:else}
            <Plot
              fill
              xs={gridTimes}
              ys={traceYs}
              color="#2a9d8f"
              ys2={reconTrace}
              color2="#c0392b"
              {xRange}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              yLabel="dF/F₀"
              showXAxis={false}
              height={172}
            />
          {/if}
        </div>
        <div class="legend">
          <span class="key"><i style="background:#2a9d8f"></i>actual dF/F₀</span>
          <span class="key"><i style="background:#c0392b"></i>predicted</span>
          {#if !railedHidden}<span class="agree">reconstruction R² {f(active.r2)} — reported, not gated (§3)</span>{/if}
        </div>
      </div>

      <!-- BAND B — spike raster, FIRST-CLASS (equal height to the others; it is the recovery
           input). Binned-count + pinned [0, maxCount] axis (decoupling visibility, ADR-0024);
           wider filled bars so sparse, low-count cells read. Co-registered with band A. -->
      <div class="band">
        <div class="band-head">
          <span class="plot-label">
            spike raster — binned count per {(histo ? histo.windowS : histWinS).toFixed(2)} s bin · pinned [0, {histo ? histo.maxCount : 1}] (decoupling visibility){#if histo} · {#if histo.isFrameGrid}at the frame grid — this <strong>is</strong> the §13 recovery input{:else}drag to {region.grid.dt.toFixed(2)} s for the §13 recovery input{/if}{/if}
          </span>
        </div>
        <div class="band-body">
          {#if histo}
            <Plot
              fill
              xs={histo.centers}
              ys={histo.values}
              kind="stems"
              barSize={[0.9, 6]}
              color="var(--text-h)"
              {xRange}
              yRange={histYRange}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              yLabel="count"
              xLabel="recording time (s)"
              height={104}
            />
          {/if}
        </div>
      </div>

      <!-- BAND C — recovered kernel + STA on one shared zero-lag origin (ADR-0009 / 0024) -->
      <div class="band">
        <div class="band-head">
          <span class="plot-label">
            recovered kernel (±{WIN}s) + STA (±{STAWIN}s) — shared lag origin (ADR-0009)
            {#if overlayMode === 'normalized'}<span class="norm-badge">NORMALIZED — shape only, peaks scaled to 1; amplitude is in the readout</span>{/if}
          </span>
        </div>
        {#if railedHidden}
          <div class="hidden-note">
            Parametric fit railed (τ at bound) — kernel hidden by default.
            <button class="linkbtn" onclick={() => (showRailed = true)}>Show anyways</button>
            <span class="sta-still">STA still shown.</span>
          </div>
        {/if}
        <div class="band-body">
          {#if railedHidden}
            <Plot
              fill
              xs={analysis.kernelLag}
              ys={overlay.staV}
              color="#e76f51"
              xRange={kernelXRange}
              yRange={overlay.yRange}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              yLabel="amplitude (dF/F₀)"
              zeroLine
              xLabel="lag (s)"
              height={186}
            />
          {:else}
            <Plot
              fill
              xs={analysis.kernelLag}
              ys={overlay.kernelV}
              color="#7b2ff7"
              ys2={overlay.staV}
              color2="#e76f51"
              xRange={kernelXRange}
              yRange={overlay.yRange}
              yAxisSize={44}
              padRight={PLOT_PAD_R}
              yLabel="amplitude (dF/F₀)"
              zeroLine
              xLabel="lag (s)"
              height={186}
            />
          {/if}
        </div>
        <div class="legend">
          {#if !railedHidden}<span class="key"><i style="background:#7b2ff7"></i>recovered kernel</span>{/if}
          <span class="key"><i style="background:#e76f51"></i>STA</span>
          {#if showRailed && method === 'parametric' && analysis.pm.railed.railed}
            <button class="linkbtn" onclick={() => (showRailed = false)}>Hide railed output</button>
          {/if}
          {#if !railedHidden && !analysis.staEmpty}
            <span class="agree">
              kernel peak {f(active.peakLagS, 2)} s · amp {f(method === 'free' ? active.peakAmpAdj : active.peakAmp)} · STA peak {f(analysis.sta.staPeakLagS, 2)} s
            </span>
          {/if}
        </div>
      </div>

      </main>
    </div>
  {/if}
</section>

<style>
  .tab2 {
    display: flex;
    flex-direction: column;
    gap: 16px;
    /* fill the full-height app shell (App.svelte main.wide) so the rail + bands
       own the viewport (ADR-0026); harmless when the parent isn't height-bound. */
    flex: 1;
    min-height: 0;
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
  .filebtn-sm input {
    display: none;
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
  .filebtn input {
    display: none;
  }
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
  .summary {
    font-size: 14px;
    color: var(--text);
    margin: 0;
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
  .histctl {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-h);
    white-space: nowrap;
  }
  .histctl input {
    width: 130px;
  }
  .histctl output {
    font-family: var(--mono);
    font-size: 12px;
    min-width: 46px;
    text-align: right;
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

  /* ===== ADR-0026 layout: workflow-staged left rail + plot stage ===== */
  .layout {
    display: flex;
    gap: 16px;
    align-items: stretch;
    min-height: 0;
    height: 100%;
  }
  .rail {
    width: 300px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    padding-right: 14px;
    border-right: 1px solid var(--border);
    box-sizing: border-box;
  }
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
  .rail-h .cap {
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
  .rail .seg {
    display: flex;
  }
  .rail .seg button {
    flex: 1;
  }
  /* compact λ/noise sliders in the narrow rail */
  .rail .ctl {
    grid-template-columns: 1fr auto;
    grid-template-areas: 'lab out' 'rng rng';
    gap: 3px 8px;
  }
  .rail .ctl > span {
    grid-area: lab;
    font-size: 12px;
  }
  .rail .ctl > output {
    grid-area: out;
  }
  .rail .ctl > input {
    grid-area: rng;
    width: 100%;
  }

  /* §3 checks — compact label:value readout in the rail */
  .checks-rail .rail-bd {
    gap: 10px;
  }
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

  .stage {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* three co-equal ABSOLUTE-height plot bands, full vertical extent (ADR-0026) */
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
