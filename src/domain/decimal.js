// Exact decimal arithmetic shared by CSV normalization and legacy reporting.
export const ZERO = Object.freeze({ units: 0n, scale: 0 });
const MAX_DIGITS = 24;
export function decimal(value, { allowEmpty = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw && allowEmpty) return ZERO;
  if (!/^[+-]?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) throw new Error('Invalid numeric field in CSV');
  const cleaned = raw.replace(/[$,]/g, '');
  const sign = cleaned.startsWith('-') ? -1n : 1n;
  const unsigned = cleaned.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  if ((whole + fraction).length > MAX_DIGITS || fraction.length > 12) throw new Error('Numeric precision exceeds supported limit');
  return { units: sign * BigInt(whole + fraction), scale: fraction.length };
}
export function add(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { units: a.units * 10n ** BigInt(scale - a.scale) + b.units * 10n ** BigInt(scale - b.scale), scale };
}
export function compare(a, b) {
  const scale = Math.max(a.scale, b.scale);
  const left = a.units * 10n ** BigInt(scale - a.scale);
  const right = b.units * 10n ** BigInt(scale - b.scale);
  return left === right ? 0 : left > right ? 1 : -1;
}
export function format({ units, scale }) {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const whole = scale ? digits.slice(0, -scale) : digits;
  const fractional = scale ? digits.slice(-scale).replace(/0+$/, '') : '';
  return (negative && units !== 0n ? '-' : '') + whole + (fractional ? '.' + fractional : '');
}
