# Murderboard run — kernels_v1 handoff note for haruspex
- upstream:  syncytium2/murderboard @ 635c5a8
- vendored:  635c5a8 (re-vendored this session — the freshness gate exited 1 at call-up
  against the previous d0ce4e7 stamp; stamp bump landed on master via
  `chore/re-vendor-murderboard-635c5a8`, content was already identical)
- freshness: current
- artifact:  scratchpad `kernels_v1_handoff_para.md` (de20654c -> 64a489d3; final text
  reproduced in full at the bottom of this record, since the scratchpad is
  session-temporary)
- roles:     11 of 11 run
- rounds:    11 verify rounds to clean (blind round 6 clean on the original paragraph;
  the artifact was then extended mid-review at the author's request with the
  8-kernel list block, restarting blind iteration; round 11 clean on the full note)

## What was reviewed

A human-facing handoff note describing the `team_colonel_kernel/kernels/colonel_kernels_v1`
export (CSV + JSON) for the downstream **haruspex** project, plus — added mid-review at the
author's request — the explicit list of the 8 human-identified quality kernels with ROI status
and analysed windows, which haruspex needs for raw-F extraction.

Ground truth: the bus `kernels/README.md`, `colonel_kernels_v1.csv`, `colonel_kernels_v1.json`,
`docs/reviews/kernel-review-baseline-2026-07-19.md`, and the bus `status/app_team.md`.
Scaled per process step 2: single-pass self-review walking every role's checklist, then
blind verify rounds run as fresh subagents (one per round, no knowledge of prior findings),
each recomputing every quantity from the raw files.

## Original submitted text (what the review corrected)

> team_colonel_kernel/kernels/colonel_kernels_v1.csv + .json: the 8 ACCEPT recordings with
> per-recording a, tau, rise time, peak lags across all three recovery methods, and full
> kernel + STA waveforms in the JSON. Directly useful for haruspex: τ-informed smoothing
> width for the ap_dependent target, coupling-floor estimation, forward-model sanity checks.
> Three caveats: amplitudes are in ΔF/F₀ units (must rescale for raw-F work); the review was
> a self-described quick pass — only the 8 accepted IDs were ever written down, the ~31
> implicit rejects have no record; and the automated kernel screen agrees with the human
> verdict on just 1 of 8, so the human doc is the authority, not the screen.

Its defects, all confirmed against sources and fixed: "rise time" is a **time constant**
(`tau_rise_s`), not a 10–90% rise time; peak lags exist for **two** of the three recovery
methods plus the STA cross-check (shaped has no lag column; STA lag is unconstrained,
not like-for-like); the load-bearing `a`/`tau` caveat was missing entirely (parametric fit
`good` on only 1 of 8 — `a_robust` elsewhere, `tau` unfitted); "~31 implicit rejects have
no record" overstated (absence is not a recorded reject; scope was baseline-only; a
walkthrough is still owed); "agrees on just 1 of 8" needed the ROI-1 qualifier (recording-
level agreement is 2 of 8).

## Role ledger

