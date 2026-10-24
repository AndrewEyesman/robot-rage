// robotwars movie script 7: JumpMovie (to a movie by its main.ini [filelist] name),
// angles and distances, and the robot paint map's text encoding (image2text /
// text2image: run-length coded palette indices, sent with setrobotmap).

import { DColor, DImage, G, dot, go, gotoNetMovie, member, the } from '../../director';
import { EMPTY, LPropList, char, charToNum, item, itemDelimiter, lf, lingoString, numToChar, setItemDelimiter, stringp, symbol, type LValue } from '../../lingo';
import { eq } from './util';
import { gameFixes } from '../fixes';

/** JumpMovie("login") / JumpMovie("factory", "start"). */
export function JumpMovie(m: string, f?: LValue) {
  const fileList = dot(G.gShockplay, 'fileList');
  if (!(fileList instanceof LPropList) || fileList.getaProp(symbol(m)) === undefined) return;
  const fileName = lingoString(fileList.getProp(symbol(m)));
  const tsd = itemDelimiter();
  setItemDelimiter('.');
  const flnm = item(fileName, 1);
  setItemDelimiter(tsd);
  void flnm; // only used by the authoring branch
  // the runMode is "Plugin" in the browser.
  if (stringp(f)) {
    // The delimiter is back to its old value here, so item 1 is the whole file name.
    if (eq(item(the.movieName, 1), item(fileName, 1))) go(f);
    else gotoNetMovie(the.moviePath + fileName + '#' + f);
  } else {
    gotoNetMovie(the.moviePath + fileName);
  }
}

export function GetAngle(dx: number, dy: number) {
  let a: number;
  if (dx === 0) {
    if (dy > 0) a = 90;
    else a = 270;
    return a;
  }
  a = Math.atan((1.0 * dy) / dx) * 57.29577951310000117;
  if (dx < 0) a = a + 180;
  if (dx >= 0 && dy < 0) a = a + 360;
  return lf(a);
}

export function GetAngle2(pt1: { locH: number; locV: number }, pt2: { locH: number; locV: number }) {
  return GetAngle(pt1.locH - pt2.locH, pt1.locV - pt2.locV);
}

export function getDist(dx: number, dy: number) {
  return lf(Math.sqrt(dx * dx + dy * dy));
}

export function debug(_s?: LValue) {}

/** The palette index of a pixel. Past the edge it reads index 0 (as dirplayer does; Adobe not checked). */
function paletteIndexAt(im: DImage, x: number, y: number): number {
  const c = im.getPixel(x, y);
  if (c === undefined) return 0;
  if (typeof c === 'number') return c;
  return (c as DColor).paletteIndex(im.palette);
}

/** A paint map as text: each pixel's index + 42 as a character, runs of 3-213 as "(" index count+40. */
export function image2text(im: DImage): string {
  const w = im.width;
  const h = im.height;
  let txt = EMPTY;
  let x = 0;
  let y = 0;
  while (y < h) {
    let c = paletteIndexAt(im, x, y);
    let dcounter = 1;
    // Fix (gameFixes.mapEdge, #63): the original also reads past the row's end, where
    // every pixel is index 0, so a run of index 0 at the right edge counted pixels that
    // aren't there and the rest of the map came back shifted.
    while ((!gameFixes.mapEdge || x + 1 < w) && paletteIndexAt(im, x + 1, y) === c && dcounter < 213) {
      x = x + 1;
      dcounter = dcounter + 1;
      if (x === w - 1) {
        if (paletteIndexAt(im, 0, y + 1) === c) {
          dcounter = dcounter + 1;
          x = 0;
          y = y + 1;
        }
      }
    }
    c = c + 42;
    if (c > 255) c = 255;
    if (dcounter <= 2) txt = txt + numToChar(c);
    if (dcounter === 2) txt = txt + numToChar(c);
    if (dcounter > 2) txt = txt + '(' + numToChar(c) + numToChar(dcounter + 40);
    x = x + 1;
    if (x >= w) {
      x = 0;
      y = y + 1;
    }
  }
  return txt;
}

/** Paints `im` from image2text's text; grey when there is no map. */
export function text2image(im: DImage, txt: LValue) {
  if (!stringp(txt)) {
    im.fill(im.rect, DColor.hex('0x888888'));
    return;
  }
  if (txt.length < 40) {
    im.fill(im.rect, DColor.hex('0x888888'));
    return;
  }
  const w = im.width;
  const h = im.height;
  const tmpImage = new DImage(w, h, 8);
  // tmpImage.paletteRef = member("map palette")
  const pal = member('map palette');
  if (pal?.colors) tmpImage.palette = pal.colors;
  let n = 0;
  let c = -1;
  let dcounter = -1;
  let x = 0;
  let y = 0;
  while (y < h) {
    n = n + 1;
    const ch = char(txt, n);
    if (ch === '(') {
      n = n + 1;
      c = charToNum(char(txt, n)) - 42;
      n = n + 1;
      dcounter = charToNum(char(txt, n)) - 40;
      for (let i = 1; i <= dcounter; i++) {
        tmpImage.setPixel(x, y, c);
        x = x + 1;
        if (x >= w) {
          x = 0;
          y = y + 1;
        }
      }
    } else {
      c = charToNum(ch) - 42;
      tmpImage.setPixel(x, y, c);
      x = x + 1;
      if (x >= w) {
        x = 0;
        y = y + 1;
      }
    }
  }
  im.copyPixels(tmpImage, tmpImage.rect, tmpImage.rect);
}

