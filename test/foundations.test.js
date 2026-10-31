import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, add, compare, format } from '../src/domain/decimal.js';
import { detectSchema } from '../src/csv/detect.js';
import { normalizeRecord } from '../src/csv/normalize.js';

test('exact decimal arithmetic and negative adjustments', () => {
  assert.equal(format(add(add(decimal('0.1'), decimal('0.2')), decimal('-0.000001'))), '0.299999');
  assert.equal(compare(decimal('1.20'), decimal('1.2')), 0);
  assert.equal(compare(decimal('-0.1'), decimal('0')), -1);
  assert.equal(format(decimal('-$1,234.500')), '-1234.5');
});
test('generic profile rejects duplicate, ambiguous and missing earnings headers', () => {
  assert.equal(detectSchema(['Artist Name', 'Net Earnings', 'Currency Code']).format, 'generic-royalty-csv');
  assert.throws(() => detectSchema(['Earnings', 'earnings']), /Duplicate/);
  assert.throws(() => detectSchema(['Earnings', 'Amount']), /Ambiguous/);
  assert.throws(() => detectSchema(['Artist']), /Missing earnings/);
});
test('canonical normalization preserves legacy fields without guessing date semantics', () => {
  const columns = detectSchema(['Artist', 'Track', 'Store', 'Earnings', 'Streams']).columns;
  const row = normalizeRecord({Artist:' A ',Track:' Song ',Store:' Spotify ',Earnings:'0.000001',Streams:'2'}, columns, {currency:'USD', filename:'report.csv',rowNumber:2});
  assert.equal(row.artist, 'A');
  assert.equal(row.title, 'Song');
  assert.equal(row.currency, 'USD');
  assert.equal(format(row.earnings), '0.000001');
  assert.equal(row.sourceRow, 2);
  assert.equal(row.dateBasis, 'unknown');
  assert.equal(row.saleDate, null);
  assert.equal(row.quantityUnit, 'unknown');
});
test('currency mismatch and invalid amounts are rejected', () => {
  const columns = detectSchema(['Earnings', 'Currency']).columns;
  assert.throws(() => normalizeRecord({Earnings:'1',Currency:'EUR'}, columns, {currency:'USD'}), /conflicts/);
  assert.throws(() => normalizeRecord({Earnings:'NaN',Currency:'USD'}, columns), /Invalid numeric/);
});
