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


def emit_json(times, roi1, spikes, out_path):
    """Emit the trace for the app's interactive Tab 0 figure.

    The time axis is stored as t0 + i*dt rather than 10,673 explicit floats: the export
    is regular to 1e-6 s, a ten-thousandth of a frame, so reconstructing it is exact at
    any resolution anyone can see and it halves the payload.

    NOTE this file IS the recording, not a picture of it — see the header and
    docs/img/README.txt. Emitting it is a consent decision, not a build step.
    """
    import json

    dt = (times[-1] - times[0]) / (len(times) - 1)
    payload = {
        "source": "APs_v1_20241004_80 region 1, ROI 1",
        "t0": round(times[0], 6),
        "dt": round(dt, 9),
        "n": len(times),
        "y": [round(v, 5) for v in roi1],
        "spikes": [round(s, 3) for s in spikes],
    }
    with open(out_path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    return len(times), len(spikes)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--ticks", choices=["bottom", "top"], default="bottom")
    ap.add_argument(
        "--json",
        metavar="OUT.json",
        help="also emit the trace as JSON for the app's interactive figure",
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
    n, k = render(times, roi1, spikes, args.out, ticks=args.ticks)
    print(f"{args.out}  ({n} samples, {k} spikes, ticks={args.ticks})")
    if args.json:
        emit_json(times, roi1, spikes, args.json)
        size = pathlib.Path(args.json).stat().st_size
        print(f"{args.json}  ({size/1024:.1f} kB)")


if __name__ == "__main__":
    main()
