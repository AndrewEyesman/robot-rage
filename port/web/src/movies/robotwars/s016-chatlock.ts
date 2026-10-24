// robotwars behavior 16 "chatlock": the arena's chat on/off switch (gCHat).

import { Behavior, G, pass, rgbColor, sendSprite, sprite } from '../../director';
import { EMPTY } from '../../lingo';
import { playsound } from './s030-soundscript';

export class Chatlock extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    sprite(this.sp).member = 'chat on';
    G.gCHat = 1;
  }

  mouseDown() {
    playsound('knappljud', 255);
    if (G.gCHat === 1) {
      G.gCHat = 0;
      sprite(this.sp).member = 'chat off';
      sendSprite(this.sp - 2, 'setMember', 'D');
    } else {
      G.gCHat = 1;
      sprite(this.sp).member = 'chat on';
      sendSprite(this.sp - 2, 'setMember', EMPTY);
    }
    sprite(this.sp + 1).color = rgbColor(128, 128, 0);
    return pass();
  }
}
