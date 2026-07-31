#!/usr/bin/env python3
"""Render the premise figure from the SIMULATED recording.

    node scripts/dataset-summary/emit_premise_sim.mjs darkroom/premise_sim.json
    python3 scripts/dataset-summary/premise_figure.py -o docs/img/premise.png

Replaces the real-data ROI-1 figure that Tab 0 and the README previously led with. The
model is `src/lib/core/premise-sim.js`; this script only draws it, and computes nothing
about the science.

Because the input is synthetic, this figure carries no disclosure cost — which is the
entire reason it exists. See docs/img/README.txt.

Two panels, one shared dF/F0 scale:
  top    — the whole simulated recording, AP-independent events marked
  bottom — a window holding BOTH a spike-driven event and an AP-independent one, so the
           contrast is visible side by side rather than asserted in a caption
"""

import argparse
import json
import pathlib
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO = pathlib.Path(__file__).resolve().parents[2]
TRACE_COLOR = "#1f77b4"
TICK_COLOR = "red"
MARK_COLOR = "#f0a800"


def load(path):
    with open(path) as fh:
        d = json.load(fh)
    t = [d["t0"] + i * d["dt"] for i in range(d["n"])]
    return d, t


def draw(ax, t, y, spikes, base, band_h, xlim, ylim, title):
    ax.vlines(spikes, base, base + band_h, color=TICK_COLOR, linewidth=1.0)
    ax.plot(t, y, color=TRACE_COLOR, linewidth=0.8)
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_xlabel("time (s)")
    ax.set_ylabel("dF/F0")
    ax.set_title(title, fontsize=11)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sim", default=str(REPO / "darkroom" / "premise_sim.json"))
    ap.add_argument("-o", "--out", default=str(REPO / "darkroom" / "premise.png"))
    ap.add_argument(
        "--zoom-pad",
        type=float,
        default=28.0,
        help="seconds of context either side of the highlighted AP-independent event",
    )
    args = ap.parse_args()

    sim_path = pathlib.Path(args.sim)
    if not sim_path.exists():
        sys.exit(
            f"input not found: {sim_path}\n"
            "Generate it first:\n"
            "  node scripts/dataset-summary/emit_premise_sim.mjs " + str(sim_path)
        )

    d, t = load(sim_path)
    y = d["calcium"]
    spikes = d["spikes"]
    events = d["independentEvents"]

    lo, hi = min(y), max(y)
    span = hi - lo
    band_h = span * 0.06
    gap = span * 0.04
    base = lo - gap - band_h
    ylim = (base - span * 0.03, hi + span * 0.08)

    # Zoom on the LARGEST AP-independent event — the one whose absence of spikes is most
    # striking — with enough context either side to catch a real spike-driven event too.
    big = max(events, key=lambda e: e["amp"])
    z0, z1 = big["atS"] - args.zoom_pad, big["atS"] + args.zoom_pad
    zi = [i for i, tt in enumerate(t) if z0 <= tt <= z1]
    zt = [t[i] for i in zi]
    zy = [y[i] for i in zi]
    zs = [s for s in spikes if z0 <= s <= z1]

    fig, axes = plt.subplots(2, 1, figsize=(13.2, 6.6), dpi=100)

    draw(
        axes[0],
        t,
        y,
        spikes,
        base,
        band_h,
        (t[0], t[-1]),
        ylim,
        f"Simulated recording — {len(spikes)} action potentials in "
        f"{len(d['clusters'])} clusters of 1–5 (red ticks), plus "
        f"{len(events)} calcium events with no action potentials (marked)",
    )
    for e in events:
        axes[0].axvspan(e["atS"] - 6, e["atS"] + 14, color=MARK_COLOR, alpha=0.16, zorder=0)

    draw(
        axes[1],
        zt,
        zy,
        zs,
        base,
        band_h,
        (z0, z1),
        ylim,
        f"zoom {z0:.0f}–{z1:.0f} s — the tall transient has no spike beneath it, "
        "while the smaller ones each sit under a cluster (same dF/F0 scale)",
    )
    axes[1].axvspan(big["atS"] - 6, big["atS"] + 14, color=MARK_COLOR, alpha=0.16, zorder=0)

    fig.subplots_adjust(left=0.075, right=0.985, top=0.93, bottom=0.09, hspace=0.42)
    fig.savefig(args.out)
    plt.close(fig)

    print(
        f"{args.out}  ({d['n']} samples, {len(spikes)} APs, "
        f"{len(events)} AP-independent events, zoom {z0:.0f}-{z1:.0f} s)"
    )


if __name__ == "__main__":
    main()
