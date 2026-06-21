# 3. Kernel source — parameterized library, no freehand drawing

## Status

Accepted

## Context

On the teaching side a kernel is **chosen** to demonstrate how it shapes the output (see `FOUNDATIONS.md` §2, Tab 1). Options considered for where that kernel comes from:

- A **library** of canonical shapes.
- The same shapes with **live parameters**.
- **Freehand** drawn or typed arbitrary kernels.

Separately, the **calcium indicator response** — a fast rise plus exponential decay, parameterized by `tau_rise` / `tau_decay` — is a shape researchers actually care about. Offering it as a library entry bridges the abstract teaching tabs to the real Tab 2/3 calcium use case (`FOUNDATIONS.md` §1).

## Decision

The teaching-side kernel is a **parameterized library of canonical shapes** — e.g. Gaussian, exponential decay, boxcar / moving-average, and the calcium indicator rise/decay shape (difference-of-Gaussians optional).

Each shape exposes **live parameters** (width, `tau`, length) via sliders, so changing them updates the output in real time. This is where the interactive teaching value lives.

**Freehand drawn or typed kernels are explicitly excluded** — not v1, not planned. They add flexibility a learner rarely needs and don't teach a named concept the way a labeled, parameterized shape does.

## Consequences

**Pros**

- Parameterized shapes *are* the interactive lesson: drag the width, watch the output smear.
- The calcium kernel as a library entry is the bridge from teaching to the flagship research use case.
- Excluding freehand keeps the UI and the mental model clean.

**Cons**

- No arbitrary kernel shapes on the teaching side. Acceptable, since every teaching goal is served by a named parameterized shape.

**Note**

- This ADR concerns kernels **chosen as input** (Tabs 1 and 3). **Tab 2 does not take a kernel as input — it *recovers* one** — so this ADR does not govern Tab 2's kernel.

See `FOUNDATIONS.md` §1 (calcium use case) and §2 (tab roles), and open question §10.4 (kernel source for the teaching side).
