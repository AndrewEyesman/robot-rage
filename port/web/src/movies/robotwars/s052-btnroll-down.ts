// robotwars behaviors 52 and 55 "btnroll&down": buttons that swap to their "<name>D"
// member while pressed (52) and tint their label sprite (sp + 1 or sp + 14).

import { Behavior, cursor, pass, rgbColor, sendSprite, sprite } from '../../director';
import { EMPTY, lingoString, type LValue } from '../../lingo';
import { playsound } from './s030-soundscript';

export class BtnRollDown extends Behavior {
  sp = 0;
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    this.setMember(EMPTY);
    cursor(280);
  }

  mouseLeave() {
    this.setMember(EMPTY);
    cursor(-1);
  }

  mouseUp() {
    this.setMember(EMPTY);
    return pass();
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
    sprite(this.sp + 1).color = rgbColor(128, 128, 0);
    return pass();
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: LValue) {
    sprite(this.sp).member = lingoString(this.pname) + lingoString(n);
    sprite(this.sp + 1).color = rgbColor(196, 196, 0);
  }

  endSprite() {
    cursor(-1);
  }
}

export class BtnRollDown14 extends Behavior {
  sp = 0;
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    sprite(this.sp + 14).color = rgbColor(196, 196, 0);
  }

  mouseLeave() {
    sprite(this.sp + 14).color = rgbColor(196, 196, 0);
  }

  mouseUp() {
    sprite(this.sp + 14).color = rgbColor(196, 196, 0);
    return pass();
  }

  mouseDown() {
    sendSprite(1, 'usedoktor');
    playsound('knappljud', 255);
    sprite(this.sp + 14).color = rgbColor(128, 128, 0);
    return pass();
  }

  mouseUpOutSide() {
    sprite(this.sp + 14).color = rgbColor(196, 196, 0);
  }

  setMember(n: LValue) {
    sprite(this.sp).member = lingoString(this.pname) + lingoString(n);
  }
}
