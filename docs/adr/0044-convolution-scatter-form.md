# ADR-0044: `convolveLinear` accumulates by scatter — the definition, reordered

## Status

Accepted
(Records existing behaviour and pins it with a test. No code change.
[ADR-0006](0006-linear-convolution.md) decided *linear vs circular*; this decides nothing new,
it documents the **formulation** that ADR never mentioned.)

## Context

`convolve.js` computes convolution as **"stamp and sum"** — for each input sample `i`, add a scaled
copy of the kernel at that offset — and its comment calls this "exactly the teaching description."
That claim was asserted in a source comment and nowhere else. Asked whether it cuts a corner, the
repo had no answer on file: no ADR covers it, and the test suite pinned one hand-computed example
(`[0,1,0] ⊛ [1,2,3]`) plus the boxcar identity, which would catch a *broken* implementation but not
a subtly *different* one.

## Decision

Keep the scatter form, and record why it is exact.

Discrete linear convolution is `(x * h)[n] = Σₖ x[k]·h[n−k]`. The textbook computation is a
**gather** — walk each output `n`, collect the products landing on it. `convolve.js` uses the
**scatter** — walk each input `i`, add `x[i]·h[j]` into `out[i+j]`. Both enumerate the same set of
products `{x[i]·h[j]}` and partition it the same way, by `i+j`. It is loop reordering, not an
approximation. The scatter form is kept because it is the sparse-efficient shape for spike trains
(empty samples are skipped) *and* because it is literally the sentence the tab teaches: stamp the
kernel at each delta, scaled by amplitude.

**One line is an implementation shortcut rather than pure reordering**: `if (xi === 0) continue`.
A zero input contributes zero to every output, so the skip is exact for finite values; it would
diverge only if a kernel held `Infinity` or `NaN`, since `0 × Inf` is `NaN`. The builders emit only
finite samples, so it never bites — but it is the one place the code is not a literal transcription.

## Consequences

- **Tested as a property, not an example.** `core.test.mjs` now diffs `convolveLinear` against a
  reference written straight from the definition, over eight input/kernel shape pairs of **dense
  random** values — no zeros, so the sparse skip never fires and floating-point ordering is
  maximally exposed. A future "optimization" that changes the math now fails loudly. 240/240.
- **The assertion is agreement to rounding (rel ≤ 1e-12), not bit-identity.** The two forms are
  measurably bit-identical today, because both accumulate a given output bin in increasing `i`, and
  the test *reports* that — but does not assert it. Floating-point addition is not associative, so
  a legitimate reordering could cost the last ulp without being wrong, and the test should not fail
  for that.
- **Where the real approximations are**, none of them in the forward multiply: spike times snap to
  the nearest grid sample ([ADR-0001](0001-delta-rasterization.md)), the kernel is truncated below
  0.1% of peak ([ADR-0039](0039-kernel-support-amplitude-cutoff.md)), and the FFT deconvolution is
  circular with zero-padding ([ADR-0006](0006-linear-convolution.md),
  [ADR-0017](0017-circular-deconv-zero-padding-no-fix.md)).
- Relates to: [ADR-0006](0006-linear-convolution.md) (linear vs circular — the other axis),
  [ADR-0001](0001-delta-rasterization.md) (the rasterization this convolves).
