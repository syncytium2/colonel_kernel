#!/usr/bin/env python
# Assemble the full-dataset PDF: one page per slice, ordered per the manifest
# (treatment: baseline → senktide → TTX → sb222200 → other). Vector pages (context
# strip rasterized) via PdfPages. Reuses render_page() from fig_slice_page2.
#   darkroom/venv/bin/python darkroom/build_pdf.py
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from fig_slice_page2 import render_page

MANIFEST = "darkroom/pdf/manifest.json"
OUT = "darkroom/dataset_summary_full.pdf"

manifest = json.load(open(MANIFEST))
print(f"assembling {len(manifest)} pages → {OUT}")
with PdfPages(OUT) as pdf:
    last_cat = None
    for i, m in enumerate(manifest, 1):
        if m["category"] != last_cat:
            print(f"  -- {m['category']} --"); last_cat = m["category"]
        d = json.load(open(m["json"]))
        fig = render_page(d)
        pdf.savefig(fig, dpi=200)  # rasterized strip renders at 200 dpi; vector elsewhere
        plt.close(fig)
        print(f"  [{i:2}/{len(manifest)}] {m['id']} ({m['group']}, {m['treat']})")
    info = pdf.infodict()
    info["Title"] = "colonel_kernel — dataset kernel summary (full)"
print("wrote", OUT)
