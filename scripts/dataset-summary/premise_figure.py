#!/usr/bin/env python3
"""Render the premise figure from the SIMULATED recording.

    node scripts/dataset-summary/emit_premise_sim.mjs darkroom/premise_sim.json
    python3 scripts/dataset-summary/premise_figure.py -o docs/img/premise.png

Replaces the real-data ROI-1 figure that Tab 0 and the README previously led with. The
model is `src/lib/core/premise-sim.js`; this script only draws it, and computes nothing
about the science.

Because the input is synthetic, this figure carries no disclosure cost — which is the
entire reason it exists. See docs/img/README.txt.

Three panels, one shared dF/F0 scale throughout:
  top          — the whole simulated recording, AP-independent events marked
  bottom left  — a NARROW AP-independent event in context
  bottom right — a SLOW one

The bottom row exists because the two AP-independent morphologies look nothing like each
other, and neither looks like the AP-linked transient. One panel could only ever show one
of them, which would read as a single artifact rather than as "these are not the same
process." Each zoom keeps a spike-driven event in frame, so the comparison is on-figure
rather than asserted in the caption.
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

    # One zoom per morphology — the biggest example of each, so the pair shows how
    # different they are rather than repeating one shape twice.
    def biggest(shape):
        of_shape = [e for e in events if e.get("shape") == shape]
        return max(of_shape, key=lambda e: e["amp"]) if of_shape else None

    picks = [e for e in (biggest("narrow"), biggest("slow")) if e is not None]

    fig = plt.figure(figsize=(13.2, 7.4), dpi=100)
    gs = fig.add_gridspec(2, len(picks) or 1, height_ratios=[1.0, 0.95], hspace=0.46, wspace=0.16)

    ax_top = fig.add_subplot(gs[0, :])
    draw(
        ax_top,
        t,
        y,
        spikes,
        base,
        band_h,
        (t[0], t[-1]),
        ylim,
        f"Simulated recording — {len(spikes)} action potentials in "
        f"{len(d['clusters'])} bursts of 1–5 (red ticks), plus "
        f"{len(events)} calcium events with no action potentials (shaded)",
    )
    for e in events:
        ax_top.axvspan(e["atS"] - 6, e["atS"] + 14, color=MARK_COLOR, alpha=0.16, zorder=0)

    label = {
        "narrow": "tall, brief, near-symmetric",
        "slow": "medium rise, very slow decay",
    }
    for col, e in enumerate(picks):
        pad = args.zoom_pad if e.get("shape") == "narrow" else args.zoom_pad * 1.6
        z0, z1 = e["atS"] - pad * 0.45, e["atS"] + pad
        zi = [i for i, tt in enumerate(t) if z0 <= tt <= z1]
        ax = fig.add_subplot(gs[1, col])
        draw(
            ax,
            [t[i] for i in zi],
            [y[i] for i in zi],
            [s for s in spikes if z0 <= s <= z1],
            base,
            band_h,
            (z0, z1),
            ylim,
            f"no-AP event, {label.get(e.get('shape'), e.get('shape'))} "
            f"— {z0:.0f}–{z1:.0f} s",
        )
        ax.axvspan(e["atS"] - 2, e["atS"] + pad * 0.75, color=MARK_COLOR, alpha=0.16, zorder=0)
        if col > 0:
            ax.set_ylabel("")

    fig.subplots_adjust(left=0.065, right=0.985, top=0.935, bottom=0.08)
    fig.savefig(args.out)
    plt.close(fig)

    print(
        f"{args.out}  ({d['n']} samples, {len(spikes)} APs, "
        f"{len(events)} AP-independent events, "
        f"zooms: {', '.join(e.get('shape', '?') for e in picks)})"
    )


if __name__ == "__main__":
    main()
