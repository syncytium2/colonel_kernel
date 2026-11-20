# The review page (lab only)

A page for looking at jsMLspike's inferred events one window at a time and choosing the kernel for
each, without knowing which recording, cell, treatment or window you are looking at.
[ADR-0054](adr/0054-lab-only-review-page-hosts-jsmlspike.md); its behaviour is jsMLspike
`docs/adr/2026-11-19-3ca2-*.md` (Tony's answers to the seven questions).

It runs only on your own machine, from the development server. It is never part of the public site.

## Try it on the simulated recording (first time)

You need a copy of jsMLspike at the commit this page is built against. The commit is in
`src/lib/review/engine-pin.json`. In Git Bash:

```bash
# 1. a copy of jsMLspike at the pinned commit (once)
git clone https://github.com/syncytium2/jsMLspike.git ~/jsmlspike-for-review
cd ~/jsmlspike-for-review
git checkout <the commit in colonel_kernel/src/lib/review/engine-pin.json>
npm ci

# 2. this repository, on the review branch
cd ~/Developer/colonel_kernel
git switch claude/review-page-jsmlspike
npm ci

# 3. a simulated recording to review: 6 cells x 3 windows, written to exports/review/ (not committed)
CK_JSMLSPIKE_DIR=~/jsmlspike-for-review npm run review-fixture

# 4. start the page
CK_JSMLSPIKE_DIR=~/jsmlspike-for-review npm run dev
```

Then open **http://localhost:5173/#review** (or click **LAB · jsMLspike review**).

The simulated recording is made to show every kind of window you will meet: a cell with a
clear kernel, a cell calibrated on one event, a cell where autocalibration gave up, a cell with a
cleaned stretch, and two that were refused before inference (they are in **Screening misses**).
Nothing in it is real data.

## Using it

- **Review** shows one window. The header gives only a blind key (`K…`) and the window's own time
  (0:00 to 5:00). Warnings say why a kernel may be poorly determined (one event, on a range limit,
  flat error, resting mostly on burst events).
- **A** is the trace MLspike received, with its fit and drift. **B**, the same size beneath it, is
  that trace with the other events removed, as autocalibration fitted it: the fit at its own
  kernel (blue) and at the kernel you have chosen (orange). A and B share one time axis and one y
  axis (B is shown in A's units), and the strip below marks the inferred events. Drag across any of
  them to zoom time; double-click to go back.
- **y scale**: "this window" fits each window's traces; "fixed" keeps the range you type (or
  **fix at this window's range**) as you move between windows, so sizes compare across windows.
- **C** shows how well each kernel fits trace B: amplitude across, decay up, coloured by how much
  worse than the best kernel it fits (dark blue as good as the best, pale yellow 20% worse or more;
  the 20% is provisional). A small dark spot around ● means the data pin the kernel down; a large
  dark area or streak means many kernels fit about as well, so the data barely choose. ● on the
  edge means the best fit wanted to go past the allowed range.
- **Choose a kernel**: 1 own fit, 2 and 3 neighbouring windows of the same cell (A and B do not say
  which comes first), 4 the other cells of this recording in the same epoch (with how many cells and
  how many were weak), 5 the default, 6 no reliable kernel, 7 type your own.
- **Keys**: 1 to 7 choose, **T** tries the chosen kernel (the trace and events redraw in orange),
  **N** writes a note, **Enter** saves and moves to the next undecided window, ← and → move.
- **Screening misses** lists windows refused before inference. Send each back upstream (the default)
  or leave it out.
- **Review the review** lists every decision. Reopening one and saving again makes a new record that
  replaces it; you are asked for a reason. Nothing is ever deleted or edited.
- **Bulk-accept** accepts the own fit of every well-determined window at once, except a random one in
  ten, which is put at the front of the queue for you to check.
- **Reveal identity / Reveal window order** show what is hidden, after you give a reason. Every
  reveal is saved in the log.

Decisions are saved, as you make them, in `jsmlspike_review.jsonl` in the results folder
(`exports/review/`). The format is `jsmlspike-review/1`, in jsMLspike `docs/result-format.md`.

Type your initials in **reviewer** once. Each decision carries them, and next time the page fills them
in from the last decision in that folder's log (the page stores nothing in the browser). If someone
else reviewed last, type over them.

## Real results

Point the page at a folder of jsMLspike results (made with jsMLspike's `tools/run.mjs`) instead of the
simulated set:

```bash
CK_JSMLSPIKE_DIR=~/jsmlspike-for-review CK_REVIEW_DIR="<folder of results>" npm run dev
```

If the folder holds a key file (`review_key.json`, written by `tools/run.mjs --key`), the reveal
switch can show treatments, groups and window positions from it. Without one the page works the same.

## Checks

`npm run test:review` (the page's logic), `npm run review-engine-check` (the engine is reachable at the
pinned commit), `npm run build && npm run lab-check` (nothing of this page or of jsMLspike is in the
public build), and `node scripts/review-shot.mjs OUTDIR` with the dev server running (drives the page
in a browser, screenshots it, fails on any console error; `PW_CHROMIUM` can name an installed Chrome).
