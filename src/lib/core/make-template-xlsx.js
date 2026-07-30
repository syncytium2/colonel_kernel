// .xlsx writer for the input template (ADR-0019 §5).
//
// CODE-SPLIT (FOUNDATIONS §6): this module statically imports SheetJS, so — exactly
// like load-xlsx.js — it is kept OUT of core/index.js and must be reached by dynamic
// import (`await import('./core/make-template-xlsx.js')`). A visitor who never asks
// for the template never downloads SheetJS.
//
// SheetJS is bundled from an npm dependency (ADR-0036), never a CDN. Writing happens
// entirely in-page and the bytes go straight to a local download — no egress.

import * as XLSX from 'xlsx';
import { templateSheets } from './make-template.js';

/**
 * Build the ADR-0019 template workbook.
 *
 * Sheet ORDER matters for humans, not for the reader: `instructions` is written first
 * so it is the sheet Excel opens on. `aoa_to_sheet` preserves JS numbers as numeric
 * cells, which is the ADR-0019 §5 fidelity invariant the template exists to enforce.
 *
 * @returns {ArrayBuffer} .xlsx bytes
 */
export function buildTemplateWorkbook() {
  const sheets = templateSheets();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.instructions), 'instructions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.trace), 'trace');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.spikes), 'spikes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.metadata), 'metadata');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
