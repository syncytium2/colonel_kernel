#!/usr/bin/env python
# One-page, graphics-first explainer of the four kernel-recovery methods.
# Synthetic illustrative curves (data-safe). Colors match the dataset-summary PDF.
#   darkroom/venv/bin/python darkroom/methods_explainer.py
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

C_DEC, C_PAR, C_CON, C_STA = "#1177aa", "#77aa33", "#cc5500", "#666666"
TRUE = "#bbbbbb"

lag = np.linspace(-5, 5, 501)
def dexp(t, tr, td, amp):
    k = np.where(t >= 0, np.exp(-t/td) - np.exp(-t/tr), 0.0)
    return amp * k / k.max()
k_true = dexp(lag, 0.25, 1.5, 1.0)
rng = np.random.default_rng(7)

fig = plt.figure(figsize=(15, 9.6))
# THREE recovery methods, plus a check — not four methods. methods.html §6 is "Three
# parallel recovery methods" and §7 files the spike-triggered average separately as the
# "validation partner": it assumes no kernel and solves no inverse problem. Titling it a
# fourth method quietly converts an independence check into a fourth estimate.
fig.suptitle("Three ways to recover a calcium kernel — and one check on them",
             fontsize=23, weight="bold", y=0.982)
fig.text(0.5, 0.923, "the kernel = the calcium bump caused by ONE action potential",
         ha="center", fontsize=13, color="#555", style="italic")

# ── TOP: the problem (spikes ⊛ kernel = calcium) ────────────────────────────────
gs_top = fig.add_gridspec(1, 3, left=0.06, right=0.965, top=0.86, bottom=0.63, wspace=0.42)
axS = fig.add_subplot(gs_top[0]); axK = fig.add_subplot(gs_top[1]); axC = fig.add_subplot(gs_top[2])

spk = [0.6, 1.4, 3.1, 4.0, 6.2, 7.7]
axS.eventplot([spk], colors="#333", lineoffsets=0.5, linelengths=0.85, linewidths=2)
axS.set_xlim(0, 9); axS.set_ylim(0, 1)
axS.set_title("action potentials\n(we MEASURE these)", fontsize=13, weight="bold")

axK.plot(lag, k_true, color="#333", lw=3)
axK.fill_between(lag, 0, k_true, color="#333", alpha=0.08)
axK.set_xlim(-2, 5)
axK.set_title("the KERNEL — unknown", fontsize=13, weight="bold", color="#b00")
axK.text(2.2, 0.55, "?", fontsize=42, color="#b00", weight="bold", ha="center")

t_ca = np.linspace(0, 9, 900); ca = np.zeros_like(t_ca)
for s in spk:
    tt = t_ca - s
    ca += np.where(tt >= 0, np.exp(-tt/1.5) - np.exp(-tt/0.25), 0.0)
ca = ca/ca.max() + 0.04*rng.standard_normal(t_ca.size) + 0.12*np.sin(t_ca/3)
axC.plot(t_ca, ca, color=C_DEC, lw=1.3); axC.set_xlim(0, 9)
axC.set_title("calcium signal\n(we MEASURE this)", fontsize=13, weight="bold")

for ax in (axS, axK, axC):
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values(): s.set_visible(False)
fig.text(0.353, 0.745, "⊛", fontsize=28, ha="center", va="center", color="#333")
fig.text(0.353, 0.675, "convolve", fontsize=9, ha="center", color="#888")
fig.text(0.655, 0.745, "=", fontsize=28, ha="center", va="center", color="#333")

# ── BOTTOM: 2×2 method cards ─────────────────────────────────────────────────────
# bottom=0.145, not 0.10: the footer grew to two lines (the AGREE line plus the
# "illustrative, not computed" disclosure) and the first version of that collided with the
# bottom-left panel's "lag from spike (s)" label.
gs = fig.add_gridspec(2, 2, left=0.05, right=0.97, top=0.57, bottom=0.145, hspace=0.46, wspace=0.16)

