// login013_ movie script "Movie Behavior": creates the server connection (gCom) and
// the user object, jumps between movies, and puts up loading indicators.

import { G, dot, go, gotoNetMovie, pass, put, sprite, the } from '../../director';
import { item, itemDelimiter, offset, putInto, setItemDelimiter, symbol, type LPoint, type LPropList } from '../../lingo';
import { AspCommunicationObject } from './s031-asp-communication-object';
import { UserObject } from './s033-user-object';
import { LoadingIndicator } from './s034-loading-indicator';

export function prepareMovie() {
  G.gCom = new AspCommunicationObject(dot(G.gShockplay, 'info', 'gUrl'));
  G.gUser = new UserObject();
  pass();
}

export function JumpMovie(m: string, f?: string) {
  const fileList = dot(G.gShockplay, 'fileList') as LPropList | undefined;
  if (!fileList || fileList.getaProp(symbol(m)) === undefined) return;
  put(`ok ${m} ${f ?? ''}`);
  const fileName = String(fileList.getProp(symbol(m)));
  // The runMode is "Plugin" in the browser, so only that branch is translated.
  if (typeof f === 'string') {
    const tsd = itemDelimiter();
    setItemDelimiter('.');
    const same = item(the.movieName, 1).toLowerCase() === item(fileName, 1).toLowerCase();
    setItemDelimiter(tsd);
    if (same) go(f);
    else gotoNetMovie(`${the.moviePath}${fileName}#${f}`);
  } else {
    gotoNetMovie(the.moviePath + fileName);
  }
}

/** Two counter-rotating dots in the first free pair of channels from 880. */
export function CreateIndicator(pt: LPoint, tParent?: number): number {
  const sp0 = 880;
  let sp = sp0;
  while (sprite(sp).puppet && sp < sp0 + 18) sp = sp + 1;
  sprite(sp).puppet = true;
  sprite(sp).scriptInstanceList = [new LoadingIndicator(sp, pt, 0, tParent)];
  sprite(sp + 1).puppet = true;
  sprite(sp + 1).scriptInstanceList = [new LoadingIndicator(sp + 1, pt, 180, tParent)];
  return sp;
}

export function RemoveIndicator(sp: number) {
  sprite(sp).puppet = false;
  sprite(sp + 1).puppet = false;
}

export function SearchAndReplace(theText: string, stringToFind: string, stringToInsert: string): string {
  let hasChar = offset(stringToFind, theText);
  while (hasChar) {
    theText = putInto(theText, stringToInsert, ['char', hasChar, hasChar + stringToFind.length - 1]);
    hasChar = offset(stringToFind, theText);
  }
  return theText;
}
