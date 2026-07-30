#!/usr/bin/env python3
"""Render the ROI 1 premise figure — the one Tab 0 and the README open with.

    python3 scripts/dataset-summary/roi1_trace.py [--ticks bottom|top] [-o OUT.png]

This is the tracked generator for `docs/img/roi1_trace.png` (and its in-bundle twin
`src/lib/assets/roi1_trace.png`), the same way `methods_explainer.py` is the tracked
generator for the four-methods figure. The original 2026-06-23 version was an ad-hoc
reconnaissance script that was never kept, so the canon figure had no reproducible
source — regenerating it meant reverse-engineering the plot from the PNG. This closes
that.

INPUT is gitignored and stays that way (FOUNDATIONS §6 / repo hygiene): it reads the
per-region CSV that `scripts/mat2csv.py` emits from `data/APs_v1_20241004_80.mat`.
The script carries no data, only the recipe.

OUTPUT defaults to darkroom/ (gitignored). Writing to docs/img/ is deliberate and
consent-gated — see docs/img/README.txt; this figure is the ONE unpublished-data plot
that ships publicly, so re-rendering it is a figure-gate decision (ADR-0018), never
an automatic step.
"""

import argparse
import csv
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_CSV = REPO / "exports" / "APs_v1_20241004_80__region1.csv"

TRACE_COLOR = "#1f77b4"  # matplotlib C0 — what the original used
TICK_COLOR = "red"


def load(csv_path):
    """Read time / spikes / roi1 out of the ADR-0016 per-region export."""
    times, roi1, spikes = [], [], []
    with open(csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            times.append(float(row["time"]))
            roi1.append(float(row["roi1"]))
            s = row["spikes"].strip()
            if s:
                spikes.append(float(s))
    return times, roi1, spikes


def render_two_panel(times, roi1, spikes, out_path, zoom=(400.0, 700.0)):
    """Full recording on top, a zoomed window below, on ONE shared dF/F₀ axis.

    The second panel is the whole reason this figure needs two: the 400–700 s stretch
    where spikes keep coming and the calcium response collapses is a few pixels wide in
    the full view, so the figure could not show the evidence for its own claim. Zooming
    it out into its own panel does that statically — no per-sample data has to leave the
    repo for a reader to see it (repo hygiene, CLAUDE.md).

    The y-limits are SHARED across both panels deliberately. Letting the lower panel
    autoscale would redraw a collapsed response as healthy signal — amplitude is the
    argument, and ADR-0024/0029 already reject display scaling that misleads about
    magnitude.
    """
    lo, hi = min(roi1), max(roi1)
    span = hi - lo
    band_h = span * 0.06
    gap = span * 0.04
    base = lo - gap - band_h
    ylim = (base - span * 0.03, hi + span * 0.06)

    fig, axes = plt.subplots(
        2, 1, figsize=(13.2, 6.6), dpi=100, gridspec_kw={"hspace": 0.42}
    )

    zi = [i for i, t in enumerate(times) if zoom[0] <= t <= zoom[1]]
    zt = [times[i] for i in zi]
    zy = [roi1[i] for i in zi]
    zs = [s for s in spikes if zoom[0] <= s <= zoom[1]]

    for ax, (t, y, sp, xlim, title) in zip(
        axes,
        [
            (
                times,
                roi1,
                spikes,
                (times[0], times[-1]),
                f"ROI 1 trace ({len(times)} samp @10Hz) + {len(spikes)} spikes (red ticks)",
            ),
            (
                zt,
                zy,
                zs,
                zoom,
                f"zoom {zoom[0]:.0f}–{zoom[1]:.0f} s — {len(zs)} spikes, "
                "calcium response nearly gone (same dF/F0 scale)",
            ),
        ],
    ):
        ax.vlines(sp, base, base + band_h, color=TICK_COLOR, linewidth=1.0)
        ax.plot(t, y, color=TRACE_COLOR, linewidth=0.8)
        ax.set_xlim(*xlim)
        ax.set_ylim(*ylim)
        ax.set_xlabel("time (s)")
        ax.set_ylabel("dF/F0")
        ax.set_title(title, fontsize=11)

    # Mark on the full view where the lower panel comes from, so the two panels read as
    # one figure rather than two unrelated plots.
    axes[0].axvspan(zoom[0], zoom[1], color="#f0a800", alpha=0.13, zorder=0)

    # subplots_adjust, not tight_layout: the shaded zoom marker is an axes-spanning
    # artist that tight_layout cannot measure, and it warns and mis-packs.
    fig.subplots_adjust(left=0.075, right=0.985, top=0.93, bottom=0.09, hspace=0.42)
    fig.savefig(out_path)
    plt.close(fig)
    return len(times), len(spikes)


def render(times, roi1, spikes, out_path, ticks="bottom"):
    lo, hi = min(roi1), max(roi1)
    span = hi - lo

    fig, ax = plt.subplots(figsize=(13.2, 3.84), dpi=100)

    if ticks == "bottom":
        # Reserve a band UNDER the trace for the raster, so a spike reads as a mark on
        # the time axis rather than a second series floating above the data. The eye
        # then drops from a tick straight up into the transient it caused.
        band_h = span * 0.06
        gap = span * 0.04
        base = lo - gap - band_h
        ax.vlines(spikes, base, base + band_h, color=TICK_COLOR, linewidth=1.0)
        ax.set_ylim(base - span * 0.03, hi + span * 0.06)
    else:
        band_h = span * 0.06
        top = hi + span * 0.10
        ax.vlines(spikes, top, top + band_h, color=TICK_COLOR, linewidth=1.0)
        ax.set_ylim(lo - span * 0.05, top + band_h + span * 0.03)

    ax.plot(times, roi1, color=TRACE_COLOR, linewidth=0.8)

    ax.set_xlim(times[0], times[-1])
    ax.set_xlabel("time (s)")
    ax.set_ylabel("dF/F0")
    ax.set_title(
        f"ROI 1 trace ({len(times)} samp @10Hz) + {len(spikes)} spikes (red ticks)"
    )
    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)
    return len(times), len(spikes)