def card(gpos, color, name, tag_lines, good, watch, draw, pic_title="recovered kernel"):
    sub = gpos.subgridspec(1, 2, width_ratios=[1.25, 1], wspace=0.10)
    axtxt = fig.add_subplot(sub[0]); axpic = fig.add_subplot(sub[1])
    axtxt.set_xlim(0, 1); axtxt.set_ylim(0, 1); axtxt.axis("off")
    axtxt.add_patch(FancyBboxPatch((0.0, 0.83), 0.98, 0.15, boxstyle="round,pad=0.008",
                    fc=color, ec="none", transform=axtxt.transAxes))
    axtxt.text(0.04, 0.905, name, fontsize=16, weight="bold", color="white", va="center")
    axtxt.text(0.02, 0.72, "\n".join(tag_lines), fontsize=12, color="#222", va="top", linespacing=1.35)
    axtxt.text(0.02, 0.22, f"✓  {good}", fontsize=11, color="#161", va="top")
    axtxt.text(0.02, 0.09, f"⚠  {watch}", fontsize=11, color="#a22", va="top")
    axpic.axhline(0, color="#ddd", lw=0.8); axpic.axvline(0, color="#ddd", lw=0.8)
    axpic.plot(lag, k_true, color=TRUE, lw=2, ls="--", zorder=1)
    draw(axpic)
    axpic.set_xlim(-5, 5); axpic.set_yticks([]); axpic.tick_params(labelsize=7)
    # "time after spike" spanning -5..+5 is a contradiction on its face, and the negative
    # half is the most load-bearing part of a recovered kernel here: ADR-0009 retains it
    # deliberately, and the shaped method carries a dedicated acausal penalty on it.
    axpic.set_xlabel("lag from spike (s)", fontsize=8)
    # the STA panel is not a recovery; it must not carry the same title as the three that are
    axpic.set_title(pic_title, fontsize=8, color="#888")

def d_dec(ax):
    ax.plot(lag, k_true + 0.06*rng.standard_normal(lag.size) - 0.05*lag/5, color=C_DEC, lw=1.6)
card(gs[0, 0], C_DEC, "FREE-VECTOR",
     ["Mathematically undo the", "mixing (spikes → calcium).", "No shape assumed."],
     "recovers ANY shape", "wiggly, baseline can drift", d_dec)

def d_par(ax):
    ax.plot(lag, dexp(lag, 0.32, 1.7, 1.02), color=C_PAR, lw=2.6)
    ax.text(0.7, 0.9, "rise", fontsize=8, color=C_PAR); ax.text(2.6, 0.5, "decay", fontsize=8, color=C_PAR)
card(gs[0, 1], C_PAR, "PARAMETRIC",
     ["Assume the shape (fast", "rise + slow decay); fit", "just a few numbers."],
     "clean, few knobs", "wrong if the shape differs", d_par)

def d_con(ax):
    y = k_true + 0.015*rng.standard_normal(lag.size); y[lag < 0] *= 0.3
    ax.plot(lag, y, color=C_CON, lw=2.2)
card(gs[1, 0], C_CON, "SHAPED",
     ["Undo the mixing, but keep", "it behaving — smooth, flat", "baseline, no pre-spike bump."],
     "flexible AND clean", "penalties can bias the shape", d_con)

def d_sta(ax):
    for _ in range(5):
        ax.plot(lag, dexp(lag, 0.25, 1.5, 1.0)*(0.7+0.5*rng.random()) + 0.12*rng.standard_normal(lag.size),
                color=C_STA, lw=0.6, alpha=0.28)
    blur = np.convolve(k_true, np.ones(25)/25, mode="same")
    ax.plot(lag, blur/blur.max(), color=C_STA, lw=2.6)
# The old caveat ("blurs when spikes crowd") named the wrong failure mode. The shipped
# spikeTriggeredAverage REJECTS a spike whose neighbour is within half a window (and skips
# the first and last), so a crowded recording does not blur — it starves. Measured at the
# shipped 1 s window: 31/33 spikes accepted at 0.1 Hz, but only 10 of 1515 at 5 Hz.
card(gs[1, 1], C_STA, "STA",
     ["Snip the calcium around each", "ISOLATED spike, subtract its", "own baseline, average those."],
     "assumes no kernel at all", "discards spikes with close neighbours", d_sta,
     pic_title="spike-triggered average")

fig.text(0.5, 0.052, "If a real kernel exists, the three methods and the check roughly AGREE.   Disagreement is the diagnostic.",
         ha="center", fontsize=12.5, weight="bold", color="#333")
# Say what these panels are. They are drawn from one k_true array — the free-vector panel is
# k_true plus noise and a tilt, the STA panel is a box blur — so the agreement they show is a
# property of the drawing, not a result. Without this line the figure's bold bottom line reads
# as evidence for a claim it cannot test.
fig.text(0.5, 0.016, "Illustrative sketches of each method's characteristic behaviour — drawn, not computed by the solvers.",
         ha="center", fontsize=10, color="#777", style="italic")

fig.savefig("darkroom/methods_explainer.pdf")
fig.savefig("darkroom/methods_explainer.png", dpi=140)
fig.savefig("darkroom/methods_explainer.svg")  # for the in-app "About the methods" modal
print("wrote darkroom/methods_explainer.pdf (+ .png, .svg)")
