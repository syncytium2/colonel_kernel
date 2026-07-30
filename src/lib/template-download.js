// Saving the input template to disk. Shared by Tab 0's "Bring your own recording"
// section and Tab 2's dropzone, so the two offer byte-identical files and there is one
// place to change how the download works.
//
// DOM-facing, so it lives here rather than in core/ (core stays pure and node-testable
// — core.test.mjs runs it without a browser). The generators themselves ARE in core and
// are tested there; this file only wraps them in a save.
//
// BOTH generators are reached by dynamic import. For the xlsx one that is load-bearing:
// it carries SheetJS, and the rule load-xlsx.js establishes is that SheetJS-bearing
// modules never land in the entry bundle. For the CSV one it is symmetry — one shape for
// both download paths — and it buys only the generator chunk itself (~3.5 kB), NOT the
// convolution core, which Tab 1 already imports statically in App.svelte. Tab 0 quotes
// the example's numbers from core/template-facts.js, which imports nothing.
//
// Everything is built in-page and handed to a same-origin blob: no request leaves the
// browser on the way out, just as none does on the way in (FOUNDATIONS §6).

export const TEMPLATE_XLSX_NAME = 'colonel-kernel-template.xlsx';
export const TEMPLATE_CSV_NAME = 'colonel-kernel-template.csv';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Hand a blob to the browser as a download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame, not synchronously — Safari abandons an in-flight download
  // if the object URL is revoked in the same task that started it.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Download the ADR-0019 three-sheet template workbook.
 * The SheetJS-bearing writer is imported dynamically so it stays in its own chunk
 * (FOUNDATIONS §6) — a visitor who never asks for the template never fetches it.
 */
export async function downloadTemplateXlsx() {
  const mod = await import('./core/make-template-xlsx.js');
  saveBlob(new Blob([mod.buildTemplateWorkbook()], { type: XLSX_MIME }), TEMPLATE_XLSX_NAME);
}

/** Download the ADR-0016 single-file CSV template. No SheetJS involved. */
export async function downloadTemplateCsv() {
  const mod = await import('./core/make-template.js');
  saveBlob(new Blob([mod.templateCsvText()], { type: 'text/csv' }), TEMPLATE_CSV_NAME);
}
