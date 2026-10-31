import { genericProfile } from './profiles/generic.js';
const normalizeHeader = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
export function detectSchema(headers) {
  if (!Array.isArray(headers) || headers.some(h => typeof h !== 'string')) throw new Error('Invalid CSV headers');
  const normalized = headers.map(normalizeHeader);
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate CSV headers');
  const columns = {};
  for (const [key, aliases] of Object.entries(genericProfile.aliases)) {
    const found = headers.filter(h => aliases.includes(normalizeHeader(h)));
    if (found.length > 1) throw new Error('Ambiguous CSV columns for ' + key);
    columns[key] = found[0];
  }
  for (const key of genericProfile.required) if (!columns[key]) throw new Error('Missing earnings column; see README');
  return { format: genericProfile.id, columns, recognized: Object.values(columns).filter(Boolean).length };
}
