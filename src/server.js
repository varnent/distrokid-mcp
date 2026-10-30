import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadReport, summarize } from './report.js';

const dataDir = process.env.DISTROKID_CSV_DIR;
if (!dataDir) { console.error('Set DISTROKID_CSV_DIR to an existing local directory'); process.exit(1); }
const root = await realpath(path.resolve(dataDir));
if (!(await stat(root)).isDirectory()) throw new Error('Data path must be a directory');
const server = new McpServer({ name: 'distrokid-csv-reports', version: '0.1.0' });
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const failure = error => ({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Unknown error' }] });
server.tool('list_reports', 'List CSV exports in the configured local directory (no account access)', {}, async () => {
  try {
    const names = await readdir(root);
    const reports = [];
    for (const name of names.filter(n=>/^[A-Za-z0-9][A-Za-z0-9_. -]*\.csv$/i.test(n)).sort()) {
      try { const f = await realpath(path.join(root,name)); if(path.dirname(f) === root && (await stat(f)).isFile()) reports.push(name); } catch { /* skip inaccessible files */ }
    }
    return result({ reports });
  } catch (e) { return failure(e); }
});
server.tool('report_summary', 'Aggregate read-only earnings and quantities from a local CSV export. Currency must be verified independently.', {
  filename: z.string().min(5).max(255),
  groupBy: z.enum(['artist','title','store','date']).default('artist'),
  artist: z.string().max(250).optional(),
  limit: z.number().int().min(1).max(100).default(20)
}, async ({filename,groupBy,artist,limit}) => {
  try { const {rows,metadata} = await loadReport(root, filename); return result({file:filename, metadata, summary:summarize(rows,{groupBy,artist,limit})}); }
  catch(e) { return failure(e); }
});
await server.connect(new StdioServerTransport());
