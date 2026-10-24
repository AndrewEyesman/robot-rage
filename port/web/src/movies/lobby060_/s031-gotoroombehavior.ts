// lobby060_ behavior 31 "GoToRoomBehavior" (the room buttons of a country, sprites
// 46-54, #room "e", "w", "n", "s", "1"-"5"): enters room <country><room>, shows the
// room's user count, and greys out rooms above your ranking (label: sprite + 14).

import { Behavior, G, member, sendAllSprites, sendSprite, sprite } from '../../director';
import { EMPTY, LPropList, char, lingoString, lt, num, propList, rgb, sym, value, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq } from './util';

export class GoToRoomBehavior extends Behavior {
  room: LValue;
  sp = 0;
  pname = '';
  Active = 0;

  private get full() {
    return lingoString(G.gCountry) + lingoString(this.room);
  }

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
    this.Active = 0;
    member('GroupCount_' + lingoString(this.room)).text = '0';
    if (eq(G.gRoom.pRoom, this.full)) this.setMember('C');
    if (lt(G.gUserData.getaProp(sym('rank')), value(lingoString(this.room)))) {
      sprite(this.sp + 14).color = rgb(100, 100, 0);
      this.Active = 1;
    }
    if (G.gLastroom !== undefined) {
      const lr = lingoString(G.gLastroom);
      if (eq(char(lr, lr.length), this.room)) this.setMember('C');
    }
  }

  UpdateUserCount() {
    let tCount: number;
    if (eq(G.gIRC.ipcode, '0000')) tCount = num(G.gRoom.GetNumUsers(this.full));
    else tCount = Math.trunc((num(G.gRoom.GetNumUsers(this.full)) + 1) / 2);
    const m = member('GroupCount_' + lingoString(this.room));
    if (m.text !== lingoString(tCount)) m.text = lingoString(tCount);
  }

  mouseUp() {
    sendSprite(1, 'usedoktor');
    if (sprite(this.sp).member.name === this.pname + 'D') {
      sendSprite(0, 'EnterRoom', this.full);
      sendAllSprites('ResetSetScroll');
      G.gNewRoom = this.full;
      if (!eq(G.gNewRoom, G.gLastroom)) {
        if (G.gLastroom !== undefined) {
          for (let i = 45; i <= 52; i++) sprite(i).member = this.pname;
        }
        this.setMember('C');
        G.gLastroom = this.full;
      } else {
        this.setMember('C');
      }
    }
    if (this.Active === 0) sprite(this.sp + 14).color = rgb(196, 196, 0);
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
    if (this.Active === 0) sprite(this.sp + 14).color = rgb(128, 128, 0);
  }

  mouseUpOutSide() {
    if (eq(G.gNewRoom, this.full)) this.setMember('C');
    else this.setMember(EMPTY);
    if (this.Active === 0) sprite(this.sp + 14).color = rgb(196, 196, 0);
  }

  setMember(n: string) {
    if (this.Active === 0) sprite(this.sp).member = this.pname + n;
  }

  ExternalsetMember(pro: LValue) {
    if (eq(this.room, pro)) this.setMember('C');
  }

  getPropertyDescriptionList() {
    const description = new LPropList();
    description.addProp(sym('room'), propList(sym('default'), 'shroom', sym('format'), sym('string'), sym('comment'), 'Go to room'));
    return description;
  }
}
