// arena104 behavior 217 "abuse but" (sprite 75 in a match, hidden when chat is off):
// toggles the abuse flag; with it on (gAbuse) the chat is off and the match ends on the
// report-abuse question (frame 26).

import { Behavior, G, cursor, member, sendAllSprites, sprite } from '../../director';
import { sym, type LSymbol } from '../../lingo';
import { eq } from './util';

// global gCHat, gAbuse

export class AbuseBut extends Behavior {
  sp: number = undefined as unknown as number;
  pState: LSymbol | undefined = undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    G.gAbuse = 0;
    this.pState = sym('off');
    sprite(this.sp).member = member('abuseoff');
    if (eq(G.gCHat, 0)) {
      sprite(this.sp).visible = false;
      sprite(this.sp + 1).visible = false;
    }
  }

  mouseUp() {
    if (this.pState === sym('off')) {
      this.pState = sym('on');
      sprite(this.sp).member = member('abuseon');
      sendAllSprites(sym('abuse'), sym('on'));
      G.gAbuse = 1;
    } else {
      this.pState = sym('off');
      sprite(this.sp).member = member('abuseoff');
      sendAllSprites(sym('abuse'), sym('off'));
      G.gAbuse = 0;
    }
  }

  mouseEnter() {
    cursor(280);
  }

  mouseLeave() {
    cursor(-1);
  }

  endSprite() {
    sprite(this.sp).visible = true;
    sprite(this.sp + 1).visible = true;
  }
}
