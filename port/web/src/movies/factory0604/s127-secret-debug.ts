// factory0604 behavior 127 (unused in the score): a field that switches on gSecretDebug
// when "lzwlzw" is typed and Return pressed.

import { Behavior, G, go, pass, sprite, the } from '../../director';
import { EMPTY, RETURN } from '../../lingo';
import { eq } from '../robotwars/util';


export class SecretDebug extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp).member.text = EMPTY;
  }

  keyDown() {
    if (the.key === RETURN) {
      if (eq(sprite(this.sp).member.text, 'lzwlzw')) G.gSecretDebug = 1;
      go(1);
    } else {
      return pass();
    }
  }
}
