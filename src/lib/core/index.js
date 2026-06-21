// Tab 1 non-visual core — the reusable spine shared across all tabs.
export { makeGrid, gridFromTimeColumn } from './timebase.js';
export { rasterize } from './rasterize.js';
export { KERNEL_LIBRARY, defaultParams, buildKernel } from './kernels.js';
export { convolveLinear, convolveOnGrid } from './convolve.js';
