// factory0604 movie script 13: PatternFill, tiles an image with a pattern image.

import { rectOf, type DImage } from '../../director';

export function PatternFill(im: DImage, patIm: DImage) {
  const w = im.width;
  const h = im.height;
  const dx = patIm.width;
  const dy = patIm.height;
  for (let i = 0; i <= Math.trunc(w / dx); i++) {
    for (let j = 0; j <= Math.trunc(h / dy); j++) {
      const rt = rectOf(i * dx, j * dy, i * dx + dx, j * dy + dy);
      im.copyPixels(patIm, rt, patIm.rect);
    }
  }
}