# DELIBERATELY NOT PROVIDED: a mode that emits the per-sample trace as CSV/JSON for the
# app to plot interactively. It was built on 2026-07-30 and reverted the same day —
# shipping it would publish the recording itself (not a picture of it) from a public URL,
# which is the line CLAUDE.md's repo-hygiene section draws and which the two-panel figure
# above makes unnecessary. If that ever gets revisited it is a consent decision involving
# everyone with a claim on the recording, not a flag on this script.


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument(
        "--panels",
        choices=["two", "one"],
        default="two",
        help="two = full recording + zoomed window (the canon figure); one = full only",
    )
    ap.add_argument("--ticks", choices=["bottom", "top"], default="bottom")
    ap.add_argument(
        "--zoom",
        default="400,700",
        help="zoom window for the lower panel, 'start,end' in seconds",
    )
    ap.add_argument("-o", "--out", default=str(REPO / "darkroom" / "roi1_trace_new.png"))
    args = ap.parse_args()

    csv_path = pathlib.Path(args.csv)
    if not csv_path.exists():
        sys.exit(
            f"input not found: {csv_path}\n"
            "It is gitignored by design. Regenerate it with scripts/mat2csv.py from "
            "data/APs_v1_20241004_80.mat."
        )

    times, roi1, spikes = load(csv_path)
    if args.panels == "two":
        z0, z1 = (float(v) for v in args.zoom.split(","))
        n, k = render_two_panel(times, roi1, spikes, args.out, zoom=(z0, z1))
        print(f"{args.out}  ({n} samples, {k} spikes, two panels, zoom {z0:.0f}-{z1:.0f} s)")
    else:
        n, k = render(times, roi1, spikes, args.out, ticks=args.ticks)
        print(f"{args.out}  ({n} samples, {k} spikes, ticks={args.ticks})")


if __name__ == "__main__":
    main()
