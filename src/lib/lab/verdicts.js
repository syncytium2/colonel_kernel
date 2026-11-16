// LAB-ONLY (ADR-0053). The review log: one line per verdict a person gave on a kernel.
//
// The log is `kernel_review.tsv` in the folder the lab recordings are read from. It is only
// ever appended to; the verdict in force for a kernel is the LAST line with its key. A
// verdict is about one ROI of one recording over one window, given while looking at one
// revision of the spike file. If the spike file has since changed, the verdict is shown as
// stale: the kernel it was given on is not the kernel now on screen.
//
// Pure functions, shared by the page and the dev server, so the line the server writes and
// the line the page reads back are made and parsed by the same code.

export const VERDICT_FILE = 'kernel_review.tsv';
export const VERDICTS = ['accept', 'reject', 'unsure'];
export const VERDICT_COLUMNS = [
  'time_utc', 'slice_id', 'roi', 'window', 'start_s', 'end_s',
  'spike_cell', 'spike_revision', 'spike_sha256', 'verdict', 'note',
];
export const VERDICT_HEADER = VERDICT_COLUMNS.join('\t');

const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

/**
 * Build one log line from a verdict. Throws on anything the log must not hold.
 * @param {object} v fields named as VERDICT_COLUMNS (time_utc is supplied by the writer)
 * @returns {string} one line, no newline
 */
export function verdictLine(v) {
  if (!VERDICTS.includes(v.verdict)) throw new Error(`verdict must be one of ${VERDICTS.join(', ')}`);
  for (const k of ['slice_id', 'roi', 'window', 'time_utc']) {
    if (!clean(v[k])) throw new Error(`${k} is missing`);
  }
  for (const k of ['start_s', 'end_s']) {
    if (!Number.isFinite(Number(v[k]))) throw new Error(`${k} must be a number`);
  }
  const cells = VERDICT_COLUMNS.map((k) => clean(v[k]));
  if (cells.some((c) => c.length > 2000)) throw new Error('a field is longer than 2000 characters');
  return cells.join('\t');
}

/** Parse the log text into rows, oldest first. A missing or empty log is no rows. */
export function parseVerdicts(text) {
  const lines = String(text ?? '').split('\n').filter((l) => l.length);
  if (!lines.length) return [];
  if (lines[0] !== VERDICT_HEADER) throw new Error(`${VERDICT_FILE}: the header line is not the one this page writes`);
  return lines.slice(1).map((l, i) => {
    const cells = l.split('\t');
    if (cells.length !== VERDICT_COLUMNS.length) {
      throw new Error(`${VERDICT_FILE}: line ${i + 2} has ${cells.length} fields, expected ${VERDICT_COLUMNS.length}`);
    }
    return Object.fromEntries(VERDICT_COLUMNS.map((k, j) => [k, cells[j]]));
  });
}

/** What a verdict is about. */
export const verdictKey = (v) => `${v.slice_id}\t${v.roi}\t${v.window}`;

/** The verdict in force for a key: the last line that carries it, or null. */
export function currentVerdict(rows, key) {
  for (let i = rows.length - 1; i >= 0; i--) if (verdictKey(rows[i]) === key) return rows[i];
  return null;
}

/**
 * Whether a verdict was given on a different spike file than the one now loaded.
 * Compared by the hash of the spike times when both sides have one, else by cell and revision.
 */
export function isStale(row, spikeSource) {
  const s = spikeSource ?? {};
  const have = clean(s.sha256);
  if (row.spike_sha256 && have) return row.spike_sha256 !== have;
  return row.spike_cell !== clean(s.cell) || row.spike_revision !== clean(s.revision);
}
