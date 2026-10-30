import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadReport, summarize, detectSchema } from '../src/report.js';

async function withCsv(csv, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dk-mcp-'));
  try { await writeFile(path.join(dir, 'report.csv'), csv); return await callback(dir); }
  finally { await rm(dir, { recursive:true, force:true }); }
}
test('detects supported aliases and rejects ambiguous columns', () => {
  assert.equal(detectSchema(['Artist Name','Net Earnings','Currency Code']).columns.earnings, 'Net Earnings');
  assert.throws(() => detectSchema(['Earnings','Amount','Currency']), /Ambiguous/);
  assert.throws(() => detectSchema(['Artist','Streams']), /Missing earnings/);
  assert.throws(() => detectSchema(['Earnings','earnings','Currency']), /Duplicate/);
});
test('exact decimal arithmetic with fractional royalties', async () => {
  await withCsv('Artist,Earnings,Currency,Streams\nA,0.1,USD,1\nA,0.2,USD,2\nA,-0.000001,USD,0\n', async dir => {
    const { rows } = await loadReport(dir, 'report.csv');
    const result = summarize(rows);
    assert.equal(result.totalEarnings, '0.299999');
    assert.equal(result.totalQuantity, '3');
    assert.equal(result.currency, 'USD');
  });
});
test('quoted commas and artist filtering', async () => {
  await withCsv('Artist,Track,Store,Earnings,Streams\n"Example, Artist",Song A,Spotify,1.25,100\n"Example, Artist",Song B,Apple Music,2.50,200\n', async dir => {
    const { rows } = await loadReport(dir, 'report.csv', { currency:'USD' });
    const result = summarize(rows, { artist:'example, artist' });
    assert.equal(result.totalEarnings, '3.75');
    assert.equal(result.groups[0].rows, 2);
  });
});
test('rejects missing currency and mixed currencies', async () => {
  await withCsv('Artist,Earnings\nA,1\n', async dir => {
    await assert.rejects(loadReport(dir, 'report.csv'), /Currency is required/);
  });
  await withCsv('Artist,Earnings,Currency\nA,1,USD\nB,2,EUR\n', async dir => {
    await assert.rejects(loadReport(dir, 'report.csv'), /Mixed currencies/);
  });
  await withCsv('Artist,Earnings,Currency\nA,1,USD\n', async dir => {
    await assert.rejects(loadReport(dir, 'report.csv', { currency:'EUR' }), /conflicts/);
  });
});
test('rejects traversal and symlinks outside root', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'dk-mcp-'));
  const outside = await mkdtemp(path.join(os.tmpdir(),'dk-out-'));
  try {
    await writeFile(path.join(outside,'private.csv'),'Earnings,Currency\n99,USD\n');
    await symlink(path.join(outside,'private.csv'),path.join(dir,'linked.csv'));
    await assert.rejects(loadReport(dir,'../private.csv'), /Invalid CSV filename/);
    await assert.rejects(loadReport(dir,'linked.csv'), /directly inside/);
  } finally { await rm(dir,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});
test('rejects malformed and excessively precise numbers', async () => {
  await withCsv('Artist,Earnings,Currency\nA,not-a-number,USD\n', async dir => {
    await assert.rejects(loadReport(dir,'report.csv'), /Invalid numeric/);
  });
  await withCsv('Artist,Earnings,Currency\nA,0.1234567890123,USD\n', async dir => {
    await assert.rejects(loadReport(dir,'report.csv'), /precision/);
  });
});
test('rejects invalid currency codes', async () => {
  await withCsv('Artist,Earnings,Currency\nA,1,US D\n', async dir => {
    await assert.rejects(loadReport(dir,'report.csv'), /Invalid ISO-style currency/);
  });
});
