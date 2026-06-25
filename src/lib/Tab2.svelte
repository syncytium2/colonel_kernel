<script>
  // Tab 2 — the flagship (FOUNDATIONS §2). INWARD SLICE: one ROI's full
  // recover-and-four-check readout, end to end, focused on rois[0] (file 80 ROI 1,
  // the canonized positive control). Multi-column re-fan is the NEXT slice.
  //
  // Geometry (matches MATLAB): the recovered kernel (±WIN s) and the STA (±STAWIN s)
  // are OVERLAID on ONE shared lag/amplitude plot about the common zero-lag origin —
  // peak-lag agreement is read straight off it.
  //
  // The four §3 checks (ADR-0011: machinery gated, fit reported — NO rollup verdict;
  // the spread across checks is the signal):
  //   1 PLAUSIBILITY   kernelDiagnostics(kernel)            — direct call
  //   2 RESIDUAL       circularConvolve(density, kernel)    — reconstruction R², reported
  //   3 STABILITY      recoverKernel across log-λ 0.002..3  — peak-lag drift
  //   4 STA AGREEMENT  STA peak lag vs kernel peak lag      — read on the shared plot
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
    addAWGN,
    sigmaForLevel,
    mulberry32,
  } from './core/index.js';

  // Pipeline constants — match the validated lab driver / machinery check.
  const WIN = 5; // kernel half-window (s); windowSamples = round(WIN/dt) (ADR-0004)
  const STAWIN = 2; // STA half-window (s)
  const STABASE = 0.5; // STA per-event pre-spike baseline window (s)
  const NOISE_SEED = 20240; // reproducible noise realization for the targeted ROI

  // Regularization slider is LOG-λ over the canon-characterized sweep 0.002–3
  // (ADR-0004); a linear range slider drives log10(λ).
  const LAM_LO = 0.002;
  const LAM_HI = 3.0;
  const LOG_LO = Math.log10(LAM_LO);
  const LOG_HI = Math.log10(LAM_HI);
  const NSWEEP = 13; // stability sweep points (geometric, 0.002→3)

  let region = $state(null);
  let error = $state(null);
  let fileName = $state('');
  let dragging = $state(false);

  let lambdaLog = $state(LOG_LO); // log10(λ); default λ = 0.002 (sweep floor / UI default)
  let noiseLevel = $state(0); // × cohort-typical σ, 0–10, default 0/off (ADR-0015)
  const lambda = $derived(10 ** lambdaLog);

  async function handleFiles(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    fileName = file.name;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // SEAM (ADR-0019 ingest spine ready — NOT wired this pass). Routes .xlsx to
        // the workbook reader; the dynamic import keeps SheetJS in its own chunk
        // (code-split, FOUNDATIONS §6) so the CSV/teaching paths pay nothing.
        // DOWNSTREAM (not built here): region-setting UI, per-region windowing into
        // the readout, cross-region comparison, multi-ROI re-fan — see
        // load-xlsx.js (loadWorkbook / regionsOf / windowRegion).
        const { loadWorkbook, regionsOf } = await import('./core/load-xlsx.js');
        const rec = loadWorkbook(await file.arrayBuffer(), { source: file.name });
        region = null;
        error = `xlsx ingest spine ready: ${rec.meta.nROIs} ROI, ${rec.meta.nSpikes} spikes, ${regionsOf(rec).length} region(s). UI wiring is downstream (not in this pass).`;
        return;
      }
      const text = await file.text();
      region = loadCsv(text, { source: file.name });
      error = null;
    } catch (e) {
      error = String(e && e.message ? e.message : e);
      region = null;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    handleFiles(e.dataTransfer?.files);
  }

  // --- shared display axes (core untouched) ---
  const gridTimes = $derived(region ? Array.from(region.grid.times) : []);
  const xRange = $derived(region ? [region.meta.t0, region.meta.tEnd] : null);
  // DISPLAY stems (not the analysis input — recovery rasterizes to binned-count below).
  const spikeTimes = $derived(region ? Array.from(region.spikeTimes) : []);
  const spikeYs = $derived(spikeTimes.map(() => 1));
  const kernelXRange = [-WIN, WIN]; // the overlay axis; STA (±STAWIN) sits inside it.

  // --- the targeted ROI (rois[0]) and the shared analysis inputs ---
  const targeted = $derived(region ? region.rois[0] : null);

  // binned-count spike density on the trace timebase, zero-padded to a power of two
  // (§13, ADR-0013 preFirstBin 'keep'; ADR-0017: raw, no detrend/window). Depends
  // only on the region, so it is computed once per load.
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

  // One noise realization for the targeted ROI (depends on region + noise level).
  const noisyTrace = $derived.by(() => {
    if (!region || !density) return null;
    const { n, N } = density;
    const sigma = sigmaForLevel(noiseLevel);
    const noise = sigma > 0 ? addAWGN(new Float64Array(n), sigma, mulberry32(NOISE_SEED)) : null;
    // recovery trace: NaN→0 + noise, zero-padded to N.
    const recReal = new Float64Array(N);
    for (let k = 0; k < n; k++) {
      const v = Number.isFinite(targeted.samples[k]) ? targeted.samples[k] : 0;
      recReal[k] = v + (noise ? noise[k] : 0);
    }
    // STA trace: raw samples (NaN preserved → omitnan) + noise.
    let staTrace = targeted.samples;
    if (noise) {
      staTrace = new Float64Array(n);
      for (let k = 0; k < n; k++) staTrace[k] = targeted.samples[k] + noise[k];
    }
    return { recReal, staTrace };
  });

  /** Embed a symmetric kernel back into a length-N circular signal (zero-lag at 0). */
  function embedKernel(kernel, N, ws) {
    const kPad = new Float64Array(N);
    kPad[0] = kernel.samples[ws];
    for (let j = 1; j <= ws; j++) {
      kPad[j] = kernel.samples[ws + j]; // +lag at low indices
      kPad[N - j] = kernel.samples[ws - j]; // −lag wrapped to high end
    }
    return kPad;
  }

  // --- the live readout for the targeted ROI (region + λ + noise) ---
  const analysis = $derived.by(() => {
    if (!region || !density || !noisyTrace) return null;
    const dt = region.grid.dt;
    const { n, N, sdPad } = density;
    const ws = Math.round(WIN / dt);
    const staWs = Math.round(STAWIN / dt);
    const { recReal, staTrace } = noisyTrace;

    // CHECK 1 — plausibility (direct). peakAmpAdj is display-only: the +0.6 s peak
    // height relative to its pre-zero-lag baseline (STABASE window) so the tilt
    // doesn't understate the transient. The kernel trace stays raw (ADR-0017).
    const kernel = recoverKernel(recReal, sdPad, { windowSamples: ws, dt, lambda });
    const diag = kernelDiagnostics(kernel);
    const preBaseline = preZeroBaselineMean(kernel, STABASE);
    const peakAmpAdj = diag.peakAmp - preBaseline;

    // CHECK 2 — reconstruction residual (forward circularConvolve; reported, ADR-0011).
    const kPad = embedKernel(kernel, N, ws);
    const recon = circularConvolve(sdPad, kPad);
    let ssRes = 0, ssTot = 0, mean = 0;
    for (let k = 0; k < n; k++) mean += recReal[k];
    mean /= n;
    for (let k = 0; k < n; k++) {
      const r = recReal[k] - recon[k];
      ssRes += r * r;
      const d = recReal[k] - mean;
      ssTot += d * d;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : NaN;
    const rmse = Math.sqrt(ssRes / n);
    // machinery sanity: the full latent inverts the trace exactly (R²≈1).
    const latent = deconvolveCircular(recReal, sdPad, lambda);
    const reconFull = circularConvolve(sdPad, latent);
    let ssResFull = 0;
    for (let k = 0; k < n; k++) { const r = recReal[k] - reconFull[k]; ssResFull += r * r; }
    const r2Full = ssTot > 0 ? 1 - ssResFull / ssTot : NaN;

    // CHECK 4 — STA cross-method agreement.
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

    // Overlay series: STA aligned onto the kernel lag grid (shared dt/origin), null
    // outside ±STAWIN so uPlot draws a gap there.
    const kernelLag = Array.from(kernel.times);
    const kernelV = Array.from(kernel.samples);
    const staOnKernel = new Array(kernel.samples.length).fill(null);
    if (!sta.empty) {
      for (let k = 0; k < sta.samples.length; k++) {
        const idx = ws - staWs + k; // map STA lag → kernel index
        if (idx >= 0 && idx < staOnKernel.length) staOnKernel[idx] = sta.samples[k];
      }
    }

    // reconstruction trace (predicted = density ⊛ recovered kernel) over real n.
    const reconTrace = Array.from(recon.slice(0, n));

    return {
      kernelLag,
      kernelV,
      staOnKernel,
      staEmpty: sta.empty,
      reconTrace,
      plausibility: { ...diag, peakAmpAdj, preBaseline },
      residual: { r2, rmse, r2Full },
      sta: {
        empty: sta.empty,
        nEvents: sta.nEvents,
        nAccepted: sta.nAccepted,
        nBlocked: sta.nBlocked,
        staPeakLagS,
        staPeakAmp,
        kernelPeakLagS: diag.peakLagS,
        dLagS: sta.empty ? NaN : staPeakLagS - diag.peakLagS,
      },
    };
  });

  // CHECK 3 — stability across the log-λ sweep (region + noise; NOT the slider λ).
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

  // Shared y for the overlay (kernel + STA together).
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
  const overlayYRange = $derived(
    analysis ? rangeOf([analysis.kernelV, analysis.staOnKernel]) : null,
  );
  const traceYs = $derived(
    targeted ? Array.from(targeted.samples, (v) => (Number.isFinite(v) ? v : null)) : [],
  );

  const f = (x, p = 4) => (Number.isFinite(x) ? x.toFixed(p) : '—');
  const e = (x) => (Number.isFinite(x) ? x.toExponential(2) : '—');
</script>

<!-- drop is sensitive across the whole tab; the visible affordance shrinks once
     a file is loaded so the readout has room (load path unchanged). -->
<section
  class="tab2"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  {#if region}
    <div class="loader-strip">
      <span class="fname">{fileName}</span>
      <label class="filebtn-sm">
        choose a different file
        <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
      </label>
      {#if error}<span class="error">· {error}</span>{/if}
    </div>
  {:else}
    <div class="dropzone" class:dragging role="button" tabindex="0">
      <p>Drop a region CSV here, or</p>
      <label class="filebtn">
        choose a file
        <input type="file" accept=".csv,.xlsx,text/csv" onchange={(e) => handleFiles(e.currentTarget.files)} />
      </label>
      {#if fileName}<p class="fname">{fileName}</p>{/if}
      {#if error}<p class="error">Could not load: {error}</p>{/if}
    </div>
  {/if}

  {#if region && analysis}
    <p class="summary">
      <strong>{region.rois.length} ROIs</strong>
      · showing <strong>ROI 1</strong> (targeted) · {region.meta.nSpikes} spikes · {region.grid.n} frames · dt
      {region.grid.dt.toFixed(3)} s
      <span class="muted">— single-ROI slice; column re-fan is next</span>
    </p>

    <div class="controls">
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
    </div>

    <div class="readout">
      <!-- CHECK 2 evidence, full width: spikes + reconstruction (actual vs predicted)
           on the shared recording-time axis — shows where the fit holds and breaks. -->
      <div class="panel">
        <div class="plot-label">spikes (display)</div>
        <Plot
          xs={spikeTimes}
          ys={spikeYs}
          kind="stems"
          color="var(--text-h)"
          {xRange}
          yAxisSize={44}
          showXAxis={false}
          height={56}
        />
        <div class="plot-label">
          reconstruction — actual dF/F₀ vs predicted (density ⊛ recovered kernel), ROI 1
        </div>
        <Plot
          xs={gridTimes}
          ys={traceYs}
          color="#2a9d8f"
          ys2={analysis.reconTrace}
          color2="#c0392b"
          {xRange}
          yAxisSize={44}
          xLabel="recording time (s)"
          height={150}
        />
        <div class="legend">
          <span class="key"><i style="background:#2a9d8f"></i>actual dF/F₀</span>
          <span class="key"><i style="background:#c0392b"></i>predicted</span>
          <span class="agree">retained-kernel R² {f(analysis.residual.r2)} — fit breaks at calcium-without-spikes (§3)</span>
        </div>
      </div>

      <!-- the overlay: kernel + STA on one shared zero-lag origin -->
      <div class="panel">
        <div class="plot-label">
          recovered kernel (±{WIN}s) + STA (±{STAWIN}s) — shared lag/amplitude origin
        </div>
        <Plot
          xs={analysis.kernelLag}
          ys={analysis.kernelV}
          color="#7b2ff7"
          ys2={analysis.staOnKernel}
          color2="#e76f51"
          xRange={kernelXRange}
          yRange={overlayYRange}
          yAxisSize={44}
          zeroLine
          xLabel="lag (s)"
          height={186}
        />
        <div class="legend">
          <span class="key"><i style="background:#7b2ff7"></i>recovered kernel</span>
          <span class="key"><i style="background:#e76f51"></i>STA</span>
          {#if !analysis.staEmpty}
            <span class="agree">
              kernel peak {f(analysis.plausibility.peakLagS, 2)} s · STA peak {f(analysis.sta.staPeakLagS, 2)} s
            </span>
          {/if}
        </div>
      </div>
    </div>

    <!-- four §3 checks: four separate readouts, raw numbers, NO rollup verdict -->
    <div class="checks">
      <div class="check">
        <h4>1 · Plausibility <span class="tag">kernelDiagnostics</span></h4>
        <dl>
          <div><dt>peak lag</dt><dd>{f(analysis.plausibility.peakLagS, 2)} s</dd></div>
          <div><dt>peak amp (vs baseline)</dt><dd>{f(analysis.plausibility.peakAmpAdj)}</dd></div>
          <div><dt>peak amp (abs)</dt><dd>{f(analysis.plausibility.peakAmp)}</dd></div>
          <div>
            <dt>decay τ</dt>
            <dd>{Number.isFinite(analysis.plausibility.tauDecayS) ? `${f(analysis.plausibility.tauDecayS, 2)} s` : 'n/a (tilt)'}</dd>
          </div>
          <div><dt>acausal ratio</dt><dd>{f(analysis.plausibility.acausalRatio)}</dd></div>
        </dl>
      </div>

      <div class="check">
        <h4>2 · Reconstruction residual <span class="tag">reported, not gated</span></h4>
        <dl>
          <div><dt>full-latent R²</dt><dd>{f(analysis.residual.r2Full)}</dd></div>
          <div><dt>retained-kernel R²</dt><dd>{f(analysis.residual.r2)}</dd></div>
          <div><dt>RMSE</dt><dd>{e(analysis.residual.rmse)}</dd></div>
          <div class="note">full-latent ≈1 = path sane; low retained = §3 decoupling</div>
        </dl>
      </div>

      <div class="check">
        <h4>3 · Stability <span class="tag">log-λ {LAM_LO}–{LAM_HI}</span></h4>
        {#if stability}
          <dl>
            <div><dt>peak lag range</dt><dd>{f(stability.peakLagMinS, 2)}–{f(stability.peakLagMaxS, 2)} s</dd></div>
            <div><dt>lag drift</dt><dd>{f(stability.peakLagRangeS, 3)} s</dd></div>
            <div><dt>peak amp range</dt><dd>{e(stability.peakAmpMin)} … {e(stability.peakAmpMax)}</dd></div>
            <div class="note">λ-stable peak lag = the positive control</div>
          </dl>
        {/if}
      </div>

      <div class="check">
        <h4>4 · STA agreement <span class="tag">spike-rate regime</span></h4>
        {#if analysis.sta.empty}
          <dl><div class="note">STA empty — no accepted events</div></dl>
        {:else}
          <dl>
            <div><dt>kernel vs STA peak</dt><dd>{f(analysis.sta.kernelPeakLagS, 2)} / {f(analysis.sta.staPeakLagS, 2)} s</dd></div>
            <div><dt>Δ lag</dt><dd>{f(analysis.sta.dLagS, 2)} s</dd></div>
            <div><dt>STA events</dt><dd>{analysis.sta.nAccepted}/{analysis.sta.nEvents}</dd></div>
            {#if spikeContext}<div><dt>spike rate</dt><dd>{f(spikeContext.rateHz, 3)} Hz</dd></div>{/if}
          </dl>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .tab2 {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .tab2.dragging {
    outline: 2px dashed var(--accent);
    outline-offset: 6px;
    border-radius: 8px;
  }
  .loader-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: var(--text);
  }
  .loader-strip .fname {
    margin: 0 !important;
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

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 22px;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
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

  /* full-width stacked panels: reconstruction (recording axis) + kernel/STA overlay */
  .readout {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--bg);
  }
  .plot-label {
    font-size: 11px;
    color: var(--text);
    margin: 6px 0 2px;
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

  .checks {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 900px) {
    .checks {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .check {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    background: var(--bg);
  }
  .check h4 {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--text-h);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .check .tag {
    font-size: 10px;
    font-weight: 500;
    color: var(--text);
    opacity: 0.7;
    font-family: var(--mono);
  }
  .check dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .check dl > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }
  .check dt {
    color: var(--text);
  }
  .check dd {
    margin: 0;
    font-family: var(--mono);
    color: var(--text-h);
    text-align: right;
  }
  .check .note {
    display: block;
    font-size: 11px;
    color: var(--text);
    opacity: 0.7;
    font-style: italic;
  }
</style>
