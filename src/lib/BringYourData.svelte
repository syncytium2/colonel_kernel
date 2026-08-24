<script>
  // Tab 0 — "Bring your own data". The on-ramp for the question the app never
  // answered anywhere: what file do I need, and how do I make it?
  //
  // Tab 2 accepted a drop and named two extensions, but nothing in the app stated the
  // schema. The contract lived only in ADR-0016 / ADR-0019, which a visitor has never
  // read. ADR-0019 §5 named "a provided template workbook" as a v1 deliverable and left
  // it TBD; this section is that deliverable's front door.
  //
  // The template is a WORKING recording, not an empty skeleton, so the quick start is a
  // real loop: download → drop into Tab 2 → watch a kernel come out → paste your own
  // columns over it. The user's first successful load happens before they risk their
  // own data on a format they have not seen work.

  // Facts only — NOT the generator. template-facts.js imports nothing, so quoting the
  // example's numbers in the copy costs the initial bundle almost nothing; the generator
  // (and SheetJS behind it) stays behind the dynamic imports in template-download.js.
  import { TEMPLATE_FACTS } from './core/template-facts.js';
  import { downloadTemplateXlsx, downloadTemplateCsv } from './template-download.js';

  let { onNavigate } = $props();

  // idle | working | done | error, per format — so a slow SheetJS chunk on a cold cache
  // reads as progress rather than a dead button.
  let xlsxState = $state('idle');
  let csvState = $state('idle');
  let failure = $state(null);

  async function downloadXlsx() {
    if (xlsxState === 'working') return;
    xlsxState = 'working';
    failure = null;
    try {
      await downloadTemplateXlsx();
      xlsxState = 'done';
    } catch (e) {
      xlsxState = 'error';
      failure = String(e && e.message ? e.message : e);
    }
  }

  async function downloadCsv() {
    if (csvState === 'working') return;
    csvState = 'working';
    failure = null;
    try {
      await downloadTemplateCsv();
      csvState = 'done';
    } catch (e) {
      csvState = 'error';
      failure = String(e && e.message ? e.message : e);
    }
  }

  const label = (s, idle) => (s === 'working' ? 'Preparing…' : s === 'done' ? 'Downloaded ✓' : idle);
</script>

