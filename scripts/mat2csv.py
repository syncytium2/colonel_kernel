#!/usr/bin/env python3
"""mat2csv — the offline .mat → CSV bridge for colonel_kernel (FOUNDATIONS §5).

WHY THIS EXISTS
  The app ingests CSV, not .mat (FOUNDATIONS §5: "CSV first; reading .mat directly
  in-browser is a deliberate later addition, not part of v1"). The app is also
  client-side with no backend and a strict no-egress posture (§6), so .mat decoding
  belongs OFFLINE, here — not in the browser. This script is the sanctioned bridge:
  it reads the lab's processed APs_v1_*.mat outputs and writes the per-region CSV
  schema the app loads.

  It also preserves, as tracked code, the HDF5 (MATLAB v7.3) navigation that was
  validated against the reference fixtures during the noise reconnaissance — so that
  hard-won "k_sta_store → region → stack/timing/spikes" knowledge is not stranded in
  gitignored scratch.

PRIVACY / REPO HYGIENE (non-negotiable, CLAUDE.md + FOUNDATIONS §6)
  This SCRIPT is tracked; its OUTPUT is not. Default output dir is ./exports/, which
  is gitignored. Never commit converted CSV — it is researchers' unpublished data.

WHAT IT EMITS  (one CSV per region; the app's scope is one region's worth — ref §1)
  Columns:
    time            dense frame timebase (seconds), one row per frame  [authoritative, ADR-0012]
    spikes          sparse action-potential event times (seconds); SHORTER than the
                    trace columns, so rows below the last spike are left blank (§5's
                    "ragged columns with blanks below the short spike column")
    roi1..roiN      dF/F₀ traces, one column per ROI; roi1 is the default targeted
                    cell (§4), the rest are context / multi-ROI candidates
  Values are written round-trippably (Python repr of float64). The stored `timing`
  is the PRE-trim btiming; the app applies the mod(k,2) trim itself (ADR-0009), so we
  emit it verbatim. Non-finite trace samples are written as the literal NaN.

SOURCE OF TRUTH
  MATLAB CODE/aCa98_batch_APs.m + TDdeconvStack.m, and
  docs/reference/matlab-deconv-pipeline.md. k_sta_store is {nRegion × 2}: column 0 a
  region name (char), column 1 the k_sta struct (or empty for a skipped region).

REQUIREMENTS
  Python 3 with h5py + numpy. The repo's darkroom venv already has them:
    darkroom/venv/bin/python scripts/mat2csv.py data/APs_v1_20241004_80.mat

USAGE
  python scripts/mat2csv.py <file.mat | directory> [--out DIR] [--region NAME] [--dry-run]
    <path>        a single .mat file, or a directory of them
    --out DIR     output directory (default: ./exports)
    --region NAME only convert regions whose (trimmed) name matches NAME
    --dry-run     list regions and shapes; write nothing
"""
import argparse
import os
import re
import sys

try:
    import h5py
    import numpy as np
except ImportError:
    sys.exit(
        "mat2csv needs h5py + numpy. Use the darkroom venv:\n"
        "  darkroom/venv/bin/python scripts/mat2csv.py ...\n"
        "  (or: python -m pip install h5py numpy)"
    )


def decode_name(arr):
    """MATLAB char array (uint* code points) → str."""
    try:
        return "".join(chr(c) for c in np.array(arr).flatten() if c != 0)
    except Exception:
        return ""


def load_regions(path):
    """Yield (region_name, stack[nFrames, nROI], timing[nFrames], spikes[nSpikes])
    per NON-EMPTY region. Mirrors the fixture-validated navigation."""
    out = []
    with h5py.File(path, "r") as f:
        if "k_sta_store" not in f:
            return out
        refs = np.array(f["k_sta_store"][()])
        if refs.ndim != 2:
            return out
        # k_sta_store is {nRegion × 2} in MATLAB; HDF5 may transpose. Orient so the
        # length-2 axis (name, struct) is axis 0.
        if refs.shape[0] != 2 and refs.shape[1] == 2:
            refs = refs.T
        _, n_region = refs.shape
        for j in range(n_region):
            name = decode_name(f[refs[0, j]][()])
            sobj = f[refs[1, j]]
            if not isinstance(sobj, h5py.Group) or "stack" not in sobj:
                continue  # skipped/short region: k_sta is empty
            stack = np.array(sobj["stack"]).squeeze()
            timing = np.array(sobj["timing"]).flatten()
            spikes = (
                np.array(sobj["spikes"]).flatten() if "spikes" in sobj else np.array([])
            )
            if stack.ndim == 1:
                stack = stack[:, None]
            # Align the ROI axis: the axis whose length == nFrames is the sample axis.
            if stack.shape[0] != timing.size and stack.shape[-1] == timing.size:
                stack = stack.T
            out.append((name, stack, timing, spikes))
    return out


