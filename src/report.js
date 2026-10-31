import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { add, ZERO, format, compare } from './domain/decimal.js';
import { detectSchema } from './csv/detect.js';
export { detectSchema } from './csv/detect.js';
export { parseRoyaltyPeriod, summarizePeriods } from './analytics/periods.js';
import { normalizeRecord, currencyCode } from './csv/normalize.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;
export async function loadReport(root, filename, { currency } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]*\.csv$/i.test(filename) || filename.length > 255) throw new Error('Invalid CSV filename');
  const base = await realpath(root);
  const file = await realpath(path.join(base, filename));
  if (path.dirname(file) !== base) throw new Error('File must be directly inside data directory');
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('CSV must be a regular file <= 5 MiB');
  const csv = await readFile(file, 'utf8');
  let headers = [];
  let schema;
  const records = parse(csv, { columns: rawHeaders => {
    headers = rawHeaders;
    schema = detectSchema(headers);
    return headers;
  }, bom: true, skip_empty_lines: true, relax_quotes: false, max_record_size: 100000, to: MAX_ROWS + 2 });
  if (records.length > MAX_ROWS) throw new Error('Too many CSV rows');
  if (!records.length) return { rows: [], metadata: { rows: 0, columns: [], currency: currency ? currencyCode(currency) : null } };
  const col = schema.columns;
  const fallback = currency ? currencyCode(currency) : null;
  const rows = records.map((record, index) => normalizeRecord(record, col, { currency: fallback, filename, rowNumber: index + 2 }));
  const currencies = [...new Set(rows.map(r => r.currency))];
  if (currencies.length !== 1) throw new Error('Mixed currencies cannot be aggregated');
  return { rows, metadata: { rows: rows.length, columns: headers, schema, currency: currencies[0] } };
}
export function summarize(rows, { groupBy = 'artist', artist, limit = 20 } = {}) {
  if (!['artist', 'title', 'store', 'date'].includes(groupBy)) throw new Error('Unsupported grouping');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit');
  const filtered = artist ? rows.filter(r => r.artist.toLowerCase() === artist.toLowerCase()) : rows;
  const currencies = [...new Set(filtered.map(r => r.currency))];
  if (currencies.length > 1) throw new Error('Mixed currencies cannot be aggregated');
  const totals = new Map();
  let totalEarnings = ZERO, totalQuantity = ZERO;
  for (const row of filtered) {
    const key = row[groupBy] || '(unknown)';
    const entry = totals.get(key) ?? { name: key, earnings: ZERO, quantity: ZERO, rows: 0 };
    entry.earnings = add(entry.earnings, row.earnings);
    entry.quantity = add(entry.quantity, row.quantity);
    entry.rows++;
    totals.set(key, entry);
    totalEarnings = add(totalEarnings, row.earnings);
    totalQuantity = add(totalQuantity, row.quantity);
  }
  const groups = [...totals.values()].sort((a,b) => compare(b.earnings, a.earnings) || a.name.localeCompare(b.name)).slice(0, limit);
  return {
    currency: currencies[0] ?? null, rowsMatched: filtered.length,
    totalEarnings: format(totalEarnings), totalQuantity: format(totalQuantity),
    groups: groups.map(g => ({ name:g.name, earnings:format(g.earnings), quantity:format(g.quantity), rows:g.rows }))
  };
}
