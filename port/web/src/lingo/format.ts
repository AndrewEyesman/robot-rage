// Lingo string(), byte for byte as Director 10 formats values (checked against Adobe's
// player). It matters beyond display: the server checks an MD5 over string() of robot
// property lists (docs/notes.md, getrobot).
//
//   string(1.0)            "1.0000"            string(VOID)       ""
//   string(#a)             "a"                 string([#a, VOID]) "[#a, <Void>]"
//   string([:])            "[:]"               string(["x": 1])   "["x": 1]"
//   string(rgb(255,0,0))   "rgb( 255, 0, 0 )"  string(color(3))   "paletteIndex( 3 )"
//   string(1e20)           "1.00000000000000e20"

import { LColor, LFloat, LList, LPoint, LPropList, LRect, LSymbol, LVector, type LValue } from './values';

let precision = 4;

/** the floatPrecision */
export const floatPrecision = (): number => precision;
export const setFloatPrecision = (p: number): void => {
  precision = Math.trunc(p);
};

/**
 * A float as string() shows it. Fixed notation with `the floatPrecision` decimals,
 * rounding exact ties away from zero (0.03125 is "0.0313"); a negative precision drops
 * trailing zeros but keeps the point ("2."). Scientific notation with 14 decimals once
 * the value's exponent, rounded to one digit, plus the precision reaches 16 (at
 * precision 4: 949999999999.99 is fixed, 950000000000.0 is "9.50000000000000e11").
 * -0.0 keeps its sign. dirplayer drops that sign and switches notation at a different
 * size.
 */
export function formatFloat(x: number): string {
  if (Number.isNaN(x)) return 'NAN';
  if (!Number.isFinite(x)) return x < 0 ? '-INF' : 'INF';
  const p = Math.min(Math.abs(precision), 100);
  const e = x === 0 ? 0 : Number(Math.abs(x).toExponential(0).split('e')[1]);
  if (e + p >= 16) return x.toExponential(14).replace('e+', 'e');
  // toFixed rounds the exact binary value, ties away from zero, like Director's printf.
  let s = x.toFixed(p);
  if (Object.is(x, -0)) s = '-' + s;
  if (precision < 0) s = s.replace(/0+$/, '');
  return s;
}

/** Lingo string(v). */
export function lingoString(v: LValue): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  if (v instanceof LSymbol) return v.name;
  return inner(v);
}

// Inside lists, strings are quoted (without escaping), symbols keep their # and VOID
// shows as <Void>.
function inner(v: LValue): string {
  if (v === undefined) return '<Void>';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : formatFloat(v);
  if (v instanceof LFloat) return formatFloat(v.v);
  if (v instanceof LSymbol) return '#' + v.name;
  if (v instanceof LList) return `[${v.items.map(inner).join(', ')}]`;
  if (v instanceof LPropList) {
    if (v.count === 0) return '[:]';
    return `[${v.keys.map((k, i) => `${inner(k)}: ${inner(v.values[i])}`).join(', ')}]`;
  }
  if (v instanceof LPoint) return `point(${inner(v.locH)}, ${inner(v.locV)})`;
  if (v instanceof LRect) return `rect(${inner(v.left)}, ${inner(v.top)}, ${inner(v.right)}, ${inner(v.bottom)})`;
  if (v instanceof LColor) return v.index !== undefined ? `paletteIndex( ${v.index} )` : `rgb( ${v.red}, ${v.green}, ${v.blue} )`;
  if (v instanceof LVector) return `vector( ${formatFloat(v.x)}, ${formatFloat(v.y)}, ${formatFloat(v.z)} )`;
  // Translated script instances can say how they print.
  const custom = (v as { toLingoString?: () => string }).toLingoString;
  if (typeof custom === 'function') return custom.call(v);
  return `<offspring "${(v as object).constructor?.name ?? 'object'}">`;
}
