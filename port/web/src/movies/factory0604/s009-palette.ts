// factory0604 behavior 9 "palette behavior": the Paintshop palette, 8 x 9 pixel swatches.
// A click moves the marker (the next sprite) onto the swatch, gives its colour to both
// paint maps (sprites 25 and 26) and shows it in member "colors".

import { Behavior, member, sendSprite, sprite, the, type DColor, type DImage } from '../../director';
import { point } from '../../lingo';

export class PaletteBehavior extends Behavior {
  sp = 0;
  myMember: unknown;

  beginSprite() {
    this.sp = the.currentSpriteNum;
  }

  mouseDown() {
    let x = the.mouseH - sprite(this.sp).left;
    let y = the.mouseV - sprite(this.sp).top;
    const Px = Math.trunc(x / 8);
    const Py = Math.trunc(y / 9);
    x = Px * 8 + 4;
    y = Py * 9 + 4;
    sprite(this.sp + 1).loc = point(sprite(this.sp).left + Px * 8, sprite(this.sp).top + Py * 9);
    const c = (sprite(this.sp).member.image as DImage).getPixel(x, y) as DColor;
    sendSprite(25, 'setForeColor', c);
    sendSprite(26, 'setForeColor', c);
    const t = member('colors').image as DImage;
    t.fill(member('colors').rect, c);
  }
}
