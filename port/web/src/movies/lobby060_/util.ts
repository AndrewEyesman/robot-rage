// Small helpers the lobby translations share (not part of the original scripts).

import { G, MultiuserXtra, sprite } from '../../director';
import { FieldMember, TextualMember } from '../../director/members';
import { LPoint, num } from '../../lingo';

export { eq } from '../robotwars/util';

/** Every global the lobby and arena keep a Multiuser instance in. */
const MU_GLOBALS = ['SMUSmuInstance', 'P2PmuInstanceListen', 'P2PmuInstanceConnect', 'gMultiuserInstanceIRC', 'muInstance'];

/**
 * `P2PmuInstanceConnect = x`: Director closes an instance's connection when the last
 * reference to it goes away; JavaScript can't see that, so the old instance is disposed
 * here unless another global still holds it (the arena's muInstance keeps the match's
 * connection open after the lobby lets go of it).
 */
export function setMU(name: string, v: MultiuserXtra | undefined) {
  const old = G[name];
  G[name] = v;
  if (old instanceof MultiuserXtra && old !== v && !MU_GLOBALS.some((n) => G[n] === old)) old.dispose();
}

/**
 * sprite(n).pointToLine(pt): the line (1-based) of a text or field sprite under a stage
 * point, or -1 when the point isn't over a line of its text.
 */
export function pointToLine(n: number, pt: LPoint): number {
  const s = sprite(n);
  const m = s.memberRef;
  if (!(m instanceof TextualMember)) return -1;
  const b = s.bounds;
  const x = num(pt.locH);
  const inset = m instanceof FieldMember ? m.border + m.margin : 0;
  let y = num(pt.locV) - b.top - inset + (m instanceof FieldMember ? m.scrollTop : 0);
  if (x < b.left || x >= b.right || y < 0) return -1;
  const lines = m.lines();
  for (let i = 0; i < lines.length; i++) {
    if (y < lines[i].height) return i + 1;
    y -= lines[i].height;
  }
  return -1;
}

/** member.word[a..b].fontStyle = [#plain] / [#bold] (words are runs of non-spaces). */
export function setWordsBold(m: unknown, a: number, b: number, bold: boolean) {
  if (!(m instanceof TextualMember)) return;
  const text = m.text;
  const words: [number, number][] = [];
  const re = /[^ \t\r\n]+/g;
  let w: RegExpExecArray | null;
  while ((w = re.exec(text))) words.push([w.index, w.index + w[0].length]);
  if (a > words.length) return;
  const first = words[a - 1];
  const last = words[Math.min(b, words.length) - 1];
  m.styled.restyle(first[0], last[1], (r) => ({ ...r, style: { ...r.style, bold, italic: false, underline: false } }));
  m.touch();
}
