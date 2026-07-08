#!/usr/bin/env python
# Dataset-summary page renderer. Context strip (roi1 calcium + 1 s-binned APs, region
# windows + solution_delay) over per-region blocks of top-4 kernel ROIs (baseline +
# treatment reserved, hik if present). Kernels at TRUE fixed absolute dF/F₀ (unitary-
# event amplitude ~constant — physiological anchor) + STA scaled-to-fit; top-left inset
# carries the auto-scale. render_page(d) → fig; imported by build_pdf.py for the batch.
#   single page: JSON_IN=darkroom/slice2_80.json PNG_OUT=darkroom/slice2_80.png darkroom/venv/bin/python darkroom/fig_slice_page2.py
import json, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

FIXED_LO = float(os.environ.get("AMP_LO", "-0.006"))
FIXED_HI = float(os.environ.get("AMP_HI", "0.016"))
REF_AMP = float(os.environ.get("REF_AMP", "0.0095"))  # canonical unitary amplitude (file-80 roi1)
TYPE_C = {"baseline": "#e69f00", "treatment": "#2a2", "hik": "#0072b2", "full": "#888"}
KERNELS = [("fv", "free-vector", "#178"), ("pm", "parametric", "#7a3"), ("shaped", "shaped", "#c50")]

def prezero(times, y):  # ADR-0017 baseline-relative: subtract the [-0.5,0) s mean
    t = np.array(times, float); a = np.array(y, float)
    m = (t >= -0.5) & (t < 0)
    return a - (np.nanmean(a[m]) if m.any() else 0.0)

def roi_label(roi):
    n = "".join(ch for ch in str(roi) if ch.isdigit())
    return f"ROI {n}" if n else str(roi)

def draw_panel(ax, p, show_y):
    ax.axhline(0, color="#ccc", lw=0.6); ax.axvline(0, color="#ccc", lw=0.6)
    ax.axhline(REF_AMP, color="#2a2", lw=0.7, ls=":", alpha=0.6)
    for key, lab, col in KERNELS:
        ax.plot(p[key]["times"], prezero(p[key]["times"], p[key]["y"]), color=col, lw=1.2)
    st, sraw = np.array(p["sta"]["times"], float), np.array(p["sta"]["y"], float)
    if sraw.size and sraw.size == st.size:  # STA can be empty (all events overlap-rejected)
        sy = prezero(st, sraw)
        speak = np.nanmax(np.abs(sy[(st >= 0) & (st <= 2)])) or 1
        ax.plot(st, sy * (FIXED_HI * 0.75 / speak), color="#666", ls="--", lw=1.0)
    ax.set_xlim(-5, 5); ax.set_ylim(FIXED_LO, FIXED_HI); ax.tick_params(labelsize=6.5)
    if not show_y:
        ax.set_yticklabels([])  # shared y-axis — only the leftmost column is labeled
    else:
        ax.set_ylabel("dF/F₀ (fixed abs.)", fontsize=8)
    good = p["decent"]
    ax.set_title(f"{roi_label(p['roi'])} {'✓' if good else '–'}",
                 fontsize=9, color="#161" if good else "#a22", weight="bold")
    sta_lag = f"{p['staPeakLagS']:.1f}" if p.get("staPeakLagS") is not None else "—"
    ax.text(0.5, -0.30, f"fv {p['fvAmpAdj']:+.4f}@{p['fvPeakLagS']:.1f} · pm@{p['pmPeakLagS']:.1f} · STA@{sta_lag}",
            transform=ax.transAxes, ha="center", va="top", fontsize=6.6, family="monospace", color="#333")
    axin = ax.inset_axes([0.03, 0.60, 0.34, 0.38])  # top-LEFT (pre-spike, flat for a real kernel)
    for key, lab, col in KERNELS:
        axin.plot(p[key]["times"], prezero(p[key]["times"], p[key]["y"]), color=col, lw=0.6)
    axin.axhline(0, color="#ccc", lw=0.4); axin.set_xlim(-5, 5)
    axin.set_xticks([]); axin.set_yticks([]); axin.set_title("auto-scale", fontsize=5.5)

