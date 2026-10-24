// factory0604 behavior 303 (sprites 10 / 4 / 8 on the Buy, Paintshop and workshop
// frames): after a Super Weapons purchase, asks the server again two minutes later
// (getrobot) whether weapons bought by SMS have arrived (gUserData.friendslist), and
// puts the new ones in the inventory. Shows the countdown in its text while waiting.

import { Behavior, G, dot, go, put, sendAllSprites, sprite, the } from '../../director';
import { LList, LPropList, duplicate, lingoEquals, lingoString, num, sym, value, voidp, type LSymbol, type LValue } from '../../lingo';
import { RobotWarsReceive, RobotWarsSend, setMessage } from '../robotwars/s019-net-lingo';
import { inventory, robotDesc, userPL } from './util';

/** The weapons in the new friendslist that aren't sold, installed or in the inventory yet go into the inventory. */
export function addBoughtWeapons(friendslist: LValue) {
  const boughtWeapons = duplicate(friendslist) as LList;
  if (userPL().getaProp(sym('soldweapons')) === undefined) userPL().setaProp(sym('soldweapons'), new LList());
  const sold = userPL().prop('soldweapons') as LList;
  for (let i = 1; i <= sold.count; i++) {
    const n = boughtWeapons.getPos(sold.getAt(i));
    if (n > 0) boughtWeapons.deleteAt(n);
  }
  for (const q of robotDesc().prop('vapen') as LList) {
    const n = boughtWeapons.getPos(q);
    if (n > 0) boughtWeapons.deleteAt(n);
  }
  for (const q of inventory()) {
    const n = boughtWeapons.getPos(q);
    if (n > 0) boughtWeapons.deleteAt(n);
  }
  for (const q of boughtWeapons) inventory().add(q);
}

export class SmsAutoCheck extends Behavior {
  state: LSymbol | undefined;
  scrollx: LValue;
  sp: LValue;
  pnetId = 0;
  oldSMSlist: LValue;
  pTime = 0;

  SetAutomaticCheckTime() {
    G.gStarttime = the.milliSeconds;
    this.state = sym('autoCheck');
  }

  beginSprite() {
    this.pTime = 60 * 2 * 1000;
    if (!voidp(G.gStarttime)) {
      if (num(G.gStarttime) + this.pTime > the.milliSeconds) this.state = sym('autoCheck');
    }
  }

  AutomaticCheck() {
    this.state = sym('send');
  }

  prepareFrame() {
    const st = this.state;
    if (st === sym('autoCheck')) {
      if (num(G.gStarttime) + this.pTime < the.milliSeconds) this.state = sym('send');
      else sprite(the.currentSpriteNum).member.text = lingoString(num(G.gStarttime) + this.pTime - the.milliSeconds);
    } else if (st === sym('send')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'getrobot');
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      setMessage('HŠmtar robot..', 0, 3000);
      this.oldSMSlist = duplicate(dot(G.gUserData, 'friendslist'));
      this.state = sym('waitNet');
    } else if (st === sym('waitNet')) {
      const r = RobotWarsReceive(this.pnetId);
      put(r);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        put('time out');
        this.state = sym('error');
      } else {
        const L = value(r);
        (G.gUserData as LPropList).setaProp(sym('friendslist'), duplicate(dot(L, 'friendslist')));
        if (!lingoEquals(this.oldSMSlist, dot(G.gUserData, 'friendslist'))) {
          addBoughtWeapons(dot(L, 'friendslist'));
          sendAllSprites('CleanUpSprites');
          sendAllSprites('UpdateAll');
          G.gStarttime = undefined;
          this.state = sym('done');
          sendAllSprites('makedoktor');
        } else {
          this.state = sym('done');
          this.SetAutomaticCheckTime();
          put('nothing new');
        }
      }
    }
  }

  exitFrame() {
    go(the.frame);
  }
}
