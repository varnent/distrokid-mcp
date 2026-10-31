import { add, ZERO, format } from '../domain/decimal.js';

// Only unambiguous ISO dates/months and English month-name/year formats are
// accepted. A date is never silently treated as a reporting period.
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTHS = Object.freeze(Object.fromEntries(MONTH_NAMES.flatMap((name, index) => [[name, index + 1], [name.slice(0, 3), index + 1]])));
const pad = n => String(n).padStart(2, '0');
export function parseRoyaltyPeriod(value) {
  const input = String(value ?? '').trim();
  let year, month;
  let match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(input);
  if (match) {
    year = Number(match[1]); month = Number(match[2]);
    if (match[3]) {
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error('Invalid royalty date');
    }
  } else {
    match = /^([A-Za-z]{3,9})[ .-]+(\d{4})$/.exec(input);
    if (!match) throw new Error('Unsupported royalty date format');
    month = MONTHS[match[1].toLowerCase()]; year = Number(match[2]);
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !month || month < 1 || month > 12) throw new Error('Invalid royalty date');
  return { year, month, key: year + '-' + pad(month) };
}

export function summarizePeriods(rows, { period = 'month', from, to, artist, dateBasis = 'source' } = {}) {
  if (!['month', 'quarter', 'year'].includes(period)) throw new Error('Unsupported period');
  if (!['source', 'sale-month'].includes(dateBasis)) throw new Error('Unsupported date basis');
  const lower = from === undefined ? null : parseRoyaltyPeriod(from).key;
  const upper = to === undefined ? null : parseRoyaltyPeriod(to).key;
  if (lower && upper && lower > upper) throw new Error('Invalid date range');
  const totals = new Map();
  let currency = null, count = 0, earnings = ZERO, quantity = ZERO;
  for (const row of rows) {
    if (artist && row.artist.toLowerCase() !== artist.toLowerCase()) continue;
    if (dateBasis === 'sale-month' && row.schemaProfile !== 'distrokid-bank-usd') {
      throw new Error('Sale-month basis requires verified DistroKid Bank schema');
    }
    // 'source' groups by the normalized row.date field. For verified Bank rows,
    // that field is already Sale Month. 'sale-month' adds provenance validation;
    // neither option groups by reportingDate or dateInserted.
    const parsed = parseRoyaltyPeriod(row.date);
    if ((lower && parsed.key < lower) || (upper && parsed.key > upper)) continue;
    if (currency && currency !== row.currency) throw new Error('Mixed currencies cannot be aggregated');
    currency = row.currency;
    const key = period === 'year' ? String(parsed.year) : period === 'quarter' ?
      parsed.year + '-Q' + Math.ceil(parsed.month / 3) : parsed.key;
    const group = totals.get(key) ?? { period: key, earnings: ZERO, quantity: ZERO, rows: 0 };
    group.earnings = add(group.earnings, row.earnings);
    group.quantity = add(group.quantity, row.quantity);
    group.rows++;
    totals.set(key, group);
    earnings = add(earnings, row.earnings);
    quantity = add(quantity, row.quantity);
    count++;
  }
  return { currency, period, dateBasis, rowsMatched: count,
    totalEarnings: format(earnings), totalQuantity: format(quantity),
    groups: [...totals.values()].sort((a,b) => a.period.localeCompare(b.period)).map(g =>
      ({ period: g.period, earnings: format(g.earnings), quantity: format(g.quantity), rows: g.rows })) };
}
