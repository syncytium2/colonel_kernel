// Batch-dump every golden slice for the full-dataset PDF, ordered by treatment
// (baseline → senktide → TTX → sb222200 → other), tagged with group_id + treat from
// indiegroups_db4.xlsx. Writes darkroom/pdf/<NN>_<id>.json + darkroom/pdf/manifest.json.
//   node darkroom/batch_dump.mjs
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { buildSlice, GOLDEN_DIR } from './slice_lib.mjs';

const DB = '/Users/tonydefazio/Library/CloudStorage/Dropbox-UniversityofMichigan/Richard DeFazio/data/indiegroups_db4.xlsx';
const OUTDIR = 'darkroom/pdf';
mkdirSync(OUTDIR, { recursive: true });

const dbwb = XLSX.read(readFileSync(DB), { type: 'buffer' });
// db: experiment_id → { group_id, treat, exclude }
const rows = XLSX.utils.sheet_to_json(dbwb.Sheets['indiegroups'], { defval: null });
const meta = {};
for (const r of rows) meta[String(r.experiment_id)] = { group: r.group_id, treat: r.treat, exclude: r.exclude === 1 };

// CORRECTED region timing straight from db4 exp_timing (minutes → seconds). Both
// timing sheets merged, the main 'exp_timing' winning. Overrides the (possibly stale)
// golden metadata sheet so the summary reflects db4 exactly (e.g. the TTX fixes).
const et = {};
for (const sh of ['exp_timing (2)', 'exp_timing']) {
  const ws = dbwb.Sheets[sh]; if (!ws) continue;
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: null })) et[String(r.experiment_id)] = r;
}
function dbRegions(id) {
  const r = et[id]; if (!r) return null;
  const out = [{ name: 'baseline', startS: r.baseline_start * 60, endS: r.baseline_end * 60 }];
  for (const i of [1, 2, 3, 4]) {
    const n = r[`treat${i}_name`];
    if (n != null && n !== '') out.push({ name: String(n), startS: r[`treat${i}_start`] * 60, endS: r[`treat${i}_end`] * 60 });
  }
  return out;
}

const ORDER = ['baseline', 'senktide', 'TTX', 'sb222200', 'other'];
const catOf = (id) => { const t = meta[id]?.treat; return ORDER.includes(t) ? t : 'other'; };
const catRank = (id) => { const i = ORDER.indexOf(catOf(id)); return i < 0 ? ORDER.length : i; };

const ids = readdirSync(GOLDEN_DIR).filter((f) => /^APs_xlsx_v1_.*\.xlsx$/.test(f)).map((f) => f.replace('APs_xlsx_v1_', '').replace('.xlsx', ''));
ids.sort((a, b) => (catRank(a) - catRank(b)) || a.localeCompare(b)); // treatment, then slice id

console.log(`${ids.length} slices, ordered by treatment:`);
const manifest = [];
let n = 0;
for (const id of ids) {
  const file = `APs_xlsx_v1_${id}.xlsx`;
  const m = meta[id] || {};
  process.stderr.write(`[${String(++n).padStart(2)}/${ids.length}] ${id} (${catOf(id)}, ${m.group ?? '?'})… `);
  let slice;
  try { slice = buildSlice(file, { regions: dbRegions(id) ?? undefined }); }
  catch (e) { process.stderr.write(`SKIP: ${e.message}\n`); continue; }
  slice.group = m.group ?? '?';
  slice.treat = m.treat ?? catOf(id);
  slice.category = catOf(id);
  slice.excluded = !!m.exclude;
  const jf = `${OUTDIR}/${String(n).padStart(2, '0')}_${id}.json`;
  writeFileSync(jf, JSON.stringify(slice));
  manifest.push({ id, json: jf, group: slice.group, treat: slice.treat, category: slice.category });
  process.stderr.write(`ok\n`);
}
writeFileSync(`${OUTDIR}/manifest.json`, JSON.stringify(manifest, null, 0));

// category summary
const bycat = {};
for (const m of manifest) (bycat[m.category] ??= []).push(m.id);
console.log('\nmanifest written:', `${OUTDIR}/manifest.json`, `(${manifest.length} pages)`);
for (const c of ORDER) if (bycat[c]) console.log(`  ${c.padEnd(10)} ${bycat[c].length}`);
