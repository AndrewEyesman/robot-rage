// lobby060_ behavior 87 "country" (the country buttons on frame "inne", sprites
// 45-58, #pCountry "rw01"-"rw14"): shows how many players are in the country's seven
// rooms and goes into the country ("incountry").

import { Behavior, G, go, member, sprite } from '../../director';
import { EMPTY, LList, LPropList, chars, list, lingoString, num, propList, sym, value, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq } from './util';

export class Country extends Behavior {
  pCountry: LValue;
  pname = '';
  sp = 0;
  pRooms!: LList;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
    this.pRooms = list('e', 'w', 'n', 's', '1', '2', '3');
    this.UpdateUserCount();
  }

  mouseUp() {
    if (sprite(this.sp).member.name === this.pname + 'D') {
      this.setMember(EMPTY);
      G.gCountry = this.pCountry;
      const c = lingoString(this.pCountry);
      const nr = chars(c, 3, c.length);
      member('CountryName').text = member('GroupName_' + lingoString(value(nr))).text;
      go('incountry');
    }
  }

  getPropertyDescriptionList() {
    const description = new LPropList();
    description.addProp(sym('pCountry'), propList(sym('default'), 'rw1', sym('format'), sym('string'), sym('comment'), 'land'));
    return description;
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }

  UpdateUserCount() {
    let tCount = 0;
    const c = lingoString(this.pCountry);
    if (eq(G.gIRC.ipcode, '0000')) {
      for (let i = 1; i <= 7; i++) tCount = tCount + num(G.gRoom.GetNumUsers(c + lingoString(this.pRooms.getAt(i))));
    } else {
      for (let i = 1; i <= 7; i++) tCount = tCount + Math.trunc((num(G.gRoom.GetNumUsers(c + lingoString(this.pRooms.getAt(i)))) + 1) / 2);
    }
    const nr = value(chars(c, 3, c.length));
    const m = member('GroupCount' + lingoString(nr));
    if (m.text !== lingoString(tCount)) m.text = lingoString(tCount);
  }
}
