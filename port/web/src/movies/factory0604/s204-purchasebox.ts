// factory0604 behavior 204 "PurchaseBox" (the Super Weapons page's buy buttons): saves
// the robot (setrobot), then opens the fan site's payment page for the weapon's
// template (a javascript: URL, which the port ignores), passing the click on. The port
// sells super weapons for credits instead (enhancements.ts; ?quirks=superpack).

import { Behavior, G, cursor, dot, gotoNetPage, member, pass, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { LPropList, lingoString, num, point, symbol, type LValue } from '../../lingo';
import { BtnrollDown } from './s273-btnroll-down';
import { RegisterBuy, RegisterBuyPack } from '../robotwars/s017-money-manager';
import { RobotWarsSend } from '../robotwars/s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from '../robotwars/s098-md5';
import { SUPER_PACKS, SUPER_PAGES, garageFixes, packContents, restyleSuperDescriptions } from './enhancements';
import { parts, urlEncode } from './util';

const TEMPLATES: Record<string, number> = {
  p1: 5, p2: 6, v1: 8, v9: 7, v4: 10, v16: 11, v17: 12, v3: 9, v31: 16, v32: 14, v33: 17, v34: 18, v35: 15, v36: 13,
};

export class PurchaseBox extends Behavior {
  sp = 0;
  weaponid: LValue = 'nada';
  pActive: LValue;
  pmethod: LValue = 'nada';

  private labelled = 0;

  /** Port enhancement (super weapons for credits): the descriptions give the credit price, the button is the other parts' BUY NOW! (each page; the span covers several). */
  prepareFrame() {
    if (!garageFixes.superCredits || this.labelled === the.frame) return;
    this.labelled = the.frame;
    const part = SUPER_PAGES[the.frame];
    if (!part) return;
    restyleSuperDescriptions((p) => SUPER_PACKS[p]?.price ?? num(dot(parts().getProp(symbol(p)), 'pris')));
    // The other parts' BUY NOW! button (sprite 44 there, at 294,495), which shows its
    // pressed image only while held (BuyStuff), not on rollover (btnroll&down).
    const btn = sprite(this.spriteNum);
    btn.member = member('buy btn');
    btn.loc = point(294, 495);
    const roll = btn.scriptInstanceList.findIndex((i) => i instanceof BtnrollDown);
    if (roll >= 0) btn.scriptInstanceList.splice(roll, 1);
    const label = sprite(this.spriteNum + 1).member;
    if (label && 'text' in label) label.text = '';
    // "Ships with Super Pack 1": no longer the only way to get it.
    member('Superpack1 info').text = '';
    member('Superpack 2 info').text = '';
  }

  /** Port enhancement: on the Super Weapons pages the button is BUY NOW!, pressed while held. */
  private get buyNow() {
    return garageFixes.superCredits && SUPER_PAGES[the.frame] !== undefined;
  }

  mouseUpOutSide() {
    if (this.buyNow) sprite(this.spriteNum).member = member('buy btn');
  }

  mouseUp() {
    if (garageFixes.superCredits) {
      // Port enhancement: buy the page's weapon (or pack) for credits, no payment page.
      if (this.buyNow) sprite(this.spriteNum).member = member('buy btn');
      sendSprite(the.currentSpriteNum - 1, 'mouseUp');
      // Off the Super Weapons pages (the buy room's Super Pack 2 ad) the button only
      // leads to the pack's page (its menu item behavior does that); buying is there.
      const part = SUPER_PAGES[the.frame];
      if (!part) return pass();
      const pack = SUPER_PACKS[part];
      if (pack) RegisterBuyPack(symbol(part), packContents(part), pack.price);
      else if (parts().getaProp(symbol(part)) !== undefined) RegisterBuy(symbol(part));
      return pass();
    }
    sendAllSprites('ShowpurchaseBox');
    sendSprite(the.currentSpriteNum - 1, 'mouseUp');
    put('save current robot');
    const infoList = new LPropList();
    infoList.addProp('action', 'setrobot');
    infoList.addProp('proplist', lingoString(dot(G.gUserData, 'propertyList')));
    let ss = cleanSpace(lingoString(dot(G.gUserData, 'propertyList')) + lingoString(dot(G.gLobby, 'session')));
    ss = StringToCapital(ss + 'md5istheshitlkasdfkhj');
    infoList.addProp('chksum', md5(ss));
    RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
    // case weaponid of ...: templateid stays VOID for any other weapon.
    const templateid: LValue = TEMPLATES[lingoString(this.weaponid).toLowerCase()];
    // Quirk: "nada" (the default) has no part, so getProp() is a script error here.
    const PT_STRING =
      'PT_ItemName=' + urlEncode(dot(parts().getProp(symbol(this.weaponid)), 'namn')) + '&PT_robotid=' + lingoString(dot(G.gGameGlobals, 'userID')) + '&PT_weaponid=' + lingoString(this.weaponid);
    let js = "openMetaCharge('http://www.miniclip.com/metacharge/www/index.php?id=" + lingoString(templateid) + '&';
    js = js + PT_STRING + "','miniclipTemplate','scrollbars=no,height=580,width=440,status=yes,location=no,resizable=yes";
    js = js + ",screenx=100,screeny=100,left=100,top=100');";
    gotoNetPage('javascript:' + js);
    return pass();
  }

  mouseDown() {
    if (this.buyNow) sprite(this.spriteNum).member = member('buy btnD');
    sendSprite(the.currentSpriteNum - 1, 'mouseDown');
  }

  mouseEnter() {
    cursor(280);
    sendSprite(the.currentSpriteNum - 1, 'mouseEnter');
  }

  mouseLeave() {
    cursor(-1);
    sendSprite(the.currentSpriteNum - 1, 'mouseLeave');
  }

  endSprite() {
    sprite(the.currentSpriteNum).visible = true;
  }
}
