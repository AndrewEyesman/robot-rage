// factory0604 behavior 18 "sell framescript" (frames 164-177, the Sell room): the
// inventory as puppet sprites from channel 104; a part chosen there gets a sell box
// (#UpdateSell, channels 350-352), and #SellPart sells it: the money (RegisterSale),
// the inventory, the list of sold SMS weapons, and saves the robot (setrobot).

import { Behavior, G, dot, go, member, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { member3d } from '../../director/s3d';
import { LList, LPropList, lingoString, point, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { RegisterSale } from '../robotwars/s017-money-manager';
import { InventoryBehavior } from '../robotwars/s041-inventory';
import { RobotWarsSend } from '../robotwars/s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from '../robotwars/s098-md5';
import { cleanUpChannels, createSprite } from './create-sprite';
import { HorizontalScrollBehavior } from './s192-horizontal-scroll';
import { SellButtonBehavior } from './s275-sell-button';
import { SellStuffBehavior } from './s276-sellstuff';
import { inventory, parts, robotDesc, userPL } from './util';

const SMS_WEAPONS = ['v1', 'v4', 'v9', 'v16', 'v17', 'b3', 'v3', 'v31', 'v32', 'v33', 'v34', 'v35', 'v36', 'v37'];

export class SellFramescript extends Behavior {
  state: LSymbol | undefined;
  scrollx: LValue;
  sp = 0;
  pISSelling = 0;

  beginSprite() {
    sendSprite(1, 'usedoktor');
    this.pISSelling = 0;
    member('sell message').text = '';
    member3d('robotpre').resetWorld();
    this.scrollx = 0;
    this.CleanUpSprites();
    this.UpdateAll();
  }

  CleanUpSprites() {
    cleanUpChannels(100, 300);
  }

  endSprite() {
    cleanUpChannels(300, 400);
    this.CleanUpSprites();
  }

  SellPart(name: LValue, inventoryNumber: LValue) {
    if (this.pISSelling !== 0) return;
    RegisterSale(name);
    this.CleanUpSprites();
    this.pISSelling = 1;
    sendSprite(1, 'usedoktor');
    const part = symbol(name)!;
    const typ = (parts().getProp(part) as LPropList).prop('typ');
    const rd = robotDesc();
    // rdCategory = getProp(rd, typ): unused.
    rd.getProp(typ);
    inventory().deleteAt(inventoryNumber);
    if (SMS_WEAPONS.some((w) => sym(w) === part)) (userPL().prop('soldweapons') as LList).add(part);
    for (let i = 300; i <= 400; i++) {
      if (sprite(i).puppet) sprite(i).locV = -1000;
      sprite(i).puppet = false;
    }
    put('save current robot');
    const infoList = new LPropList();
    infoList.addProp('action', 'setrobot');
    infoList.addProp('proplist', lingoString(userPL()));
    let ss = cleanSpace(lingoString(userPL()) + lingoString(dot(G.gLobby, 'session')));
    ss = StringToCapital(ss + 'md5istheshitlkasdfkhj');
    infoList.addProp('chksum', md5(ss));
    RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
    sendSprite(1, 'makedoktor');
    this.UpdateAll();
  }

  UpdateAll() {
    this.CleanUpSprites();
    this.sp = 104;
    let n = 0;
    for (const q of inventory()) {
      const pieceName = lingoString(q);
      createSprite(this.sp, pieceName, point(83 + 90 * n, 110), 52);
      sprite(this.sp).scriptInstanceList = [new InventoryBehavior(this.sp, pieceName), new SellButtonBehavior(this.sp, pieceName, n + 1), new HorizontalScrollBehavior(this.sp, n)];
      this.sp = this.sp + 1;
      n = n + 1;
    }
    this.state = sym('update');
    sendAllSprites('makedoktor');
  }

  UpdateSell(namn: LValue, num: LValue) {
    this.sp = 350;
    const pieceName = lingoString(namn);
    createSprite(this.sp, pieceName + ' sell', point(215, 285), 49);
    this.sp = this.sp + 1;
    createSprite(this.sp, 'sell btn', point(294, 495), 49);
    sprite(this.sp).scriptInstanceList = [new SellStuffBehavior(this.sp, pieceName, num)];
    this.sp = this.sp + 1;
    createSprite(this.sp, 'sell message', point(192, 336), 49);
    this.UpdateAll();
  }

  prepareFrame() {
    if (this.state === sym('update')) {
      sendAllSprites('updateBar');
      sendAllSprites('setzoomer');
      sendAllSprites('setscrollbar', 0);
      this.pISSelling = 0;
      this.state = sym('idle');
    }
  }

  exitFrame() {
    go(the.frame);
  }
}
