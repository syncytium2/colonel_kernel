# 10. Idealized-recovered kernel is an open family toggle

## Status

Accepted

## Context

- `FOUNDATIONS.md` §2 ("Three kernel concepts") defines the **idealized recovered
  kernel**: a chosen / teaching kernel assigned the **role** of standing in for a
  Tab 2 recovered kernel — the bridge between *authored* and *measured* kernels. It
  is a teaching / validation device, **role first with shape following**, and needs
  no new code object (it is an ordinary chosen kernel used in a recovered kernel's
  place).
- That subsection left one question explicitly open: **which family** serves as the
  canonical stand-in (calcium vs. exponential were the candidates under
  discussion). This ADR settles it.

## Decision

- The idealized-recovered kernel is **not a single designated family.** **Any**
  chosen-kernel family — gaussian, exponential, boxcar, calcium, and any family
  added later ([ADR-0003](0003-kernel-source.md)) — can be assigned the stand-in
  role, selected via a **user-facing toggle**.
- The toggle is **open**: not limited to a fixed pair, and **extensible** to
  families introduced in the future. No family is privileged as "the"
  idealized-recovered kernel.

## Consequences

**Rationale**

- The idealized-recovered kernel is a **teaching / validation device**, and the
  *difference* between stand-ins is itself the lesson. A minimal causal stand-in
  (exponential: few params) versus a richer one (calcium: rise + decay, more
  params) holds the **data fixed and varies the model** — observing what changes is
  a small, in-tab instance of the project's broader cross-method,
  hold-data-fixed/vary-model instinct (cf. STA vs. deconvolution,
  [ADR-0005](0005-tab2-sta-validation-partner.md)).
- Keeping the toggle **open** (rather than fixing two families) deliberately
  preserves **unphysiological** stand-ins — notably **boxcar** — as **probes of the
  forward path.** A hard-edged, no-decay kernel makes convolution / alignment
  artifacts *visible* that a smooth physiological kernel would mask. The adversarial
  case is worth keeping reachable.

**Implications**

- The **forward path / convolution must accept any family in the stand-in role**;
  no family may be special-cased as the idealized-recovered kernel.
- `FOUNDATIONS.md` §2's open sub-point ("which family is canonical — undecided") is
  **resolved** by this ADR and updated to reference it (open toggle, no canonical
  family).

**Scope / explicitly out of scope**

- This ADR does **not** touch the chosen-vs-recovered **object distinction**, the
  `{values, originOffset}` → `{samples, dt, zeroIndex}` **struct rename**, or the
  **validation metric / threshold** — those remain separate and still open.

## Cross-references

- `FOUNDATIONS.md` §2 — three kernel concepts (chosen → idealized-recovered →
  recovered).
- [ADR-0003](0003-kernel-source.md) — chosen-kernel source and families.
- [ADR-0009](0009-centered-symmetric-lag-explicit-zero-index.md) — explicit-origin
  signal contract.
- [ADR-0004](0004-tab2-deconvolution-method.md) — the recovered kernel (Tab 2).
