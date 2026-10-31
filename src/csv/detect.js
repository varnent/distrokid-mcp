import { genericProfile } from './profiles/generic.js';
import { detectDistroKidProfile } from './profiles/distrokid.js';
const normalizeHeader = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
export function detectSchema(headers) {
  if (!Array.isArray(headers) || headers.some(h => typeof h !== 'string')) throw new Error('Invalid CSV headers');
  const normalized = headers.map(normalizeHeader);
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate CSV headers');
  const profile = detectDistroKidProfile(headers) ?? genericProfile;
  const columns = {};
  for (const [key, aliases] of Object.entries(profile.aliases)) {
    const found = headers.filter(h => aliases.includes(normalizeHeader(h)));
    if (found.length > 1) throw new Error('Ambiguous CSV columns for ' + key);
    columns[key] = found[0];
  }
  for (const key of profile.required) if (!columns[key]) throw new Error(key === 'earnings' ? 'Missing earnings column; see README' : 'Missing required CSV column: ' + key);
  return { format: profile.id, columns, recognized: Object.values(columns).filter(Boolean).length,
    ...(profile.impliedCurrency ? { impliedCurrency: profile.impliedCurrency } : {}) };
}
