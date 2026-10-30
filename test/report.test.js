import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadReport, summarize } from '../src/report.js';

test('loads and summarizes CSV, including quoted commas', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'dk-mcp-'));
  try {
    await writeFile(path.join(dir,'report.csv'),'Artist,Track,Store,Earnings,Streams\n"Example, Artist",Song A,Spotify,1.25,100\n"Example, Artist",Song B,Apple Music,2.50,200\n');
    const {rows} = await loadReport(dir,'report.csv');
    const out = summarize(rows,{artist:'example, artist'});
    assert.equal(out.totalEarnings,3.75);
    assert.equal(out.totalQuantity,300);
    assert.equal(out.groups[0].rows,2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('blocks traversal and symlinks outside root', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'dk-mcp-'));
  const outside = await mkdtemp(path.join(os.tmpdir(),'dk-out-'));
  try {
    await writeFile(path.join(outside,'private.csv'),'Earnings\n99\n');
    await symlink(path.join(outside,'private.csv'),path.join(dir,'linked.csv'));
    await assert.rejects(loadReport(dir,'../private.csv'),/Invalid CSV filename/);
    await assert.rejects(loadReport(dir,'linked.csv'),/directly inside/);
  } finally { await rm(dir,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});
test('rejects missing earnings and malformed numeric fields', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'dk-mcp-'));
  try {
    await writeFile(path.join(dir,'bad.csv'),'Artist,Streams\nA,10\n');
    await assert.rejects(loadReport(dir,'bad.csv'),/Missing earnings/);
    await writeFile(path.join(dir,'bad.csv'),'Artist,Earnings\nA,not-a-number\n');
    await assert.rejects(loadReport(dir,'bad.csv'),/Invalid numeric/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
