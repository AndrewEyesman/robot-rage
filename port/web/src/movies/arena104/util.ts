// Small helpers the arena's translations share (not part of the original scripts).

import { G, sprite, type TextualMember } from '../../director';
import { member3d, type Shockwave3dMember } from '../../director/s3d';
import { LPropList, lingoEquals, num, sym, type LValue } from '../../lingo';

/** Lingo `=` (strings case-insensitively, "1" = 1, VOID = 0): what `case` and `if a = b` use. */
export const eq = (a: LValue, b: LValue): boolean => lingoEquals(a, b);

/** `sprite(n).prop`: a script property of one of the sprite's behaviors (VOID if none has it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sp(n: number, name: string): any {
  return sprite(n).getProp(name);
}

/** `sprite(n).prop = v` for a script property. */
export function setSp(n: number, name: string, v: unknown) {
  sprite(n).setProp(name, v);
}

/** global world */
export const world = (): Shockwave3dMember => G.world;

/** A property list's value by symbol name (`pl.name`), VOID when it isn't one. */
export function pget(l: LValue, name: string): LValue {
  return l instanceof LPropList ? l.getaProp(sym(name)) : undefined;
}

/** `pl.name = v` on a property list. */
export function pset(l: LValue, name: string, v: LValue) {
  if (l instanceof LPropList) l.setaProp(sym(name), v);
}

/** A number from a Lingo value (VOID is 0). */
export const n = (v: LValue): number => num(v);

/** member(n, castLib) as a 3D member: `member(1, 1).texture("spycam")`. */
export const member3dOf = (num: number, castLib?: number): Shockwave3dMember => member3d(num, castLib);

/** The character range [from, to) of lines first..last (RETURN-separated) of a text. */
function lineRange(text: string, first: number, last: number): [number, number] | null {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\r') starts.push(i + 1);
  if (first > starts.length) return null;
  const from = starts[first - 1];
  const to = last < starts.length ? starts[last] - 1 : text.length;
  return [from, Math.max(from, to)];
}

/** member.line[first..last].fontSize = size */
export function setLinesFontSize(m: TextualMember, first: number, last: number, size: number) {
  const r = lineRange(m.text, first, last);
  if (!r) return;
  m.styled.restyle(r[0], r[1], (run) => ({ ...run, style: { ...run.style, size } }));
  m.touch();
}
