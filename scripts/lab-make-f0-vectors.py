"""Make the parity vectors for src/lib/lab/extraction.js (ADR-0053).

    python3 scripts/lab-make-f0-vectors.py /path/to/haruspex/tools/f0_recompute.py

Writes src/lib/lab/fixtures/f0-parity.json. The input trace is SYNTHETIC (seeded noise,
drift and events; no lab data). The reference F0 comes from haruspex's Python port of
deltaFoverFzeroEmbedded.m, which reproduces the archive's stored F0 on all 72 recordings
(haruspex ADR-0007). Its functions are lifted out of the file by name so that importing
h5py and the lab's path module is not needed.

The percentile-filter reference is an independent NumPy transcription of CaImAn's
prctfilt.m (mode 0), using the 'hazen' percentile, which is MATLAB's prctile rule.
"""
import ast
import json
import math
import pathlib
import sys

import numpy as np


def lift(path, names):
    src = pathlib.Path(path).read_text()
    tree = ast.parse(src)
    keep = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    missing = set(names) - {n.name for n in keep}
    if missing:
        raise SystemExit(f"not found in {path}: {sorted(missing)}")
    ns = {"np": np}
    exec(compile(ast.Module(body=keep, type_ignores=[]), path, "exec"), ns)
    return ns


def prctfilt_baseline(x, p, window, shift):
    n = x.size
    window = min(window, n)
    shift = min(shift, window)
    c = math.ceil((window - 1) / 2)
    pad = np.concatenate([x[:c], x, x[n - c:]])
    starts = np.arange(0, pad.size, shift)
    ends = np.arange(window, pad.size + 1, shift)
    ln = ends.size
    starts = starts[:ln]
    pcs = np.array([np.percentile(pad[s:e], p, method="hazen") for s, e in zip(starts, ends)])
    dx = np.diff(pcs)
    xf = np.concatenate([pcs[i] + dx[i] * np.arange(shift) / shift for i in range(ln - 1)]) if ln > 1 else np.array([])
    need = n - xf.size
    if need > 0:
        xf = np.concatenate([xf, xf[::-1][:need]])
    return xf[:n]


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    ns = lift(sys.argv[1], ["bar_f", "min_bar_f"])
    rng = np.random.default_rng(20261116)
    dt = 0.1
    n = 3000
    t = np.arange(n) * dt
    f0 = 400.0 * (0.75 + 0.25 * np.exp(-t / 250.0)) * (1 + 0.03 * np.sin(2 * np.pi * t / 140.0))
    ev = np.zeros(n)
    for at in rng.uniform(10, 290, size=12):
        i0 = int(at / dt)
        tt = (np.arange(n - i0)) * dt
        ev[i0:] += rng.uniform(0.05, 0.4) * (1 - np.exp(-tt / 0.3)) * np.exp(-tt / rng.uniform(2, 30))
    raw = (f0 * (1 + ev) + rng.normal(0, 3, n)).astype(np.float32)
    raw64 = raw.astype(np.float64)

    half, n4 = int(round(1.0 / dt / 2.0)), int(round(20.0 / dt))
    b = ns["bar_f"](raw64, 2 * half)
    m = ns["min_bar_f"](b, np.inf, n4)
    dff = ((raw - m) / m).astype(np.float32)

    cases = []
    for (p, window, shift) in [(10, 50, 1), (20, 37, 5), (50, 8, 8)]:
        base = prctfilt_baseline(dff.astype(np.float64), p, window, shift)
        cases.append({"p": p, "window": window, "shift": shift, "baseline": [float(v) for v in base]})

    out = {
        "note": "synthetic trace; reference from haruspex tools/f0_recompute.py (bar_f, min_bar_f) and a NumPy transcription of prctfilt.m",
        "dt": dt,
        "half": half,
        "n4": n4,
        "raw": [float(v) for v in raw],
        "barF": [float(v) for v in b],
        "f0": [float(v) for v in m],
        "dff": [float(v) for v in dff],
        "prct": cases,
    }
    dest = pathlib.Path(__file__).resolve().parent.parent / "src/lib/lab/fixtures/f0-parity.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out))
    print(f"wrote {dest} ({dest.stat().st_size} bytes); n={n}, slope-filled samples: {int(np.sum(np.diff(m) != 0))}")


if __name__ == "__main__":
    main()
