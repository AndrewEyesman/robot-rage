// Small helpers the factory0604 translations share (not part of the original scripts).

import { G, dot, type TextualMember } from '../../director';
import { LList, LPropList, charToNum, lingoString, sym, type LValue } from '../../lingo';

/** gUserData.propertyList */
export const userPL = (): LPropList => dot(G.gUserData, 'propertyList') as LPropList;

/** gUserData.propertyList.robotDescription */
export const robotDesc = (): LPropList => dot(G.gUserData, 'propertyList', 'robotDescription') as LPropList;

/** gUserData.propertyList.inventory */
export const inventory = (): LList => dot(G.gUserData, 'propertyList', 'inventory') as LList;

/** gPartDescription */
export const parts = (): LPropList => G.gPartDescription as LPropList;

/** getaProp(list, #name): VOID when the value isn't a property list or lacks it. */
export function propOf(l: LValue, name: string): LValue {
  return l instanceof LPropList ? l.getaProp(sym(name)) : undefined;
}

/** A value known to be a linear list (an empty one otherwise, as a VOID list would error). */
export const asLList = (v: LValue): LList => (v instanceof LList ? v : new LList());

/**
 * Lingo's urlEncode(): form encoding, as Director 10 does it (letters, digits and
 * `-_.*` stay, spaces become +, everything else %XX of the Windows-1252 byte).
 */
export function urlEncode(v: LValue): string {
  let out = '';
  for (const ch of lingoString(v)) {
    if (/[A-Za-z0-9\-_.*]/.test(ch)) out += ch;
    else if (ch === ' ') out += '+';
    else {
      out += '%' + charToNum(ch).toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

/**
 * `dst.rtf = src.rtf`: the text member takes the other's text with its styles and
 * paragraph formats (the port keeps styled text, not RTF).
 */
export function copyRtf(dst: TextualMember, src: TextualMember) {
  dst.styled = src.styled.clone();
  dst.paragraphs = src.paragraphs.map((p) => ({ ...p }));
  dst.alignment = src.alignment;
  dst.touch();
}

/** `put s into member.line[1]`, keeping the line's style. */
export function putIntoLine1(m: TextualMember, s: string) {
  const end = m.text.indexOf('\r');
  m.styled.splice(0, end < 0 ? m.text.length : end, s);
  m.touch();
}
