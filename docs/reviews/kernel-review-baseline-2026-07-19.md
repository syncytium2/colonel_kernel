# Human kernel review — BASELINE regions only (2026-07-19)

**Status: QUICK review, not the careful walkthrough.** Recorded so the result is not
lost; a careful pass is still owed (see "What is still owed" below).

This is a **human verdict** (Tony's eyeball read of the per-slice kernel summaries).
Per [ADR-0018](../adr/0018-figure-gate-policy.md) and
[ADR-0011](../adr/0011-validation-gates-machinery-not-fit.md), the eyeball is the
authority on whether a kernel is real — the plausibility screen is a *screen*, never a
verdict. **Where this list and the screen disagree, this list wins.**

## The recordings with usable baseline kernels

Short IDs as given, resolved against the 39 scanned goldens:

| as noted | full recording id |
|---|---|
| `_80`  | `20241004_80` |
| `_209` | `20250904_209` |
| `_233` | `20250925_233` |
| `235`  | `20250926_235` |
| `237`  | `20250926_237` |
| `272`  | `20260130_272` |
| `151`  | `20250731_151` |
| `181`  | `20250807_181` |

**Scope:** baseline regions only. Treatment/senktide/TTX/hiK regions were not part of
this pass, so absence from this list is **not** a verdict on a recording's other regions.

### Note on 235

> The **first two gaps in the 235 APs are technical, not true gaps.**

i.e. those two interruptions in the spike record are acquisition artifacts, not genuine
silent periods. Do not treat them as biology, and do not let a windowing or
sufficiency rule interpret them as real quiescence.

## How this compares to the machine screen

Screen = `scripts/dataset-summary/scan_kernels.mjs`, output `darkroom/scan_kernels.json`
(39 goldens, run 2026-07-06). Restricting the screen to baseline regions:

- **Both agree (2):** `20241004_80`, `20250807_181`
- **Human only — screen missed (6):** `20250731_151`, `20250904_209`, `20250925_233`,
  `20250926_235`, `20250926_237`, `20260130_272`
- **Screen only — not in the human list (4):** `20241122a_105`, `20241122b_110`,
  `20260115_240`, `20260303_290`

Three things follow, and all three matter:

**1. The "baseline tilt hides kernels" suspicion looks confirmed.** The six the screen
missed are overwhelmingly *dense-firing*: 151 (2919 spikes), 233 (8071), 235 (3554),
237 (2215), 209 (2006). This was flagged as a hypothesis when the screen was built; the
human read is consistent with it. The screen under-calls high-firing recordings.

**2. For two of them the screen never looked at baseline at all.** `scan_kernels.mjs`
picks *the analyzable region with the most targeted-cell APs* — which for `209` and
`235` was the **senktide** region, not baseline. So those are not disagreements; the
screen simply never examined the region under review. A baseline-restricted re-run
would be a fairer comparison.

**3. The screen's top hit is an artifact.** `20250826_192` roi16 ranks first by
amplitude (0.031, >3× file 80) from a region with **6 spikes** and R² = 0.99994. Free-
vector recovery with six spikes is badly underdetermined, so near-perfect reconstruction
is expected whether or not a kernel exists. The `decent` gate does not test spike
sufficiency even though the core carries a 20-spike floor. It is correctly absent from
the human list.

## ⚠ The open question — possible ROI-labelling clerical error

**ROI 1 is supposed to be the targeted cell.** In the screen's output, `roi1decent` is
true for **only 1 of these 8** recordings (`20241004_80`); for the other seven the
plausible kernel sits in a *non-ROI-1* column, or nowhere the screen looked.

That is consistent with several explanations, and they need separating:

- a genuine clerical/export error putting the targeted cell in the wrong column, so the
  kernel is real but labelled as a non-targeted ROI;
- a real biological result (a recoverable kernel in a non-targeted ROI — already noted
  in `FOUNDATIONS.md` as observed but unreported);
- or simply the screen under-calling ROI 1 on dense-firing recordings, per finding 1.

**This is the main purpose of the careful walkthrough.** A mislabelled targeted ROI
would be a *data provenance* fault originating upstream in the MATLAB export, not in
this repo — so it is a shared-bus question for the producer side, not a colonel_kernel-only
fix.

> **⚠ BUS FLAG STILL OWED (2026-07-19).** This was *not* posted to
> `team_colonel_kernel/status/app_team.md`. That file would not download from Dropbox
> (online-only placeholder, `cat` times out; 1474 bytes dated 2026-06-25). The bus
> `PROTOCOL.md` §2 makes the status logs **append-only**, so writing it blind would have
> destroyed a log that could not first be read. Post the ROI-1 question there by hand, or
> once Dropbox syncs the file locally.

## What is still owed

1. **A careful, recorded walkthrough** of the per-slice summaries — all regions, not
   just baseline — with the verdict written down per slice as it is made.
2. **Resolve the ROI-1 labelling question** with the MATLAB side (see above).
3. **Re-run the screen restricted to baseline regions** so the comparison above is
   like-for-like for `209` and `235`.
4. **Decide whether the `decent` gate should require spike sufficiency** (would drop the
   192 artifact). Changes what counts as a screen — a scientific call, not a cleanup.
5. **Give the four screen-only recordings a look** (`105`, `110`, `240`, `290`) —
   especially `240`, which the screen called among the cleanest but which is not on the
   human list.

## Data hygiene

Recording IDs and verdicts only — no traces, no per-sample data. Consistent with
[ADR-0022](../adr/0022-no-ap-silent-recording-policy.md), which records per-file dataset
facts in tracked docs. The underlying workbooks and rendered summaries stay in the
gitignored/Dropbox paths.
