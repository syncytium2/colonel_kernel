#!/usr/bin/env python
# Assemble the full-dataset PDF: one page per slice, ordered per the manifest
# (treatment: baseline → senktide → TTX → sb222200 → other). Vector pages (context
# strip rasterized) via PdfPages. Reuses render_page() from fig_slice_page2.
#   PYTHONPATH=scripts/dataset-summary darkroom/venv/bin/python scripts/dataset-summary/build_pdf.py
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from fig_slice_page2 import render_page

# Deliverables sync to the team Dropbox (see batch_dump.mjs); override with SUMMARY_DIR.
SUMMARY_DIR = os.environ.get("SUMMARY_DIR",
    "/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/team_colonel_kernel/summaries")
MANIFEST = os.path.join(SUMMARY_DIR, "pdf", "manifest.json")
OUT = os.path.join(SUMMARY_DIR, "dataset_summary_full.pdf")

manifest = json.load(open(MANIFEST))
mdir = os.path.dirname(MANIFEST)  # resolve per-slice JSON next to the manifest → folder is relocatable
print(f"assembling {len(manifest)} pages → {OUT}")
with PdfPages(OUT) as pdf:
    last_cat = None
    for i, m in enumerate(manifest, 1):
        if m["category"] != last_cat:
            print(f"  -- {m['category']} --"); last_cat = m["category"]
        d = json.load(open(os.path.join(mdir, os.path.basename(m["json"]))))
        fig = render_page(d)
        pdf.savefig(fig, dpi=200)  # rasterized strip renders at 200 dpi; vector elsewhere
        plt.close(fig)
        print(f"  [{i:2}/{len(manifest)}] {m['id']} ({m['group']}, {m['treat']})")
    info = pdf.infodict()
    info["Title"] = "colonel_kernel — dataset kernel summary (full)"
print("wrote", OUT)
