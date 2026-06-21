# 2. Global timebase (authored-adjustable, load-locked)

## Status

Accepted

## Context

The app lets a user flow a signal between tabs — build spikes + a kernel in Tab 1, watch the output respond, then carry the same signal into Tabs 2/3 (see `FOUNDATIONS.md` §2). If each tab had its own sample rate / window length, flowing a signal between tabs would silently resample or break it.

Separately, the two audiences differ in where the timebase comes from:

- **Teaching side** — the user *authors* spikes on a grid they control; the sample rate and window are theirs to set.
- **Calcium / ground-truth side** — the user *loads* a CSV whose time column already defines the frame rate (~10 Hz) and recording length (see `FOUNDATIONS.md` §5). Here the timebase is a property of the recording, not something to invent.

## Decision

**Sample rate and window length are global app state** — one shared timebase across all tabs, not per-tab.

The timebase has two modes, governed by an **authored-vs-loaded mode flag**:

- **Authored-adjustable (default).** Sensible defaults, exposed as optional controls the user can edit. This is the teaching mode.
- **Derived-and-locked (on data load).** The sample rate and window length are read from the CSV time column, displayed for confirmation, and **not** freely editable.

The rasterizer (`rasterize(spikeTimes, grid, method)` — see ADR-0001) and the plotting layer both read this shared timebase and respect the mode flag (controls editable in authored mode, read-only in loaded mode).

## Consequences

**Pros**

- Cross-tab signal flow stays consistent — one grid everywhere, so a signal carried between tabs is never silently resampled or broken.
- Loaded data can't be silently corrupted by overriding the recording's true sample rate; the timebase reflects the real recording.
- Adjusting the grid in authored mode is itself a teaching feature: coarsen the rate to show aliasing, shrink the window to show truncation.

**Cons**

- A single global timebase means you can't simultaneously hold two differently sampled signals in different tabs. Acceptable given the flow-between-tabs model assumes one signal moving through the tabs.

**Note**

- This depends on the **authored-vs-loaded mode flag**, which other features must read: the rasterizer, the plot axes, and control enable/disable state.

See `FOUNDATIONS.md` §2 (tab flow) and §5 (CSV time column).