<section class="byod" id="bring-your-own">
  <h2>Bring your own recording</h2>
  <p class="plain">
    Colonel Kernel needs two things from you: a <strong>calcium trace</strong> and the
    <strong>spike times you already know</strong> — from paired ephys, or any source you
    trust. It does not find the spikes for you; knowing them is what makes the recovered
    kernel a measurement rather than a guess.
  </p>

  <div class="cta-row">
    <button class="dl primary" onclick={downloadXlsx} disabled={xlsxState === 'working'}>
      <span class="dl-title">{label(xlsxState, 'Download the template workbook')}</span>
      <span class="dl-sub">.xlsx · recommended · supports regions</span>
    </button>
    <button class="dl" onclick={downloadCsv} disabled={csvState === 'working'}>
      <span class="dl-title">{label(csvState, 'Download the CSV version')}</span>
      <span class="dl-sub">.csv · no spreadsheet needed · single region</span>
    </button>
  </div>

  {#if failure}
    <p class="failure" role="alert">Could not build the template: {failure}</p>
  {/if}

  <p class="plain tip">
    The template is not an empty skeleton — it is a small working recording
    ({TEMPLATE_FACTS.frames} frames at {TEMPLATE_FACTS.rateHz} Hz, {TEMPLATE_FACTS.rois} ROIs,
    {TEMPLATE_FACTS.regions.length} regions).
    <strong>Download it and drop it straight into
    <button class="inline-link" onclick={() => onNavigate?.(2)}>Tab 2</button></strong>:
    a kernel comes out, and you have seen the whole loop work before you risk your own
    data on a format you have never watched succeed. Then paste your columns over the
    example rows.
  </p>

  <details class="spec">
    <summary>What the file has to contain</summary>

    <h3>The workbook (.xlsx) — three sheets</h3>
    <p class="plain">Sheet names are matched case-insensitively.</p>
    <table>
      <thead>
        <tr><th>sheet</th><th></th><th>contents</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>trace</code></td>
          <td class="req">required</td>
          <td>
            A <code>time</code> column in seconds, then one column per ROI, one row per
            frame. <code>time</code> must strictly increase — a file where it does not is
            rejected — and should start at 0, since spike times and region bounds are read
            on that same clock. Don't store the
            frame interval — it is derived from <code>time</code>. The first ROI column is
            taken as the targeted cell.
          </td>
        </tr>
        <tr>
          <td><code>spikes</code></td>
          <td class="req">required</td>
          <td>
            One column headed <code>spikes</code> (matched case-insensitively, surrounding
            spaces ignored), holding action-potential times
            in seconds on the same clock as <code>trace.time</code>. Any length —
            it does not have to match the frame count, and must never be padded to.
          </td>
        </tr>
        <tr>
          <td><code>metadata</code></td>
          <td class="opt">optional</td>
          <td>
            One row per region: <code>region</code>, <code>start_s</code>,
            <code>end_s</code>. Regions may not overlap; gaps between them are fine. Omit
            this sheet and the whole recording is analyzed as one region.
          </td>
        </tr>
      </tbody>
    </table>

    <h3>Three rules that will bite you</h3>
    <ul>
      <li>
        <strong>Numbers must be numbers.</strong> Anything the spreadsheet can't hand over
        as a number — units inside the cell, stray text, a locale decimal comma — reads as
        missing. A missing sample should be an <em>empty</em> cell, never a zero.
      </li>
      <li>
        <strong>One clock for everything.</strong> Trace times, spike times and region
        bounds are all seconds on one axis, where t = 0 is the moment recording began.
      </li>
      <li>
        <strong>Region names change how a region is analyzed.</strong> A name containing
        <code>baseline</code> analyzes the <strong>last 20 minutes</strong> of the period;
        one containing <code>high K</code> or <code>hiK</code> uses the whole period; and
        exactly <code>(full recording)</code> or <code>whole</code> — those two names only,
        not merely containing them — takes the raw period untouched.
        <em>Any other name</em> is treated as a drug wash-in — the first 2 minutes are
        dropped, then up to 20 minutes analyzed. A region with under 12 minutes of analyzable
        time is flagged but still analyzed, <em>except</em> a wash-in shorter than the
        2-minute delay, which leaves nothing to analyze and is skipped. All three numbers —
        the 2-minute delay, the 12-minute floor, the 20-minute cap — are adjustable in Tab 2.
      </li>
    </ul>

    <h3>The CSV alternative</h3>
    <p class="plain">
      One file with a <code>time</code> column, a <code>spikes</code> column, and one or
      more ROI columns. The spike column is shorter than the others — leave the cells
      below the last spike blank rather than padding them. <strong>Include the spike
      column:</strong> a CSV without one still loads, with an empty spike train, and there
      is nothing to recover a kernel from. A CSV also carries no region table, so it is
      always analyzed as a single region; that is the reason to prefer the workbook if you
      have one.
    </p>
  </details>

  <!-- The claim used to end "makes no network requests at all", which this very button
       falsifies: building the workbook dynamically imports the xlsx bundle from this origin.
       FOUNDATIONS §6 forbids THIRD-PARTY requests; same-origin ones are expected. -->
  <p class="plain privacy">
    Nothing you load is uploaded, and neither is anything you download — the template is
    built inside your browser, from code served by this site and nowhere else.
  </p>
</section>

<style>
  .byod {
    border: 1px solid var(--accent-border);
    border-radius: 12px;
    padding: 22px 24px;
    background: var(--accent-bg);
  }
  .byod h2 { margin-top: 0; }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 18px 0 14px;
  }
  .dl {
    flex: 1 1 260px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    text-align: left;
    font: inherit;
    padding: 14px 18px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }
  .dl:hover:not(:disabled) { border-color: var(--accent-border); box-shadow: var(--shadow); }
  .dl:disabled { opacity: 0.6; cursor: progress; }
  /* The fill is --link-accent, not --accent. White on the UI accent measures 4.39:1 in light
     and 2.64:1 in DARK, both failing WCAG 1.4.3 for 15.5px/650 text — and this is the page's
     primary call to action. --link-accent is the same hue darkened for exactly this reason
     (app.css), and white on it clears AA in both themes. The 0.85-alpha sub-label went solid
     for the same reason: it was 3.57:1 light / 2.32:1 dark. */
  .dl.primary {
    border-color: var(--accent-solid, var(--accent));
    background: var(--accent-solid, var(--accent));
    color: #fff;
  }
  .dl.primary .dl-sub { color: #fff; }
  .dl-title { font-size: 15.5px; font-weight: 650; }
  .dl.primary .dl-title { color: #fff; }
  .dl-sub { font-size: 12.5px; font-family: var(--mono); color: var(--text); }

  .failure {
    margin: 0 0 12px;
    font-size: 14px;
    color: #c0392b;
    font-weight: 600;
  }

  .tip { margin-top: 0; }
  .privacy { font-size: 14px; margin-bottom: 0; }

  .inline-link {
    font: inherit;
    background: none;
    border: none;
    padding: 0;
    color: var(--link-accent, var(--accent));
    font-weight: 600;
    cursor: pointer;
  }
  .inline-link:hover { text-decoration: underline; }

  .spec { margin: 18px 0 14px; }
  .spec summary {
    cursor: pointer;
    font-size: 15.5px;
    font-weight: 600;
    color: var(--text-h);
  }
  .spec h3 { font-size: 15px; color: var(--text-h); margin: 20px 0 8px; }
  .spec ul { margin: 0; padding-left: 20px; }
  .spec li { font-size: 15px; line-height: 1.55; color: var(--text); margin: 8px 0; max-width: 66ch; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 4px;
    font-size: 14.5px;
  }
  th, td {
    text-align: left;
    vertical-align: top;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    line-height: 1.5;
    color: var(--text);
  }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text); }
  td:first-child { white-space: nowrap; }
  .req, .opt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  .req { color: var(--link-accent, var(--accent)); font-weight: 700; }
  code {
    font-family: var(--mono);
    font-size: 0.92em;
    background: var(--code-bg);
    padding: 1px 5px;
    border-radius: 4px;
  }

  /* The spec table is the one thing here that cannot reflow below ~460px; let it
     scroll inside its own box rather than pushing the page sideways. */
  @media (max-width: 560px) {
    .byod { padding: 18px 16px; }
    table { display: block; overflow-x: auto; white-space: normal; }
  }
</style>
