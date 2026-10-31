import { decimal, ZERO } from '../domain/decimal.js';
export function currencyCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Invalid ISO-style currency code');
  return code;
}
export function normalizeRecord(record, columns, { currency, filename = null, rowNumber = null, schema = null } = {}) {
  const fallback = currency ? currencyCode(currency) : null;
  const implied = schema?.impliedCurrency ?? null;
  const code = columns.currency ? currencyCode(record[columns.currency]) : (implied ?? fallback);
  if (!code) throw new Error('Currency is required: supply a currency column or currency argument');
  if (implied && code !== implied) throw new Error('Currency column conflicts with DistroKid earnings currency');
  if (fallback && code !== fallback) throw new Error('Currency column conflicts with requested currency');
  const artist = String(record[columns.artist] ?? '').trim();
  const title = String(record[columns.title] ?? '').trim();
  const store = String(record[columns.store] ?? '').trim();
  const date = String(record[columns.date] ?? '').trim();
  const quantity = columns.quantity ? decimal(record[columns.quantity], { allowEmpty: true }) : ZERO;
  // Bank quantity is a signed count: negative adjustments are valid, fractional counts are not.
  if (schema?.format === 'distrokid-bank-usd' && quantity.units % (10n ** BigInt(quantity.scale)) !== 0n) {
    throw new Error('DistroKid Bank Quantity must be an integer');
  }
  return {
    artist, title, store, date, currency: code,
    earnings: decimal(record[columns.earnings]),
    quantity,
    // Canonical fields are additive; legacy properties above remain unchanged.
    sourceFile: filename, sourceRow: rowNumber, schemaProfile: schema?.format ?? 'generic-royalty-csv',
    isrc: columns.isrc ? String(record[columns.isrc] ?? '').trim() || null : null,
    upc: columns.upc ? String(record[columns.upc] ?? '').trim() || null : null,
    territory: columns.territory ? String(record[columns.territory] ?? '').trim() || null : null,
    reportingDate: columns.reportingDate ? String(record[columns.reportingDate] ?? '').trim() || null : null,
    dateInserted: columns.dateInserted ? String(record[columns.dateInserted] ?? '').trim() || null : null,
    songwriterRoyaltiesWithheldUsd: columns.songwriterRoyaltiesWithheldUsd ? String(record[columns.songwriterRoyaltiesWithheldUsd] ?? '').trim() || null : null,
    recoupUsd: columns.recoupUsd ? String(record[columns.recoupUsd] ?? '').trim() || null : null,
    sourceType: columns.sourceType ? String(record[columns.sourceType] ?? '').trim() || null : null,
    teamPercentage: columns.teamPercentage ? String(record[columns.teamPercentage] ?? '').trim() || null : null,
    saleDate: null, reportPeriod: null,
    dateBasis: 'unknown', quantityUnit: 'unknown', sourceRecordId: null
  };
}
