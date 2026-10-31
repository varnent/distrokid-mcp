import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal } from '../src/domain/decimal.js';
import { parseRoyaltyPeriod, summarizePeriods } from '../src/analytics/periods.js';
const row = (date, earnings, artist = 'A', currency = 'USD') =>
  ({ date, earnings: decimal(earnings), quantity: decimal('1'), artist, currency });

test('parses strict ISO dates and documented English month/year strings', () => {
  for (const input of ['2025-01', '2025-01-31', 'Jan 2025', 'January 2025']) {
    assert.equal(parseRoyaltyPeriod(input).key, '2025-01');
  }
  for (const input of ['2025-02-30', '2025-13', '01/02/2025', '', '2025-00', 'Feb 0000', 'Januaryxx 2025', 'Febr 2025']) {
    assert.throws(() => parseRoyaltyPeriod(input), /Invalid|Unsupported/);
  }
  assert.equal(parseRoyaltyPeriod('2024-02-29').key, '2024-02');
});

test('groups monthly, quarterly, annually with exact signed royalties', () => {
  const rows = [row('2025-01', '0.1'), row('Feb 2025', '0.2'), row('2025-04-01', '-0.000001'), row('2026-01', '1.5')];
  const month = summarizePeriods(rows);
  assert.equal(month.totalEarnings, '1.799999');
  assert.deepEqual(month.groups.map(g => g.period), ['2025-01','2025-02','2025-04','2026-01']);
  const quarter = summarizePeriods(rows, { period: 'quarter', from: '2025-01', to: '2025-12' });
  assert.deepEqual(quarter.groups.map(g => [g.period,g.earnings]), [['2025-Q1','0.3'],['2025-Q2','-0.000001']]);
  assert.equal(summarizePeriods(rows, { period: 'year', artist: 'a' }).groups[0].earnings, '0.299999');
});

test('rejects mixed currencies, ambiguous dates, invalid filters and basis', () => {
  assert.throws(() => summarizePeriods([row('2025-01','1'),row('2025-02','1','A','EUR')]), /Mixed currencies/);
  assert.throws(() => summarizePeriods([row('01/02/2025','1')]), /Unsupported/);
  assert.throws(() => summarizePeriods([], { from: '2025-12', to: '2025-01' }), /Invalid date range/);
  assert.throws(() => summarizePeriods([], { period: 'week' }), /Unsupported period/);
  assert.throws(() => summarizePeriods([], { dateBasis: 'payment' }), /Unsupported date basis/);
});

test('filters inclusive date ranges and artist without losing exact values', () => {
  const rows = [row('2025-01','0.000000000001'),row('2025-02','0.000000000002'),row('2025-02','5','B')];
  const result = summarizePeriods(rows, { from: 'Jan 2025', to: 'Feb 2025', artist: 'a' });
  assert.equal(result.totalEarnings, '0.000000000003');
  assert.equal(result.rowsMatched, 2);
  assert.equal(result.totalQuantity, '2');
});

test('sale-month basis requires DistroKid Bank provenance and ignores reporting date', () => {
  const rows = [
    { ...row('2025-01','0.25'), schemaProfile: 'distrokid-bank-usd', reportingDate: '2025-03-15' },
    { ...row('2025-02','0.75'), schemaProfile: 'distrokid-bank-usd', reportingDate: '2025-04-15' }
  ];
  const result = summarizePeriods(rows, { period: 'month', dateBasis: 'sale-month' });
  assert.deepEqual(result.groups.map(g => g.period), ['2025-01','2025-02']);
  assert.equal(result.totalEarnings, '1');
  assert.equal(result.dateBasis, 'sale-month');
  assert.throws(() => summarizePeriods([row('2025-01','1')], { dateBasis: 'sale-month' }), /requires verified DistroKid Bank schema/);
});


test('source and sale-month agree on Bank sale month, never reporting date', () => {
  const rows = [{ ...row('2025-01','1'), schemaProfile: 'distrokid-bank-usd', reportingDate: '2025-04-01' }];
  assert.deepEqual(summarizePeriods(rows, { dateBasis: 'source' }).groups.map(g => g.period), ['2025-01']);
  assert.deepEqual(summarizePeriods(rows, { dateBasis: 'sale-month' }).groups.map(g => g.period), ['2025-01']);
});
