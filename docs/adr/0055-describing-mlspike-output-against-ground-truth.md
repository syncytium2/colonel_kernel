# ADR-0055: Describing MLspike output against loose-patch ground truth

## Status

Proposed (2026-11-20). Not murderboarded (Tony, 2026-11-20).

## Context

colonel_kernel and jsMLspike are tuning MLspike's parameters against the kernels recovered
from loose-patch ground truth. Six cells have accepted kernels. The work uses the 8 lab files in
`rawF_kernel_test/` and simulated traces built from them. While reporting the first test
window, this session wrote:

> "every spike MLspike reported there was a false detection"

That window was a simulated trace with no planted AP, so the sentence was true only relative to
that planted truth. The trace it was simulated from was 458's first 5 minutes, during which the
loose patch was recording and the patched cell fired no AP. Read as a statement about the
real recording, it decides a question this project exists to leave open. Three things already
settled, and one new observation, bear on it:

1. **Spikes and calcium can be uncoupled.** This is the project's core premise
   (FOUNDATIONS §2, §3). Calcium that the patched cell's APs do not explain is a finding whose
   cause is "the human's call". The live readings are AP-independent calcium, an AP-evoked
   event with anomalous gain and kinetics, or a neighbouring cell or neuropil inside the ROI
   (FOUNDATIONS §3).
2. **No AP in the patched cell is not the same as no cause**
   ([ADR-0017](0017-circular-deconv-zero-padding-no-fix.md)).
   ADR-0017 also sets a test for words: *would the word still make sense if the estimator did
   not exist?* "False detection" applied to a real-data MLspike event with no confirmed AP fails
   that test, the same way "contaminant" did.
3. **Spike inference assumes the coupling that colonel_kernel tests** (FOUNDATIONS §2:
   "believers" against "skeptic"). To score MLspike's counts against the patched cell's APs on
   real data is to adopt the null model: the AP-independent dial at 0
   ([ADR-0049](0049-ap-independent-calcium-slider.md)).
4. **New, Tony 2026-11-20:** in these recordings, what appear to be unitary calcium signals
   persist in the presence of TTX. Spike inference may therefore routinely fail here. The
   "spikes" MLspike reports may simply be the onsets of calcium transients of a particular
   shape. On that reading, MLspike is a sophisticated event detector, set beside custard, which
   looks only for ups and downs. This is recorded as Tony's observation. This ADR does not test it
   and draws no mechanism from it.
5. **New, Tony 2026-11-20:** the amplitude of apparent unitary calcium events varies by as much
   as 50%. The premise of a single amplitude per unitary event may therefore also be wrong.
   MLspike assumes one `a` per calibration. colonel_kernel's own recovery assumes one kernel per
   region: per-spike weights are excluded on purpose
   ([ADR-0001](0001-delta-rasterization.md)), so the recovered kernel is the response averaged over
   APs. Neither model represents event-to-event amplitude variation.

## Decision

**MLspike's output is called "MLspike events", never "spikes" or "APs".** In this repository's
docs, figures and messages, an MLspike event is the onset of a calcium transient of the shape
MLspike's model assumes. Whether a given event corresponds to an AP is known only where a
confirmed AP from the patched cell coincides with it. Everywhere else it is unknown.

**Two kinds of comparison, never merged:**

- **Surrogate (simulated) data.** The truth is planted, so "missed" and "no planted AP" are
  exact. They are always stated as *relative to the planted APs*. Every claim from a surrogate
  names it as simulated in the same sentence.
- **Real data.** The reference is the patched cell's confirmed APs, and comparison with them is
  *agreement*, never accuracy or error rate. Disagreement is reported as an observation in both
  directions, without assigning it to MLspike or to the cell.

**Vocabulary:**

| Context | Say | Do not say |
|---|---|---|
| MLspike output, any data | "MLspike events" | "spikes", "APs", "inferred spikes" |
| Surrogate: event with no planted AP | "event with no planted AP (simulated)" | "false positive" without "relative to planted truth" |
| Real: event with no confirmed AP | "MLspike event with no confirmed AP from the patched cell" | "false detection", "spurious", "error" |
| Real: confirmed AP with no event | "confirmed AP with no MLspike event" | "miss", unless the patched cell's APs are named as the reference |
| Residual used to build surrogates | "residual not explained by the patched cell's kernel" | "noise", on its own |
| Real-data count comparison | "agreement with the patched cell's confirmed APs" | "accuracy", "spike-inference performance" |

**What a tuned parameter set may be said to do.** On real data, it maximises agreement between
MLspike events and the patched cell's confirmed APs, on the cells and windows it was scored on.
It is not shown to infer spikes, and it is not validated for unpatched ROIs. A set that wins on
agreement could win by passing over calcium that the APs do not explain, and that is the
phenomenon this project measures.

## Consequences

- jsMLspike's Stage 2/3 report uses this vocabulary. The plan agreed on 2026-11-20 stands. Only
  how its real-data scores are described changes.
- A direct test of the TTX observation is available in principle: MLspike events in recordings
  under TTX, where no AP-driven calcium is expected from any cell in the field. It needs lab
  files for those recordings, which interface2 would have to export. Tony's standing instruction
  is no export, so the test is listed as open, not requested.
- **Amplitude variability (point 5).** A single tuned `a` is a central value, not the amplitude
  of every event. Results are described that way: "the fitted `a`", never "the unitary
  amplitude". The fold-to-fold differences already seen in the Stage 1 fits are reported as they
  are, without being attributed to this or to anything else. For example, 458's shaped `a` is
  1.57% on one fold and 2.52% on the other. **If time allows** (Tony): build variability into
  `a`, by planting per-event amplitude jitter of up to ±50% in the surrogates and seeing how each
  configuration responds. This is optional and not scheduled.
- If accepted, FOUNDATIONS §2's companion-app paragraph gets one sentence: in these recordings,
  MLspike's output may be transient onsets rather than spikes (Tony's TTX observation). That
  edit waits for acceptance. FOUNDATIONS is not changed by a Proposed ADR.
- The 2026-11-20 sentence quoted in Context is corrected by this ADR. It was never committed to
  the repository.