def slugify(name, fallback):
    s = re.sub(r"[^0-9A-Za-z]+", "_", name).strip("_")
    return s or fallback


def fmt(x):
    """Round-trippable formatting; non-finite → literal NaN."""
    xf = float(x)
    return "NaN" if xf != xf or xf in (float("inf"), float("-inf")) else repr(xf)


def write_region_csv(out_path, name, stack, timing, spikes):
    n_frames, n_roi = stack.shape
    n_spikes = int(spikes.size)
    header = ["time", "spikes"] + [f"roi{i + 1}" for i in range(n_roi)]
    with open(out_path, "w", newline="") as fh:
        fh.write(",".join(header) + "\n")
        for i in range(n_frames):
            row = [fmt(timing[i])]
            row.append(fmt(spikes[i]) if i < n_spikes else "")
            for r in range(n_roi):
                row.append(fmt(stack[i, r]))
            fh.write(",".join(row) + "\n")
    return n_frames, n_roi, n_spikes


def convert_file(path, out_dir, region_filter, dry_run):
    stem = os.path.splitext(os.path.basename(path))[0]
    regions = load_regions(path)
    if not regions:
        print(f"  {os.path.basename(path)}: no regions with deconvolution data — skipped")
        return 0
    written = 0
    for idx, (name, stack, timing, spikes) in enumerate(regions):
        if region_filter and region_filter.strip() != name.strip():
            continue
        slug = slugify(name, f"region{idx + 1}")
        dt = float(np.mean(np.diff(timing))) if timing.size > 1 else float("nan")
        label = f"{os.path.basename(path)} [{name or '(unnamed)'}]"
        info = (
            f"frames={timing.size} ROIs={stack.shape[1]} spikes={int(spikes.size)} "
            f"dt={dt:.5f} t0={float(timing[0]):.3f}"
        )
        if dry_run:
            print(f"  {label}: {info}  (dry-run)")
            continue
        out_path = os.path.join(out_dir, f"{stem}__{slug}.csv")
        write_region_csv(out_path, name, stack, timing, spikes)
        print(f"  {label}: {info}\n    -> {out_path}")
        written += 1
    return written


def main(argv):
    ap = argparse.ArgumentParser(description="Offline .mat → CSV bridge (FOUNDATIONS §5).")
    ap.add_argument("path", help="a single .mat file, or a directory of them")
    ap.add_argument("--out", default="exports", help="output directory (default: ./exports)")
    ap.add_argument("--region", default=None, help="only convert regions matching this name")
    ap.add_argument("--dry-run", action="store_true", help="list regions; write nothing")
    args = ap.parse_args(argv)

    if os.path.isdir(args.path):
        files = sorted(
            os.path.join(args.path, f) for f in os.listdir(args.path) if f.endswith(".mat")
        )
    elif os.path.isfile(args.path):
        files = [args.path]
    else:
        sys.exit(f"not found: {args.path}")
    if not files:
        sys.exit(f"no .mat files in {args.path}")

    if not args.dry_run:
        os.makedirs(args.out, exist_ok=True)

    print(f"mat2csv: {len(files)} file(s)" + (" (dry-run)" if args.dry_run else f" -> {args.out}/"))
    total = 0
    for path in files:
        total += convert_file(path, args.out, args.region, args.dry_run)
    if not args.dry_run:
        print(f"\nwrote {total} region CSV file(s) to {args.out}/  (gitignored — never commit)")


if __name__ == "__main__":
    main(sys.argv[1:])
