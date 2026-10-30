import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;
const HEADER_ALIASES = {
  artist: ['artist', 'artist name'],
  title: ['title', 'track', 'track title', 'song', 'song title'],
  store: ['store', 'service', 'platform', 'streaming service'],
  earnings: ['earnings', 'amount', 'net earnings', 'royalty', 'royalties', 'total earned'],
  quantity: ['quantity', 'streams', 'plays', 'units'],
  date: ['date', 'sale date', 'report date', 'month']
};
function normalize(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }
function column(headers, key) { return headers.find(h => HEADER_ALIASES[key].includes(normalize(h))); }
function decimal(value) {
  const v = String(value ?? '').trim();
  if (!v) return 0;
  const cleaned = v.replace(/[$,\s]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) throw new Error('Invalid numeric field in CSV');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error('Non-finite numeric field');
  return n;
}
export async function loadReport(root, filename) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]*\.csv$/i.test(filename) || filename === '..') throw new Error('Invalid CSV filename');
  const base = await realpath(root);
  const file = await realpath(path.join(base, filename));
  if (path.dirname(file) !== base) throw new Error('File must be directly inside data directory');
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > MAX_BYTES) throw new Error('CSV must be a regular file <= 5 MiB');
  const csv = await readFile(file, 'utf8');
  const records = parse(csv, { columns: true, bom: true, skip_empty_lines: true, relax_quotes: false, max_record_size: 100000, to: MAX_ROWS + 2 });
  if (records.length > MAX_ROWS) throw new Error('Too many CSV rows');
  if (!records.length) return { rows: [], metadata: { rows: 0, columns: [] } };
  const headers = Object.keys(records[0]);
  const earningCol = column(headers, 'earnings');
  if (!earningCol) throw new Error('Missing earnings column; see README for supported headers');
  const columns = Object.fromEntries(Object.keys(HEADER_ALIASES).map(k => [k, column(headers, k)]));
  const rows = records.map(record => ({
    artist: String(record[columns.artist] ?? '').trim(),
    title: String(record[columns.title] ?? '').trim(),
    store: String(record[columns.store] ?? '').trim(),
    date: String(record[columns.date] ?? '').trim(),
    earnings: decimal(record[columns.earnings]),
    quantity: columns.quantity ? decimal(record[columns.quantity]) : 0
  }));
  return { rows, metadata: { rows: rows.length, columns: headers } };
}
export function summarize(rows, { groupBy = 'artist', artist, limit = 20 } = {}) {
  if (!['artist', 'title', 'store', 'date'].includes(groupBy)) throw new Error('Unsupported grouping');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit');
  const filtered = artist ? rows.filter(r => r.artist.toLowerCase() === artist.toLowerCase()) : rows;
  const totals = new Map();
  for (const row of filtered) {
    const key = row[groupBy] || '(unknown)';
    const entry = totals.get(key) ?? { name: key, earnings: 0, quantity: 0, rows: 0 };
    entry.earnings += row.earnings;
    entry.quantity += row.quantity;
    entry.rows++;
    totals.set(key, entry);
  }
  const groups = [...totals.values()].sort((a,b) => b.earnings-a.earnings || a.name.localeCompare(b.name)).slice(0, limit);
  return { currency: 'unspecified (verify CSV export currency)', rowsMatched: filtered.length,
    totalEarnings: Number(filtered.reduce((sum,r)=>sum+r.earnings,0).toFixed(6)),
    totalQuantity: filtered.reduce((sum,r)=>sum+r.quantity,0),
    groups: groups.map(g=>({...g, earnings:Number(g.earnings.toFixed(6))})) };
}
