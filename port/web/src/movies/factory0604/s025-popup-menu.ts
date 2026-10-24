// factory0604 script 25 "popup menu behavior": a parent script on the workshop's weapon
// placement menus ("pop 1" front, "pop 2" back; puppet sprites). Choosing the other
// place swaps the front and back weapons and rebuilds them on the preview.

import { member, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { EMPTY, LList, sym, type LValue } from '../../lingo';
import { robotDesc } from './util';

export class PopupMenuBehavior {
  sp: number;
  pname: string;
  z: number;
  belong: LValue;
  oldZ: number;
  pOldname: string;

  constructor(sp0: number, belong0: LValue) {
    this.belong = belong0;
    this.sp = sp0;
    this.pname = sprite(this.sp).member.name;
    this.oldZ = sprite(this.sp).locZ;
    this.pOldname = this.pname;
    this.z = 49;
  }

  mouseDown() {
    this.managePop(' up');
    sprite(this.sp).locZ = this.z;
  }

  mouseUp() {
    sendSprite(1, 'usedoktor');
    if (this.sp !== the.clickOn) return;
    let rd = robotDesc();
    const vapen = rd.prop('vapen') as LList;
    for (let i = 1; i <= vapen.count; i++) {
      const v = vapen.getAt(i);
      if (v === sym('v1') || v === sym('v8') || v === sym('v13') || v === sym('v14') || v === sym('v15')) {
        this.managePop(EMPTY);
        return;
      }
    }
    if (the.mouseH <= sprite(this.sp).left + 51) {
      if (the.mouseV >= sprite(this.sp).top + Math.trunc(sprite(this.sp).height / 2)) {
        this.pname = this.pOldname === 'pop 1' ? 'pop 2' : 'pop 1';
      } else {
        this.pname = this.pOldname === 'pop 1' ? 'pop 1' : 'pop 2';
      }
      if (this.pOldname !== this.pname) {
        rd = robotDesc();
        const wpnPos = rd.prop('wpnPos') as LList;
        const f = wpnPos.getOne(sym('f'));
        const b = wpnPos.getOne(sym('b'));
        if (f > 0) {
          wpnPos.setAt(f, sym('b'));
          const part = (rd.prop('vapen') as LList).getAt(f);
          sendSprite(6, 'remove3DPart', part);
          sendSprite(6, 'add3DPart', part);
        }
        if (b > 0) {
          wpnPos.setAt(b, sym('f'));
          const part = (rd.prop('vapen') as LList).getAt(b);
          sendSprite(6, 'remove3DPart', part);
          sendSprite(6, 'add3DPart', part);
        }
        sendAllSprites('refreshYourselves', this.sp, this.pname);
      }
      this.pOldname = this.pname;
      this.managePop(EMPTY);
      sprite(this.sp).locZ = this.oldZ;
      this.choosePop();
    }
    sendSprite(1, 'makedoktor');
  }

  mouseUpOutSide() {
    this.managePop(EMPTY);
    sprite(this.sp).locZ = this.oldZ;
  }

  mouseLeave() {
    this.managePop(EMPTY);
    sprite(this.sp).locZ = this.oldZ;
  }

  managePop(n: string) {
    sprite(this.sp).member = member(this.pname + n);
    sprite(this.sp).width = member(this.pname + n).width;
    sprite(this.sp).height = member(this.pname + n).height;
  }

  // Works out the place (#f / #b) and keeps it nowhere.
  choosePop() {}

  refreshYourselves(nNum: number, nName: string) {
    if (this.sp !== nNum) {
      if (nName === 'pop 2') this.pname = 'pop 1';
      else if (nName === 'pop 1') this.pname = 'pop 2';
      this.managePop(EMPTY);
    }
  }
}
