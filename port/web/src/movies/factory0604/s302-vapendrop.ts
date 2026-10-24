// factory0604 behavior 302 "vapendrop" (sprite 59, the Buy rooms): the "Select Category"
// drop-down. Its text (the next sprite) opens into the category list
// (member "vapendropmenu", 15 px lines); choosing one shows its first part and goes to
// its page.

import { Behavior, go, member, sendSprite, sprite, the } from '../../director';
import { LList, line, sym, type LSymbol, type LValue } from '../../lingo';

export class Vapendrop extends Behavior {
  sp = 0;
  pState: LSymbol | undefined;
  pPlace: LValue;
  pLineSpace = 0;
  pV = 0;
  pGoList = new LList();
  pItemlist = new LList();
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pPlace = 'Select Category';
    sprite(this.sp + 1).member.text = this.pPlace;
    this.pState = sym('up');
    this.pLineSpace = 15;
    this.pV = sprite(this.sp + 1).locV;
    this.pGoList = new LList([104, 111, 117, 124, 128, 152]);
    this.pItemlist = new LList([sym('r1'), sym('h1'), sym('ma1'), sym('b1'), sym('v13'), sym('p1')]);
    if (the.frame === 101) this.mouseDown();
  }

  mouseLeave() {
    this.pState = sym('up');
    this.setMember();
  }

  mouseUp() {
    if (this.getline() > 0) {
      if (this.pState === sym('down')) {
        this.pState = sym('go');
        this.setMember();
      }
    }
  }

  mouseDown() {
    if (this.pState === sym('up')) {
      this.pState = sym('down');
      this.setMember();
    } else if (this.getline() > 0) {
      this.pState = sym('go');
      this.setMember();
    }
  }

  // Called without `me` in the original: handlers of the same script.
  setMember() {
    const nr = this.getline();
    if (nr > this.pGoList.count) this.pState = sym('up');
    if (this.pState === sym('go')) {
      this.pPlace = line(member('vapendropmenu').text, nr + 1);
      this.pname = this.pItemlist.getAt(nr);
      sendSprite(6, 'InitRobot');
      sendSprite(6, 'Show3DPart', this.pname);
      this.pState = sym('up');
      this.setMember();
      go(this.pGoList.getAt(nr) as number);
    } else if (this.pState === sym('up')) {
      sprite(this.sp + 1).member.text = this.pPlace;
      sprite(this.sp).member = member('vapendrop1');
    } else {
      sprite(this.sp + 1).member.text = member('vapendropmenu').text;
      sprite(this.sp).member = member('vapendrop2');
    }
  }

  getline() {
    return Math.trunc((the.mouseV - this.pV) / this.pLineSpace);
  }
}