def render_page(d):
    blocks = [("baseline", d["baseline"], "baseline"), ("treatment", d["treatment"], "treatment")]
    if d.get("hik", {}).get("present"):
        blocks.append(("hik", d["hik"], "hik"))
    nblk = len(blocks)

    fig = plt.figure(figsize=(4.7 * nblk, 9.2))
    gs_top = fig.add_gridspec(1, 1, left=0.06, right=0.955, top=0.905, bottom=0.665)
    gs_bot = fig.add_gridspec(2, 2 * nblk, left=0.06, right=0.985, top=0.575, bottom=0.115,
                              hspace=0.52, wspace=0.34)

    # ── context strip (rasterized: dense bars + trace, keeps PDF small) ──────────
    ctx = d["context"]
    axc = fig.add_subplot(gs_top[0, 0])
    t = np.array(ctx["t"]) / 60.0
    axc.plot(t, ctx["y"], color="#178", lw=0.4, alpha=0.9, rasterized=True)
    axc.set_ylabel("dF/F₀ (roi1)", color="#178", fontsize=9); axc.tick_params(labelsize=8)
    axb = axc.twinx()
    bc = np.array(ctx["binCenters"]) / 60.0
    axb.bar(bc, ctx["binCounts"], width=(bc[1]-bc[0]) if len(bc) > 1 else 0.016,
            color="#555", alpha=0.28, lw=0, rasterized=True)
    axb.set_ylabel("APs / 1 s bin", color="#555", fontsize=9); axb.tick_params(labelsize=8)
    axc.set_zorder(axb.get_zorder() + 1); axc.patch.set_visible(False)
    for r in ctx["regions"]:
        c = TYPE_C.get(r["type"], "#888")
        ws, we, rs, re = r["winStart"]/60, r["winEnd"]/60, r["rawStart"]/60, r["rawEnd"]/60
        axc.axvspan(ws, we, color=c, alpha=0.10, lw=0, zorder=0)
        axc.axvline(ws, color=c, lw=1.0); axc.axvline(we, color=c, lw=1.0)
        if ws - rs > 1e-6: axc.axvspan(rs, ws, color="#d33", alpha=0.16, lw=0, zorder=0)
        if re - we > 1e-6: axc.axvspan(we, re, color="#d33", alpha=0.16, lw=0, zorder=0)
        axc.text((ws+we)/2, axc.get_ylim()[1], f"{r['name']}\n({r['type']})", ha="center", va="top",
                 fontsize=8, color=c, weight="bold")
    axc.set_xlim(0, d["tEnd"]/60.0)
    axc.set_title("calcium (roi1) + 1 s-binned APs · region windows (solid edges) · red = solution_delay / cap trim", fontsize=9.5)

    def draw_block(block, col0, kind):
        cells = [(0, col0), (0, col0 + 1), (1, col0), (1, col0 + 1)]
        if not block.get("present"):
            ax = fig.add_subplot(gs_bot[0:2, col0:col0 + 2])
            if block.get("absent", True):
                msg = f"no {kind} region"
            else:
                nm = block.get("region") or kind
                sc = block.get("spikeCount", 0)
                sp = "spike" if sc == 1 else "spikes"
                msg = f"{nm}\n\n{sc} {sp} in window\ntoo few for kernel test"
            ax.text(0.5, 0.5, msg, ha="center", va="center", fontsize=13, color="#999", style="italic")
            ax.set_xticks([]); ax.set_yticks([])
            for s in ax.spines.values(): s.set_edgecolor("#ddd")
            return
        for i, (rr, cc) in enumerate(cells):
            ax = fig.add_subplot(gs_bot[rr, cc])
            if i < len(block["panels"]):
                draw_panel(ax, block["panels"][i], show_y=(cc == 0))
            else:
                ax.set_xticks([]); ax.set_yticks([])
                for s in ax.spines.values(): s.set_edgecolor("#eee")

    L, R = 0.06, 0.985
    for bi, (kind, block, deflabel) in enumerate(blocks):
        xc = L + (R - L) * (bi + 0.5) / nblk
        if block.get("present"):
            nm = block["region"].upper() + ("" if kind == "baseline" else f" ({kind})")
            txt = f"{nm} — top 4  ({block.get('nDecent',0)}✓ / {d['nRoi']} ROIs)"
        else:
            txt = f"{deflabel.upper()} (reserved)"
        fig.text(xc, 0.618, txt, ha="center", fontsize=11, weight="bold", color=TYPE_C[kind])
        draw_block(block, 2 * bi, deflabel)

    handles = [Line2D([0], [0], color=c, lw=1.6, label=l) for _, l, c in KERNELS] + \
              [Line2D([0], [0], color="#666", ls="--", lw=1.3, label="STA (scaled)"),
               Line2D([0], [0], color="#2a2", ls=":", lw=1.0, label=f"expected unitary amp ({REF_AMP})")]
    fig.legend(handles=handles, loc="lower center", ncol=5, bbox_to_anchor=(0.5, 0.006),
               fontsize=8.5, frameon=False)

    grp, treat = d.get("group"), d.get("treat")
    head = f"Group {grp} · slice {d['id']} · {treat}" if grp else f"slice {d['id']}"
    fig.suptitle(head, fontsize=13, weight="bold", y=0.975)
    fig.text(0.5, 0.938, f"kernels at fixed absolute dF/F₀ (green dotted = expected unitary amp {REF_AMP}) · "
             "✓ = plausibility screen (eyeball = verdict, ADR-0018)", ha="center", fontsize=8, color="#555")
    return fig

if __name__ == "__main__":
    d = json.load(open(os.environ.get("JSON_IN", "darkroom/slice2.json")))
    fig = render_page(d)
    out = os.environ.get("PNG_OUT", "darkroom/slice2.png")
    fig.savefig(out, dpi=130)
    print("wrote", out)
