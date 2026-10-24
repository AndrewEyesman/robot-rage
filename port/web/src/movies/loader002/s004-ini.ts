// loader002 movie script "ini": reads main.ini into a property list, and jumps
// between the game's movies by their [filelist] names.

import { G, dot, go, gotoNetMovie, the } from '../../director';
import {
  EMPTY, LList, LPropList, char, itemCount, item, line, lineCount, lingoString, offset, putInto,
  setItemDelimiter, itemDelimiter, symbol, value, word, type LValue,
} from '../../lingo';

/** [section] lines start a property list; key = value lines add to it; other lines make it a list. */
export function parseIniFile(txt: string): LPropList {
  const L = new LPropList();
  let m: LPropList | LList = new LPropList();
  let p1: LValue;
  let cn = 0;
  setItemDelimiter('=');
  for (let i = 1; i <= lineCount(txt); i++) {
    const ln = line(txt, i);
    switch (char(word(ln, 1), 1)) {
      case '[': {
        let s = ln;
        s = SearchAndReplace(s, '[', EMPTY);
        s = SearchAndReplace(s, ']', EMPTY);
        s = SearchAndReplace(s, ' ', EMPTY);
        p1 = symbol(s);
        L.addProp(p1, new LPropList());
        m = L.getProp(p1) as LPropList;
        cn = 0;
        break;
      }
      case ';':
      case EMPTY:
        break;
      default:
        if (itemCount(ln) === 2) {
          (m as LPropList).addProp(symbol(item(ln, 1)), value(item(ln, 2)));
        } else {
          if (cn === 0) {
            L.setaProp(p1, new LList());
            m = L.getProp(p1) as LList;
          }
          (m as LList).add(lingoString(symbol(ln)));
        }
        cn = cn + 1;
    }
  }
  return L;
}

/** Replaces one character at a time (`put x into char n of s`), as the original does. */
export function SearchAndReplace(theText: string, stringToFind: string, stringToInsert: string): string {
  let hasChar = offset(stringToFind, theText);
  while (hasChar) {
    theText = putInto(theText, stringToInsert, ['char', hasChar]);
    hasChar = offset(stringToFind, theText);
  }
  return theText;
}

/** JumpMovie("login") / JumpMovie("factory", "label"): to a movie by its [filelist] name. */
export function JumpMovie(m: string, f?: string) {
  const fileList = dot(G.gShockplay, 'fileList');
  if (!(fileList instanceof LPropList) || fileList.getaProp(symbol(m)) === undefined) return;
  const fileName = String(fileList.getProp(symbol(m)));
  const tsd = itemDelimiter();
  // The runMode is "Plugin" in the browser, so only that branch is translated.
  if (typeof f === 'string') {
    setItemDelimiter('.');
    const same = item(the.movieName, 1).toLowerCase() === item(fileName, 1).toLowerCase();
    setItemDelimiter(tsd);
    if (same) go(f);
    else gotoNetMovie(`${the.moviePath}${dot(G.gShockplay, 'info', 'folder') ?? ''}/${fileName}#${f}`);
  } else {
    gotoNetMovie(`${the.moviePath}${dot(G.gShockplay, 'info', 'folder') ?? ''}/${fileName}`);
  }
}
