# Colonel Kernel

A client-side 1D convolution / deconvolution tool for calcium imaging — a teaching
demonstrator and a ground-truth kernel-verification instrument.

**→ [kernel.tonydefazio.com](https://kernel.tonydefazio.com)** · no install, no account,
nothing uploaded.

## Why this tool exists

![Three panels of a simulated recording. Top: 139 action potentials in 46 bursts of one to five, shown as red ticks beneath a blue calcium trace, with three calcium events shaded. Bottom left: one shaded event enlarged, a tall brief symmetric transient with no action potentials beneath it, next to an ordinary burst. Bottom right: another, rising more slowly and decaying for most of a minute, with a later burst riding on its tail.](docs/img/premise_sim.png)

The red ticks are action potentials, arriving in bursts of one to five; the blue trace is
the calcium signal. Every burst stamps down the same shape once per spike, so a five-spike
burst produces a transient about five times a single spike's. That is the assumption this
tool exists to test, and mostly it holds.

But **three** of the calcium events here have *no action potentials underneath them at
all*, and the tallest is larger than anything the spikes produced. The lower panels enlarge
two of them, on the **same dF/F₀ scale**. One is tall, brief and symmetric; the other rises
slowly and takes most of a minute to fall, with a later burst riding on its decaying tail.
Neither looks like the spike-driven transients beside them — which is the tell.

Real recordings do this. Hand that trace to a tool that assumes every calcium event came
from a spike and it will happily return a kernel — one distorted by events the spikes never
caused. Colonel Kernel exists to **measure** the relationship instead: to recover the shape
that links spikes to calcium, or to show that no single shape does. (See
[FOUNDATIONS](FOUNDATIONS.md) §3–4.)

<sub>**Simulated**, not a recording — [`src/lib/core/premise-sim.js`](src/lib/core/premise-sim.js),
built from the app's own convolution primitives and matched to a real recording's kernel and
noise floor. **No unpublished data ships in this tool.**</sub>

## What's in it

| Tab | What you do there |
|---|---|
| **0 · Start here** | What the tool is, in plain language, plus the input format and a template. |
| **1 · Convolution** | Place spikes, shape a kernel, watch the calcium trace appear. |
| **2 · Kernel recovery** | **Start here if you have data.** Load a recording with known spikes, recover the kernel, and read the diagnostics that say how much to trust it. |
| **3 · Spike inference** | The hard reverse problem — guessing spikes from a trace. Deliberately limited: it shows where naive inference breaks down, which is why dedicated packages exist. |

Tabs 1–3 each carry an optional **challenge mode** — fit a hidden trace, design a kernel
against the deconvolution, or place spikes by eye against the machine.

**What it does not do.** It does not detect spikes for you — you supply them, and that is
the point. It does no image processing: no motion correction, no segmentation, no ROI
extraction. It is not a replacement for CASCADE, MLspike or OASIS, and Tab 3 exists to
show you why those tools are hard rather than to compete with them.

The mathematics, the algorithms, the validation rules and a suggested citation live in a
standalone [Methods & Mathematical Reference](https://kernel.tonydefazio.com/methods).

## Using your own recording

You bring two things: a **calcium trace** and the **spike times you already know** (paired
ephys, or any source you trust). Knowing the spikes is what makes the recovered kernel an
estimate you can check, rather than one inference stacked on another — and the tool reports
how far to trust it.

**Getting results out.** A workbook that carries a `metadata` region table gets a
per-recording **summary report → Save as PDF**. Everything else — CSVs, and workbooks
without regions — is on-screen only; there is no numeric export of the recovered kernel
yet. That is a known gap, not a design position.

**Start from the template.** Tab 0 offers it as `.xlsx` or `.csv`. It is not an empty
skeleton but a small working recording, so you can drop it straight back into Tab 2, watch
a kernel come out, and only then paste your own columns over the example rows.

The workbook is three sheets, matched case-insensitively:

| sheet | | contents |
|---|---|---|
| `trace` | required | a `time` column in seconds, then one column per ROI, one row per frame. `time` must strictly increase; the frame interval is derived from it, never stored. Whichever ROI column comes **first positionally** is the targeted cell, whatever its header says. |
| `spikes` | required | one column, header `spikes`, holding action-potential times in seconds on the same clock as `trace.time`. Any length — it need not match the frame count, and must never be padded to. |
| `metadata` | optional | one row per region: `region`, `start_s`, `end_s`. Regions may not overlap; gaps between them are fine. Omit the sheet and the whole recording is analyzed as one region. |

Three rules that will bite you:

- **Numbers must be numbers.** Anything Excel can't hand over as a number — units in the
  cell, stray text, a locale decimal comma — reads as missing. A missing sample should be
  an *empty* cell, never a zero.
- **One clock for everything.** Trace times, spike times and region bounds are all seconds
  on one axis, zero-based at the start of the recording. (The loader only requires that
  `time` increases; the shared origin is the contract's convention, and everything
  downstream assumes it.)
- **Region names change how a region is analyzed.** A name containing `baseline` analyzes
  the **last 20 minutes** of the period; one containing `high K` or `hiK` uses the whole
  period. *Any other name* is treated as a drug wash-in: the first 2 minutes are dropped,
  then up to 20 minutes analyzed. Regions under 12 minutes are flagged but still analyzed.
  All three numbers are adjustable in Tab 2, and matching ignores case and punctuation.

A CSV is one file with a `time` column, one or more ROI columns, and a `spikes` column left
blank below the last spike rather than padded. Any header that is not `time` or `spikes` is
read as an ROI. CSVs carry no region table, so they are always analyzed as a single region
— which is the reason to prefer the workbook if you have one.

Everything is held in memory, so recording size is bounded by your machine rather than an
upload limit — but a very large workbook will keep the tab busy while it parses. Desktop
Chrome, Firefox and Safari; the plots need a mouse, so phones and tablets are not currently
usable.

The reasoning behind this contract is in
[ADR-0019](docs/adr/0019-tab2-input-contract-workbook-per-recording.md) and
[ADR-0038](docs/adr/0038-input-template-working-example-recording.md).

## Your recordings stay in your browser

The app has no backend and makes no network requests once the page has loaded. Your file is
read, analyzed and plotted in the browser, and is never sent anywhere by this tool.

- **No backend.** Every computation — convolution, FFT, deconvolution — runs locally.
- **No third-party requests.** No CDNs, no web fonts, no analytics, no error reporting.
  Every library and asset is bundled into the page.
- **Enforced by the browser, not just intended.** The shipped pages carry
  `connect-src 'none'; default-src 'self'`, so the browser refuses any scripted network
  request — including from code we did not write.
- **Checked at deploy.** `npm run deploy` fails if Cloudflare's analytics beacon appears on
  a live route, and `public/_headers` sets `no-transform` so the host cannot rewrite the
  HTML in transit.
- **No persistent storage** beyond files you explicitly open or download.

**Check it yourself.** On the live site press F12 (⌥⌘I on a Mac), open the Network tab and
reload. Every request should come from `kernel.tonydefazio.com` and nowhere else. (That is
the built site; a local dev server is deliberately unrestricted.)

**What this does not cover.** Browser extensions run outside the page's security policy and
can read anything on screen — if you are handling unpublished data, use a clean profile.
The policy blocks scripted requests and third-party resources; it cannot stop a page from
navigating somewhere. And a host can inject scripts at the edge: Cloudflare's analytics
beacon appeared in this page's HTML for over a week without any code change on our side.
The policy blocked it and nothing left — which is why the policy exists, rather than a
promise that nothing will ever be injected.

## Running it locally

Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev        # dev server
npm run build      # static production bundle
npm run preview    # serve the built bundle
```

`npm install` fetches SheetJS from `cdn.sheetjs.com` rather than the npm registry
([ADR-0036](docs/adr/0036-sheetjs-install-from-maintained-tarball.md) explains why), so
behind a registry mirror or proxy that URL has to be reachable. It is a build-time fetch
only — the shipped app still makes no network requests.

Tests and checks:

```sh
npm run test:core             # the core numerical suite
npm run template-acceptance   # round-trips the input template through the real loaders
npm run xlsx-acceptance       # ingest spine vs real workbooks (needs local golden data)
```

The production bundle is static and self-hosts everything, so any static host will serve
it. Deployment here is Cloudflare Workers via `npm run deploy`, which is the runbook — it
gates on preconditions, runs the core test suite, verifies the CSP in both the built HTML
and the live response, polls until both URLs serve the new bundle, and records what went
live in [DEPLOYED.md](DEPLOYED.md).

## How this repo is documented

This section is for people working *on* the tool. If you are here to *use* it, the
[Methods reference](https://kernel.tonydefazio.com/methods) is what you want.

- **[FOUNDATIONS.md](FOUNDATIONS.md)** — the settled design decisions and the reasoning
  behind them. Canonical, and written for contributors rather than users.
- **[docs/adr/](docs/adr/)** — one file per decision, with the context that produced it.
  [Index here](docs/adr/README.md).
- **[NEXT_SESSION.md](NEXT_SESSION.md)** — the current working state and what is open.
- **[docs/doc_review_process.md](docs/doc_review_process.md)** — the adversarial review any
  document deliverable runs through before it ships.

Two standing dependency checks — **Defense** (nothing known-vulnerable) and **Up-to-date**
(nothing silently frozen) — are enforced by `npm audit`, Dependabot and a freshness
workflow; see [docs/DEPENDENCY_HEALTH.md](docs/DEPENDENCY_HEALTH.md), which is written to
be adopted verbatim by the sibling Vite/Svelte project.

## Stack

Vite · Svelte · [fft.js](https://github.com/indutny/fft.js) for the deconvolution ·
[uPlot](https://github.com/leeoniya/uPlot) for plotting · [SheetJS](https://sheetjs.com)
for workbook reading · [PapaParse](https://www.papaparse.com) for CSV. Convolution is
hand-written. System fonts only. Everything bundled locally — see the privacy section for
why.

## Status, citing, and getting in touch

Actively developed by Richard Anthony DeFazio. **Not peer reviewed, and not versioned for
release** — treat results as you would any analysis you ran yourself, and read the
diagnostics rather than the headline number.

There is no preprint or DOI yet, so cite the tool by URL and commit; the
[Methods reference](https://kernel.tonydefazio.com/methods) carries a suggested form.

Bug reports, format problems and "it did something strange with my recording" are all
welcome as GitHub issues. Please include the *shape* of the recording — frames, ROIs,
regions, sampling rate — and **never the data itself**.

## License

[MIT](LICENSE) © Richard Anthony DeFazio
