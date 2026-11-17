// LAB-ONLY (ADR-0053). One hue per extraction (Okabe-Ito), fixed, so a variant keeps its
// colour on every panel of both lab pages. uPlot draws to a canvas, so the series colours
// cannot come from CSS alone: the dark set is the same hues, lifted to read against the dark
// surface. Pages key their plots on the scheme so a switch redraws them.
export const VARIANT_COLORS_LIGHT = Object.freeze({
  frozen: '#0072B2',
  dff: '#D55E00',
  'frozen-pensub': '#56B4E9',
  'dff-pensub': '#E69F00',
  'dff-prct': '#CC79A7',
  'file-dff': '#009E73',
});
export const VARIANT_COLORS_DARK = Object.freeze({
  frozen: '#3D8FD6',
  dff: '#F0843C',
  'frozen-pensub': '#9BDCFF',
  'dff-pensub': '#F2B63A',
  'dff-prct': '#E39BC4',
  'file-dff': '#2CC59A',
});

export const METHODS = Object.freeze([
  { id: 'fv', label: 'free-vector (method 1)' },
  { id: 'shaped', label: 'shaped, with drift term (method 3)' },
  { id: 'pm', label: 'parametric (method 2)' },
]);

/** The kernel a variant result carries for one recovery method. */
export const kernelFor = (v, method) => (method === 'fv' ? v.fv.kernel : method === 'pm' ? v.pm.kernel : v.shaped.kernel);
