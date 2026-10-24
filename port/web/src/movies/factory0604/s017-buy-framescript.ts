// factory0604 behavior 17 "buy framescript" (frames 101-160, the Buy rooms): the
// inventory along the top as puppet sprites from channel 100, and #updateSMS: asks the
// server (getrobot) for weapons bought by SMS and puts new ones in the inventory.

import { Behavior, G, dot, go, member, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { member3d } from '../../director/s3d';
import { LPropList, duplicate, lingoEquals, lingoString, point, sym, value, type LSymbol, type LValue } from '../../lingo';
import { InventoryBehavior } from '../robotwars/s041-inventory';
import { RobotWarsReceive, RobotWarsSend, setMessage } from '../robotwars/s019-net-lingo';
import { cleanUpChannels, createSprite } from './create-sprite';
import { HorizontalScrollBehavior } from './s192-horizontal-scroll';
import { addBoughtWeapons } from './s303-sms-autocheck';
import { inventory, userPL } from './util';

export class BuyFramescript extends Behavior {
  state: LSymbol | undefined;
  scrollx: LValue;
  sp = 0;
  pnetId = 0;
  oldSMSlist: LValue;

  beginSprite() {
    sendSprite(1, 'usedoktor');
    member('buy message').text = '';
    member('Money Stats').text = lingoString(userPL().prop('money'));
    member3d('robotpre').resetWorld();
    this.CleanUpSprites();
    this.UpdateAll();
  }

  CleanUpSprites() {
    cleanUpChannels(100, 300);
  }

  endSprite() {
    this.CleanUpSprites();
  }

  UpdateAll() {
    this.CleanUpSprites();
    this.sp = 100;
    let n = 0;
    if (inventory().count > 0) {
      for (const q of inventory()) {
        const pieceName = lingoString(q);
        createSprite(this.sp, pieceName, point(83 + 90 * n, 110), 52);
        sprite(this.sp).scriptInstanceList = [new InventoryBehavior(this.sp, pieceName), new HorizontalScrollBehavior(this.sp, n)];
        this.sp = this.sp + 1;
        n = n + 1;
      }
    }
    this.state = sym('update');
  }

  updateSMS() {
    this.state = sym('send');
  }

  prepareFrame() {
    const st = this.state;
    if (st === sym('send')) {
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
        sendSprite(1, 'usedoktor');
        const L = value(r);
        (G.gUserData as LPropList).setaProp(sym('friendslist'), duplicate(dot(L, 'friendslist')));
        if (!lingoEquals(this.oldSMSlist, dot(G.gUserData, 'friendslist'))) {
          addBoughtWeapons(dot(L, 'friendslist'));
          this.CleanUpSprites();
          this.UpdateAll();
        }
        sendSprite(1, 'makedoktor');
        this.state = sym('done');
      }
    } else if (st === sym('update')) {
      sendAllSprites('updateBar');
      sendAllSprites('setzoomer');
      sendAllSprites('setscrollbar', 0);
      this.state = sym('idle');
    }
  }

  exitFrame() {
    go(the.frame);
  }
}

