import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50000;
const ALIASES = {
  artist: ['artist', 'artist name'],
  title: ['title', 'track', 'track title', 'song', 'song title'],
  store: ['store', 'service', 'platform', 'streaming service'],
  earnings: ['earnings', 'amount', 'net earnings', 'royalty', 'royalties', 'total earned'],
  quantity: ['quantity', 'streams', 'plays', 'units'],
  date: ['date', 'sale date', 'report date', 'month'],
  currency: ['currency', 'currency code', 'payment currency']
};
const norm = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
const MAX_DIGITS = 24;
function decimal(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { units: 0n, scale: 0 };
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) throw new Error('Invalid numeric field in CSV');
  const sign = cleaned.startsWith('-') ? -1n : 1n;
  const unsigned = cleaned.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  if ((whole + fraction).length > MAX_DIGITS || fraction.length > 12) throw new Error('Numeric precision exceeds supported limit');
  return { units: sign * BigInt(whole + fraction), scale: fraction.length };
}
function add(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { units: a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale), scale };
}
const ZERO = { units: 0n, scale: 0 };
function format({ units, scale }) {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fractional = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return (negative && units !== 0n ? '-' : '') + whole + (fractional ? '.' + fractional : '');
}
function columnsFor(headers) {
  const normalized = headers.map(norm);
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate CSV headers');
  const result = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const found = headers.filter(h => aliases.includes(norm(h)));
    if (found.length > 1) throw new Error('Ambiguous CSV columns for ' + key);
    result[key] = found[0];
  }
  if (!result.earnings) throw new Error('Missing earnings column; see README');
  return result;
}
export function detectSchema(headers) {
  const columns = columnsFor(headers);
  return { format: 'generic-royalty-csv', columns, recognized: Object.values(columns).filter(Boolean).length };
}
function currencyCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid ISO-style currency code');
  return code;
}
export async function loadReport(root, filename, { currency } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]*\.csv$/i.test(filename) || filename.length > 255) throw new Error('Invalid CSV filename');
  const base = await realpath(root);
  const file = await realpath(path.join(base, filename));
  if (path.dirname(file) !== base) throw new Error('File must be directly inside data directory');
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('CSV must be a regular file <= 5 MiB');
  const csv = await readFile(file, 'utf8');
  const records = parse(csv, { columns: true, bom: true, skip_empty_lines: true, relax_quotes: false, max_record_size: 100000, to: MAX_ROWS + 2 });
  if (records.length > MAX_ROWS) throw new Error('Too many CSV rows');
  if (!records.length) return { rows: [], metadata: { rows: 0, columns: [], currency: currency ? currencyCode(currency) : null } };
  const headers = Object.keys(records[0]);
  const schema = detectSchema(headers);
  const col = schema.columns;
  const fallback = currency ? currencyCode(currency) : null;
  const rows = records.map(record => {
    const code = col.currency ? currencyCode(record[col.currency]) : fallback;
    if (!code) throw new Error('Currency is required: supply a currency column or currency argument');
    if (fallback && code !== fallback) throw new Error('Currency column conflicts with requested currency');
    return {
      artist: String(record[col.artist] ?? '').trim(),
      title: String(record[col.title] ?? '').trim(),
      store: String(record[col.store] ?? '').trim(),
      date: String(record[col.date] ?? '').trim(),
      currency: code,
      earnings: decimal(record[col.earnings]),
      quantity: col.quantity ? decimal(record[col.quantity]) : ZERO
    };
  });
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
  const groups = [...totals.values()].sort((a,b) => {
    const scale = Math.max(a.earnings.scale, b.earnings.scale);
    const left = a.earnings.units * 10n ** BigInt(scale - a.earnings.scale);
    const right = b.earnings.units * 10n ** BigInt(scale - b.earnings.scale);
    return left === right ? a.name.localeCompare(b.name) : left > right ? -1 : 1;
  }).slice(0, limit);
  return {
    currency: currencies[0] ?? null, rowsMatched: filtered.length,
    totalEarnings: format(totalEarnings), totalQuantity: format(totalQuantity),
    groups: groups.map(g => ({ name:g.name, earnings:format(g.earnings), quantity:format(g.quantity), rows:g.rows }))
  };
}
