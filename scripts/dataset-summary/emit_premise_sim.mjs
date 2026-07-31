// Dump the simulated premise recording to JSON for the figure renderer.
//
//   node scripts/dataset-summary/emit_premise_sim.mjs [out.json]
//
// The MODEL lives in src/lib/core/premise-sim.js and is written in JS on purpose: it is
// built from the same rasterize/buildKernel/convolve/addAWGN primitives the app itself
// uses, so the simulation cannot drift from the tool it illustrates. This script is only
// a pipe — it computes nothing.
//
// Output is synthetic and carries no recorded data, so unlike the real-trace export it is
// safe anywhere. Default target is darkroom/ purely because it is a build intermediate.

import { writeFileSync } from 'node:fs';
import { simulatePremise } from '../../src/lib/core/premise-sim.js';

const out = process.argv[2] || 'darkroom/premise_sim.json';
const s = simulatePremise();

const round = (v, dp) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

writeFileSync(
  out,
  JSON.stringify({
    synthetic: true,
    note: 'Simulated recording — no real data. See src/lib/core/premise-sim.js.',
    t0: round(s.times[0], 4),
    dt: round(s.dt, 6),
    n: s.calcium.length,
    calcium: Array.from(s.calcium, (v) => round(v, 5)),
    apLinked: Array.from(s.apLinked, (v) => round(v, 5)),
    apIndependent: Array.from(s.apIndependent, (v) => round(v, 5)),
    spikes: s.spikes,
    clusters: s.clusters,
    independentEvents: s.independentEvents,
    params: {
      tauRise: s.params.tauRise,
      tauDecay: s.params.tauDecay,
      apAmp: s.params.apAmp,
      independentTauDecay: s.params.independentTauDecay,
      sigma: s.params.sigma,
      rateHz: s.params.rateHz,
    },
  }),
);

const nAps = s.spikes.length;
const sizes = s.clusters.reduce((m, c) => ((m[c.nAps] = (m[c.nAps] || 0) + 1), m), {});
console.log(
  `${out}  (${s.calcium.length} samples @ ${s.params.rateHz} Hz, ` +
    `${nAps} APs in ${s.clusters.length} clusters ${JSON.stringify(sizes)}, ` +
    `${s.independentEvents.length} AP-independent events)`,
);
