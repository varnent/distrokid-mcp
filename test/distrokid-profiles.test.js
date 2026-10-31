import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectSchema } from '../src/report.js';
import { loadReport, summarize, summarizePeriods } from '../src/report.js';

async function withCsv(csv, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dk-bank-'));
  try {
    await writeFile(path.join(dir, 'bank.csv'), csv);
    return await callback(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const headers = ['Date Inserted','Reporting Date','Sale Month','Store','Artist','Title','ISRC','UPC','Quantity','Team Percentage','Source Type','Country of Sale','Songwriter Royalties Withheld (USD)','Earnings (USD)','Recoup (USD)'];
test('recognizes documented DistroKid Bank header fingerprint and USD without currency column', async () => {
  const csv = headers.join(',') + '\n' +
    '2026-01-20,2026-01-19,2025-11,Spotify,"Artist, Guest",Track,USAAA1234567,123456789012,3,100,Song,US,0,0.000000000001,\n' +
    '2026-01-20,2026-01-19,2025-11,Apple Music,Artist,Other,,123456789012,-1,50,Album,GB,0,-0.000000000001,\n';
  await withCsv(csv, async dir => {
    const { rows, metadata } = await loadReport(dir, 'bank.csv');
    assert.equal(metadata.schema.format, 'distrokid-bank-usd');
    assert.equal(metadata.currency, 'USD');
    assert.equal(rows[0].schemaProfile, 'distrokid-bank-usd');
    assert.equal(rows[0].artist, 'Artist, Guest');
    assert.equal(rows[0].isrc, 'USAAA1234567');
    assert.equal(rows[0].upc, '123456789012');
    assert.equal(rows[0].territory, 'US');
    assert.equal(rows[0].reportingDate, '2026-01-19');
    assert.equal(rows[0].dateInserted, '2026-01-20');
    assert.equal(rows[0].songwriterRoyaltiesWithheldUsd, '0');
    assert.equal(rows[0].recoupUsd, null);
    assert.equal(rows[0].sourceType, 'Song');
    assert.equal(rows[0].teamPercentage, '100');
    assert.equal(rows[0].date, '2025-11');
    assert.equal(rows[0].saleDate, null);
    assert.equal(rows[0].dateBasis, 'unknown');
    assert.equal(rows[1].isrc, null);
    assert.equal(rows[1].songwriterRoyaltiesWithheldUsd, '0');
    assert.equal(summarize(rows).totalEarnings, '0');
    assert.equal(summarize(rows).totalQuantity, '2');
    await assert.rejects(loadReport(dir, 'bank.csv', { currency: 'EUR' }), /conflicts/);
  });
});
test('recognizes historical DistroKid sale-month and Song/Album column naming', async () => {
  const csv = 'Reporting Month,Sale Month,Store,Artist,Title,Quantity,Song/Album,Country of Sale,Earnings (USD)\n' +
    'Mar 2024,Jan 2024,Tidal,Example,Song A,"9,608",Song,MY,0.102135011213\n';
  await withCsv(csv, async dir => {
    const { rows, metadata } = await loadReport(dir, 'bank.csv');
    assert.equal(metadata.schema.format, 'distrokid-bank-usd');
    assert.equal(rows[0].reportingDate, 'Mar 2024');
    assert.equal(rows[0].sourceType, 'Song');
    assert.equal(rows[0].territory, 'MY');
    assert.equal(summarize(rows).totalQuantity, '9608');
    assert.equal(summarize(rows).totalEarnings, '0.102135011213');
  });
});
test('generic CSV retains fallback and does not infer USD from dollar signs', async () => {
  await withCsv('Artist,Earnings\nExample,$1.25\n', async dir => {
    await assert.rejects(loadReport(dir, 'bank.csv'), /Currency is required/);
    const { rows, metadata } = await loadReport(dir, 'bank.csv', { currency: 'USD' });
    assert.equal(metadata.schema.format, 'generic-royalty-csv');
    assert.equal(summarize(rows).totalEarnings, '1.25');
  });
});
test('DistroKid profile fingerprint requires distinctive headers', () => {
  assert.equal(detectSchema(['Earnings','Artist','Store','Sale Month']).format, 'generic-royalty-csv');
  assert.throws(() => detectSchema([...headers,'earnings (usd)']), /Duplicate CSV headers/);
  assert.throws(() => detectSchema([...headers,'Earnings (USD)']), /Duplicate CSV headers/);
  assert.throws(() => detectSchema([...headers,'Earnings']), /Ambiguous CSV earnings/);
});

test('USD-labeled DistroKid earnings reject conflicting explicit currency columns', async () => {
  const prefix = 'Sale Month,Store,Artist,Title,Quantity,Earnings (USD),Currency\n';
  await withCsv(prefix + '2026-01,Spotify,A,Song,1,1.25,EUR\n', async dir => {
    await assert.rejects(loadReport(dir, 'bank.csv'), /conflicts/);
  });
  await withCsv(prefix + '2026-01,Spotify,A,Song,1,1.25,USD\n', async dir => {
    const { rows } = await loadReport(dir, 'bank.csv');
    assert.equal(summarize(rows).currency, 'USD');
  });
});

test('historical Bank layout tolerates reordered headers, BOM, CRLF and empty optional metadata', async () => {
  const csv = '\uFEFF' + 'Earnings (USD),Country of Sale,Song/Album,Quantity,Title,Artist,Store,Sale Month,Reporting Month\r\n' +
    '"-0.000001",,Song,"1,200","A ""quoted"" title",Example,Spotify,Feb 2024,Apr 2024\r\n';
  await withCsv(csv, async dir => {
    const { rows, metadata } = await loadReport(dir, 'bank.csv');
    assert.equal(metadata.schema.format, 'distrokid-bank-usd');
    assert.equal(rows[0].title, 'A "quoted" title');
    assert.equal(rows[0].territory, null);
    assert.equal(rows[0].date, 'Feb 2024');
    assert.equal(rows[0].reportingDate, 'Apr 2024');
    assert.equal(summarize(rows).totalEarnings, '-0.000001');
    assert.equal(summarize(rows).totalQuantity, '1200');
  });
});

test('synthetic fixture mirrors verified 15-column Bank export structure and blank Recoup', async () => {
  const synthetic = headers.join(',') + '\n' +
    '2026-06-02,2026-06-01,2026-04,Example Store,Fictional Artist,Fictional Track,USZZZ2600001,999999999999,12,100,Song,US,0.000000000000,0.001234567890,\n';
  await withCsv(synthetic, async dir => {
    const { rows, metadata } = await loadReport(dir, 'bank.csv');
    assert.equal(metadata.columns.length, 15);
    assert.equal(metadata.schema.format, 'distrokid-bank-usd');
    assert.equal(rows[0].dateInserted, '2026-06-02');
    assert.equal(rows[0].reportingDate, '2026-06-01');
    assert.equal(rows[0].date, '2026-04');
    assert.equal(rows[0].recoupUsd, null);
    assert.equal(rows[0].songwriterRoyaltiesWithheldUsd, '0.000000000000');
    assert.equal(summarize(rows).totalEarnings, '0.00123456789');
  });
});

test('Bank rows group by sale month instead of reporting date', async () => {
  const csv = headers.join(',') + '\n' +
    '2026-06-02,2026-06-01,2026-04,Spotify,Example,Track A,ISRC1,UPC1,2,100,Song,US,0,0.000000000001,\n' +
    '2026-07-02,2026-07-01,2026-05,Spotify,Example,Track B,ISRC2,UPC2,3,100,Song,US,0,0.000000000002,\n';
  await withCsv(csv, async dir => {
    const { rows } = await loadReport(dir, 'bank.csv');
    const result = summarizePeriods(rows, { dateBasis: 'sale-month' });
    assert.deepEqual(result.groups.map(g => g.period), ['2026-04','2026-05']);
    assert.equal(result.totalEarnings, '0.000000000003');
    assert.equal(result.totalQuantity, '5');
  });
});

test('large fabricated Bank batch preserves aggregate arithmetic and all rows', async () => {
  const entries = Array.from({ length: 446 }, (_, i) =>
    ['2026-06-02','2026-06-01',i % 2 ? '2026-04' : '2026-05',
      'Example Store','Fictional Artist','Fictional Track','ISRC','UPC',
      '1','100','Song','US','0','0.000000000001',''].join(','));
  await withCsv(headers.join(',') + '\n' + entries.join('\n') + '\n', async dir => {
    const { rows, metadata } = await loadReport(dir, 'bank.csv');
    assert.equal(metadata.rows, 446);
    assert.equal(summarize(rows).totalQuantity, '446');
    assert.equal(summarize(rows).totalEarnings, '0.000000000446');
    const periods = summarizePeriods(rows, { dateBasis: 'sale-month' });
    assert.equal(periods.groups.length, 2);
    assert.equal(periods.totalEarnings, '0.000000000446');
  });
});


test('Bank quantity rejects fractional counts but preserves signed adjustments', async () => {
  const prefix = 'Sale Month,Store,Artist,Title,Quantity,Earnings (USD)\n';
  await withCsv(prefix + '2026-01,Spotify,Example,Track,1.5,0.10\n', async dir => {
    await assert.rejects(loadReport(dir, 'bank.csv'), /Quantity must be an integer/);
  });
  await withCsv(prefix + '2026-01,Spotify,Example,Track,-2,0.10\n', async dir => {
    const { rows } = await loadReport(dir, 'bank.csv');
    assert.equal(summarize(rows).totalQuantity, '-2');
  });
  await withCsv(prefix + '2026-01,Spotify,Example,Track,2.0,0.10\n', async dir => {
    const { rows } = await loadReport(dir, 'bank.csv');
    assert.equal(summarize(rows).totalQuantity, '2');
  });
});
