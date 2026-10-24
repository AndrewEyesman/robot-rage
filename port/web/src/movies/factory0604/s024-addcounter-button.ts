// factory0604 script 24 "addcounter button behavior": a parent script on the workshop's
// armour arrows (puppet sprites): adds or removes armour (#pansar) while held, between 1
// and the most the chassis and tower carry.

import { member, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { EMPTY, LList, lingoString, num, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { robotDesc, userPL } from './util';

export class AddcounterButtonBehavior {
  sp: number;
  typ: LValue;
  V: number;
  state: LSymbol;
  t0 = 0;
  name: string;
  pArmor: LValue;

  constructor(sp0: number, typ0: LValue, v0: number, name0: string) {
    this.sp = sp0;
    this.typ = typ0;
    this.V = v0;
    this.name = name0;
    member('ShowInches').text = lingoString(userPL().prop('pansar'));
    this.state = sym('init');
  }

  getmax() {
    let tmax = 0;
    const rd = robotDesc();
    const torn = rd.prop('torn') as LList;
    const t = torn.count > 0 ? torn.getAt(1) : undefined;
    // case ram[1] of: with no chassis this is a script error (index out of range).
    switch ((rd.prop('ram') as LList).getAt(1)) {
      case sym('r1'):
        tmax = 83;
        if (torn.count > 0) tmax = t === sym('t1') ? 126 : t === sym('t2') ? 146 : t === sym('t3') ? 166 : tmax;
        break;
      case sym('r2'):
        tmax = 125;
        if (torn.count > 0) tmax = t === sym('t1') ? 167 : t === sym('t2') ? 187 : t === sym('t3') ? 208 : tmax;
        break;
      case sym('r3'):
        tmax = 166;
        if (torn.count > 0) tmax = t === sym('t1') ? 209 : t === sym('t2') ? 229 : t === sym('t3') ? 249 : tmax;
        break;
    }
    return tmax;
  }

  mouseEnter() {
    sprite(this.sp).member = this.name + EMPTY;
  }

  mouseLeave() {
    sprite(this.sp).member = this.name;
  }

  mouseDown() {
    sprite(this.sp).member = this.name + 'D';
    this.t0 = the.milliSeconds + 300;
    this.HandleAdd();
    this.state = sym('down');
  }

  mouseUp() {
    sprite(this.sp).member = this.name + EMPTY;
    this.state = sym('idle');
  }

  mouseUpOutSide() {
    sprite(this.sp).member = this.name + EMPTY;
    this.state = sym('idle');
  }

  prepareFrame() {
    if (this.state === sym('init')) {
      sendSprite(1, 'usedoktor');
      if (num(userPL().prop('pansar')) > this.getmax()) {
        userPL().setaProp(sym('pansar'), this.getmax());
        member('ShowInches').text = lingoString(userPL().prop('pansar'));
        sendAllSprites('updateBar');
      }
      sendSprite(1, 'makedoktor');
      this.state = sym('idle');
    } else if (this.state === sym('down')) {
      if (the.milliSeconds > this.t0) {
        this.HandleAdd();
        this.t0 = the.milliSeconds + 100;
      }
    }
  }

  HandleAdd() {
    playsound('knappljud', 255);
    if (this.typ !== sym('pansar')) return;
    switch (this.V) {
      case 1:
        sendSprite(1, 'usedoktor');
        userPL().setaProp(sym('pansar'), num(userPL().prop('pansar')) + this.V);
        if (num(userPL().prop('pansar')) > this.getmax()) userPL().setaProp(sym('pansar'), this.getmax());
        member('ShowInches').text = lingoString(userPL().prop('pansar'));
        sendAllSprites('updateBar');
        sendSprite(1, 'makedoktor');
        break;
      case -1:
        sendSprite(1, 'usedoktor');
        userPL().setaProp(sym('pansar'), num(userPL().prop('pansar')) + this.V);
        if (num(userPL().prop('pansar')) < 1) userPL().setaProp(sym('pansar'), 1);
        member('ShowInches').text = lingoString(userPL().prop('pansar'));
        sendAllSprites('updateBar');
        sendSprite(1, 'makedoktor');
        break;
    }
  }
}
