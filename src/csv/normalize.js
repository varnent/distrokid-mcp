import { decimal, ZERO } from '../domain/decimal.js';
export function currencyCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid ISO-style currency code');
  return code;
}
export function normalizeRecord(record, columns, { currency, filename = null, rowNumber = null } = {}) {
  const fallback = currency ? currencyCode(currency) : null;
  const code = columns.currency ? currencyCode(record[columns.currency]) : fallback;
  if (!code) throw new Error('Currency is required: supply a currency column or currency argument');
  if (fallback && code !== fallback) throw new Error('Currency column conflicts with requested currency');
  const artist = String(record[columns.artist] ?? '').trim();
  const title = String(record[columns.title] ?? '').trim();
  const store = String(record[columns.store] ?? '').trim();
  const date = String(record[columns.date] ?? '').trim();
  return {
    artist, title, store, date, currency: code,
    earnings: decimal(record[columns.earnings]),
    quantity: columns.quantity ? decimal(record[columns.quantity], { allowEmpty: true }) : ZERO,
    // Canonical fields are additive; legacy properties above remain unchanged.
    sourceFile: filename, sourceRow: rowNumber, schemaProfile: 'generic-royalty-csv',
    isrc: null, territory: null, saleDate: null, reportPeriod: null,
    dateBasis: 'unknown', quantityUnit: 'unknown', sourceRecordId: null
  };
}
