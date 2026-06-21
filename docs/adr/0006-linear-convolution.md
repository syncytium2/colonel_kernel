# 6. Linear convolution (zero-padded) as the default convention

## Status

Accepted

## Context

Convolution can be **linear** or **circular**:

- **Linear** — the output is longer than the inputs; a kernel tail running past the window is simply
  truncated / extends the output, it does not fold back.
- **Circular** — FFT-native; the signal **wraps**, so a tail running off one end reappears at the
  other.

Any FFT-based path is **circular by default** unless the inputs are zero-padded. Since the
deconvolution paths (`FOUNDATIONS.md` §7, [ADR-0004](0004-tab2-deconvolution-method.md)) use FFTs,
the linear-vs-circular choice has to be made deliberately rather than inherited from the transform.

This is the last of the four original open questions in `FOUNDATIONS.md` §10
(linear vs. circular convolution).

## Decision

**Linear convolution is the convention everywhere in the app**, implemented with **zero-padding on
any FFT-based step**.

Circular convolution is **not used for real results**, but is referenced in the **teaching
material** as "what FFT does naively, and why we zero-pad to avoid it."

## Consequences

**Pros**

- **Physically correct** — a late spike cannot influence the start of a calcium trace.
- No confusing **wraparound artifacts** for learners.
- Circular-vs-linear becomes an explicit **teaching point** rather than a hidden trap.

**Cons**

- Requires zero-padding before FFT steps and handling the longer output length. Cheap and standard.

**Scope**

- Applies across **all tabs** and to the **deconvolution paths**, which must respect the linear
  framing via padding (see [ADR-0004](0004-tab2-deconvolution-method.md)).