| # | Role | Result |
|---|---|---|
| 1 | Claim & data verifier — "Prove It." | Claim ledger recomputed from the raw CSV/JSON every round (row counts, fit qualities, τ = 0.53884, railed `tau_rise_s` rows, `fv_tau_s` coverage 7/8, ACAUSAL pair, STA ratios 3-higher/4-lower with max 10.52× on `20250925_233`, 39−8=31, all 8 window bounds cell-for-cell). Findings: original's "rise time"/"three recovery methods"/"~31 implicit rejects"/"1 of 8" defects; later the `fv_tau_s` endorsement overreach and the six-of-seven set conflation. All fixed. |
| 2 | Citation & reference validator — "DOI or Die." | No external references. Internal pointers (bus paths, review-doc path, `golden/APs_xlsx_v1_<slice_id>.xlsx` join key, ADR-0019 clock item) verified to exist and say what the note claims. No findings. |
| 3 | Consistency auditor — "Cross-Examiner." | Cross-checked note ↔ CSV ↔ JSON ↔ README ↔ review doc ↔ status log. Findings: two different "1 of 8" claims needed their IDs; "the three are not like-for-like" overbroad (pm and fv ARE comparable); `fv_tau_s` set conflation (covers 6, not 7, of the τ-needing rows); "every waveform" universal vs `20250926_237`'s empty STA. All fixed. |
| 4 | Adversarial reviewer — "Reviewer 2." | Findings: missing `pm_theta.scale_coeff` trap; missing 235 acquisition-gap caveat; missing linearity/no-saturation caveat; missing acausal-half trim warning; the 10.5× STA worst case falls on the very row endorsed for `a`/`tau` (linkage added); "must rescale" implied F₀ ships (it doesn't); screen-under-call stated flatter than the review doc supports (re-attributed: review opened the ROI question, bus README closed it). All fixed. |
| 5 | Line editor — "Kill Your Darlings." | Findings: 110-word opening sentence split; "likewise" parenthetical changing function mid-stream; self-restating clause; garbled `20250826_192` possessive; exhaustive-sounding inventory of the review's notes. All fixed. |
| 6 | Methods / domain expert — "RTFM." | Method claims grounded in the bus README (the authoritative method doc for this export): double-exponential parametrization, τ vs rise-time-constant distinction, Tikhonov λ dependence, STA overlap-guard reason for 237's missing STA, causal-only lag search. No external papers required; nothing misused. No findings beyond those filed under 1/4. |
| 7 | Reuse auditor — "Reinventing the Wheel." | The note re-derives nothing: every number traces to the existing export (`export_kernels.mjs` output) and existing review docs; it points at them rather than duplicating. No findings. |
| 8 | Naive-reader accessibility — "You Lost Me." | Findings: "STA" expanded at first use; "goldens" → "recordings"; ambiguous "it"/"them" pronouns in the screen sentence anchored to named IDs; raw-F extraction needs the join key and the zero-based clock convention stated (added). All fixed. |
| 9 | Density & figure-first — "Show, Don't Tell." | Single-note text deliverable; the one enumerable structure (8 recordings × windows) set as a table rather than prose. Prose is the right form for the rest. No further findings. |
| 10 | Build & craft gate — "Ship It." | Artifact is markdown, no render. Table: row 1 — file `kernels_v1_handoff_para.md` @ 64a489d3: markdown table well-formed (9 rows × 2 cols, pipes balanced), backticks paired, special glyphs (ΔF/F₀, τ, ±, ×, ≈, —) intact in the byte stream, no truncated lines. Checked against the final saved file, not a draft. |
| 11 | Argument order — "Start With the Problem." | Spine: what the files are → how to use them honestly → caveats → provenance and authority → the actionable list. The list block sits last as the payload haruspex acts on; nothing arrives before the reader can evaluate it. No findings. |

## Verify rounds

R0 self-review 7 findings → R1 blind 6 → R2 blind 3 → R3 blind 4 → R4 blind 6 → R5 blind 1
→ **R6 blind 0 (paragraph clean)** → artifact extended with the list block → R7 blind 3 →
R8 blind 1 → R9 blind 1 (nit) → R10 blind 1 (nit) → **R11 blind 0 (full note clean)**.
Follow-up pass over all 33 findings: 31 fixed, 2 no-change (below), 0 moved, 0 dropped.

## Adjudicated no-change (recorded, not ⚠)

- `20250926_237`'s JSON `dt` carries an ~1e-10 float artifact vs the CSV's 0.1 s —
  ~1 µs over a 1200 s window; not worth a caveat in the note.
- The review doc's "⚠ BUS FLAG STILL OWED (2026-07-19)" — verified **resolved**: the ROI-1
  screen-vs-human item was posted to `status/app_team.md` on 2026-07-20 ("owed from
  2026-07-19 … It downloads now").

## Residual ⚠

None factual. One scoping note: "directly useful for haruspex" (smoothing width /
coupling floor / forward-model checks) is the author's statement of intent about their own
downstream project — taken as given, not verified against any haruspex requirements doc.

## Final delivered text

`team_colonel_kernel/kernels/colonel_kernels_v1.csv` + `.json`: the 8 recordings the human baseline review passed (`fit_ok = yes`; baseline region, ROI 1), with per-recording `a`, `tau`, rise time constant (`tau_rise_s` — a time constant, not a 10–90% rise time), and peak lags for the parametric and free-vector recoveries plus the STA (spike-triggered average) cross-check; the shaped method has no lag column, and the STA lag is unconstrained while the other two are causal-only, so it is not like-for-like with them. The JSON adds full waveforms for all three recovery methods + STA (the shaped waveform is reference-only — do not adopt it as a forward model — and pull `a` from the CSV, not `pm_theta.scale_coeff`, which is the double-exponential scale term, not the peak height); every waveform's `times` axis spans negative to positive lag with 0 at the spike (±5 s; STA ±2 s; the one exception is `20250926_237`'s STA, empty — see below) — the negative-lag half is a deliberately retained diagnostic, so trim to causal lags before using one as a convolution kernel. Directly useful for haruspex: τ-informed smoothing width for the ap_dependent target, coupling-floor estimation, forward-model sanity checks — but the parametric fit is `good` on only 1 of 8 (`20250925_233`, τ ≈ 0.54 s), the only row where `a`/`tau` can be adopted as a forward model. For the other seven use `a_robust` for amplitude and treat `tau` as unfitted — likewise `tau_rise_s` on `20250904_209` and `20250926_235`, where it is railed at its 1.0 s optimizer bound (a wall, not an optimum). Whether `fv_tau_s` (a log-linear tail fit) can stand in as τ is open — the bus README describes it without endorsing it — and it covers only six of those seven rows anyway: a baseline tilt defeats it on `20241004_80`, leaving that row with no τ handle at all. Caveats: amplitudes are ΔF/F₀ units (rescaling for raw-F work needs your own per-recording F₀ — the export carries none); the model behind these kernels is strictly linear — `ton`/`sat` are empty by design, no saturation term, so bright heavily-driven cells are exactly where it bites; `a_robust` is a single draw at `fv_lambda = 0.002` and the λ-stability sweep was not run; two recoveries (`20260130_272`, `20250807_181`) carry an ACAUSAL flag and are suspect; `20250926_237` has no STA at all; the first two gaps in `20250926_235`'s spike record are acquisition artifacts, not true quiescence — don't let a windowing or sufficiency rule read them as real; and STA vs deconvolution amplitudes disagree in both directions — don't average them — with the worst case (STA 10.5× higher) on `20250925_233`, the very row endorsed for `a`/`tau` above. The review was a self-described quick pass: the 8 usable IDs were written down, along with assorted notes (among them: the screen's overall #1-ranked hit, `20250826_192` roi16, ruled an artifact; the 4 screen-only IDs named for a later look), but the other ~31 of 39 scanned recordings have no systematic per-recording verdicts, and a careful walkthrough is still owed — absence from the list is not a recorded reject. And the automated screen agrees with the human on ROI 1 for just 1 of 8 (`20241004_80`). The review originally logged that discrepancy as an open ROI-labelling question; the bus README closes it — the review's author confirmed these are the ROI-1 targeted-cell kernels, making the discrepancy a screen problem (the screen never examined baseline for `20250904_209` and `20250926_235`, and under-calls dense-firing recordings). The human verdict, not the screen, is the authority.

**The list itself — the 8 human-identified quality kernels** (source: `docs/reviews/kernel-review-baseline-2026-07-19.md` in the colonel_kernel repo; mirrored as the 8 rows of the CSV above). All ROI 1 — **no deviations**: the review's author confirmed these are the ROI-1 targeted-cell kernels (bus `kernels/README.md`), and the screen's suggestion that `20250807_181`'s plausible kernels sit in non-ROI-1 columns was resolved as a screen problem, not a labelling one. Analysed windows below are the baseline regions the kernels came from (dt = 0.1 s), for pulling the matching raw-F segments. Bounds are on the settled zero-based clock (t = 0 at experiment onset, per the bus's resolved ADR-0019 convention). The export carries no traces — join on `slice_id` to your own recordings (on the colonel_kernel bus the same key names `golden/APs_xlsx_v1_<slice_id>.xlsx`):

| recording | analysed baseline window (s) |
|---|---|
| `20241004_80` | 32.4 – 1232.4 |
| `20250731_151` | 60 – 1260 |
| `20250807_181` | 0 – 1200 |
| `20250904_209` | 0 – 1140 |
| `20250925_233` | 0 – 1200 |
| `20250926_235` | 0 – 1200 |
| `20250926_237` | 0 – 1200 |
| `20260130_272` | 210 – 1410 |

No wider list exists: the quick pass wrote down only these 8; there is no per-recording verdict list for the other ~31, and treatment/senktide/TTX/hiK regions were never reviewed.
