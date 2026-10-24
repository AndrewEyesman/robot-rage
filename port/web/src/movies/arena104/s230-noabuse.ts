// arena104 behavior 230 "noabuse" (the NO button of the report-abuse question): drops
// the flag, so frame 26 lets the movie go on.

import { Behavior, G, cursor, pass, sprite } from '../../director';
import { rgb } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

// global gAbuse

export class NoAbuse extends Behavior {
  sp: number = undefined as unknown as number;
  pname: string = undefined as unknown as string;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    cursor(280);
  }

  mouseLeave() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    cursor(-1);
  }

  mouseUp() {
    G.gAbuse = 0;
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    return pass();
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
    sprite(this.sp + 1).color = rgb(128, 128, 0);
    return pass();
  }

  mouseUpOutSide() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }
}
