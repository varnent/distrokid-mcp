import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decimal, add, compare, format, ZERO } from '../src/domain/decimal.js';
import { detectSchema as legacyDetect, loadReport, summarize } from '../src/report.js';
import { detectSchema } from '../src/csv/detect.js';
import { normalizeRecord, currencyCode } from '../src/csv/normalize.js';

async function withCsv(contents, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dk-mcp-regression-'));
  try {
    await writeFile(path.join(dir, 'report.csv'), contents, 'utf8');
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('v0.2 detectSchema export retains schema shape and alias mappings', () => {
  const headers = ['Artist Name', 'Track Title', 'Streaming Service', 'Net Earnings', 'Streams', 'Sale Date', 'Payment Currency'];
  assert.deepEqual(legacyDetect(headers), detectSchema(headers));
  assert.deepEqual(legacyDetect(headers).columns, {
    artist: 'Artist Name', title: 'Track Title', store: 'Streaming Service',
    earnings: 'Net Earnings', quantity: 'Streams', date: 'Sale Date', currency: 'Payment Currency'
  });
});

test('v0.2 summary contract retains grouping, sorting, filtering, limits, and decimal strings', async () => {
  const csv = 'Artist,Track,Store,Date,Earnings,Streams,Currency\n' +
    'Alpha,Song A,Spotify,2026-01,0.100001,1,USD\n' +
    'Beta,Song B,Apple Music,2026-02,1.5,2,USD\n' +
    'Alpha,Song C,Spotify,2026-01,-0.000001,3,USD\n';
  await withCsv(csv, async dir => {
    const { rows, metadata } = await loadReport(dir, 'report.csv');
    assert.equal(metadata.rows, 3);
    assert.equal(metadata.currency, 'USD');
    assert.equal(metadata.schema.format, 'generic-royalty-csv');
    const result = summarize(rows);
    assert.deepEqual(result, {
      currency: 'USD', rowsMatched: 3, totalEarnings: '1.6', totalQuantity: '6',
      groups: [
        { name: 'Beta', earnings: '1.5', quantity: '2', rows: 1 },
        { name: 'Alpha', earnings: '0.1', quantity: '4', rows: 2 }
      ]
    });
    assert.equal(summarize(rows, { groupBy: 'store', limit: 1 }).groups[0].name, 'Apple Music');
    assert.equal(summarize(rows, { groupBy: 'date', artist: 'alpha' }).totalEarnings, '0.1');
    assert.throws(() => summarize(rows, { groupBy: 'currency' }), /Unsupported grouping/);
    for (const limit of [0, 101, 1.5]) assert.throws(() => summarize(rows, { limit }), /Invalid limit/);
  });
});

test('exact decimals handle maximum precision, cancellation, negative zero, and comparisons', () => {
  assert.equal(format(decimal('0.123456789012')), '0.123456789012');
  assert.equal(format(add(decimal('999999999999.999999999999'), decimal('-999999999999.999999999999'))), '0');
  assert.equal(format(decimal('-0.000000')), '0');
  assert.equal(format(add(decimal('0.000000000001'), decimal('0.000000000002'))), '0.000000000003');
  assert.equal(compare(decimal('2'), decimal('1.999999999999')), 1);
  assert.equal(compare(decimal('-1.01'), decimal('-1.001')), -1);
  assert.equal(compare(ZERO, decimal('0.000')), 0);
  for (const value of ['1e2', 'NaN', 'Infinity', '1,00', '1.2.3', '0.1234567890123', '1234567890123456789012345']) {
    assert.throws(() => decimal(value), /Invalid numeric|precision/);
  }
});

test('CSV BOM, CRLF, quoted comma, escaped quotes and blank optional quantity', async () => {
  const csv = '\uFEFFArtist,Track,Earnings,Currency,Streams\r\n' +
    '"Alpha, Beta","A ""Quoted"" Song",0.000001,usd,\r\n' +
    'Gamma,Other,-0.000001,USD,3\r\n';
  await withCsv(csv, async dir => {
    const { rows } = await loadReport(dir, 'report.csv');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].artist, 'Alpha, Beta');
    assert.equal(rows[0].title, 'A "Quoted" Song');
    assert.equal(rows[0].currency, 'USD');
    assert.equal(format(rows[0].quantity), '0');
    assert.equal(summarize(rows).totalEarnings, '0');
    assert.equal(summarize(rows).totalQuantity, '3');
  });
});

test('rejects malformed CSV with inconsistent column count', async () => {
  for (const csv of [
    'Artist,Earnings,Currency\nAlpha,1,USD,extra\n',
    'Artist,Earnings,Currency\nAlpha,1\n',
    'Artist,Earnings,Currency\n"unterminated,1,USD\n'
  ]) {
    await withCsv(csv, async dir => {
      await assert.rejects(loadReport(dir, 'report.csv'));
    });
  }
});

test('normalizer preserves source provenance and does not invent date semantics', () => {
  const columns = detectSchema(['Artist', 'Earnings', 'Currency', 'Month']).columns;
  const row = normalizeRecord({ Artist: ' A ', Earnings: '-0.01', Currency: 'usd', Month: '2026-02' }, columns, {
    filename: 'royalties.csv', rowNumber: 12
  });
  assert.equal(row.sourceFile, 'royalties.csv');
  assert.equal(row.sourceRow, 12);
  assert.equal(row.schemaProfile, 'generic-royalty-csv');
  assert.equal(row.date, '2026-02');
  assert.equal(row.dateBasis, 'unknown');
  assert.equal(row.reportPeriod, null);
  assert.equal(row.saleDate, null);
  assert.equal(format(row.earnings), '-0.01');
  assert.equal(row.quantityUnit, 'unknown');
  assert.equal(row.sourceRecordId, null);
});

test('currency normalization and conflicting fallback are validated', () => {
  assert.equal(currencyCode(' usd '), 'USD');
  for (const value of ['', 'US', 'US D', 'USDD', '1SD']) assert.throws(() => currencyCode(value), /Invalid ISO-style/);
  const columns = detectSchema(['Earnings', 'Currency']).columns;
  assert.throws(() => normalizeRecord({ Earnings: '1', Currency: 'EUR' }, columns, { currency: 'USD' }), /conflicts/);
  assert.equal(normalizeRecord({ Earnings: '1', Currency: 'USD' }, columns, { currency: 'usd' }).currency, 'USD');
});

test('legacy filename validation rejects traversal and non-CSV filenames', async () => {
  await withCsv('Earnings,Currency\n1,USD\n', async dir => {
    for (const filename of ['../report.csv', '/tmp/report.csv', '.hidden.csv', 'report.txt', 'nested/report.csv']) {
      await assert.rejects(loadReport(dir, filename), /Invalid CSV filename/);
    }
  });
});
