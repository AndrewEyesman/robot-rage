// factory0604 behavior 204 "PurchaseBox" (the Super Weapons page's buy buttons): saves
// the robot (setrobot), then opens the fan site's payment page for the weapon's
// template (a javascript: URL, which the port ignores), passing the click on.

import { Behavior, G, cursor, dot, gotoNetPage, pass, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { LPropList, lingoString, symbol, type LValue } from '../../lingo';
import { RobotWarsSend } from '../robotwars/s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from '../robotwars/s098-md5';
import { parts, urlEncode } from './util';

const TEMPLATES: Record<string, number> = {
  p1: 5, p2: 6, v1: 8, v9: 7, v4: 10, v16: 11, v17: 12, v3: 9, v31: 16, v32: 14, v33: 17, v34: 18, v35: 15, v36: 13,
};

export class PurchaseBox extends Behavior {
  sp = 0;
  weaponid: LValue = 'nada';
  pActive: LValue;
  pmethod: LValue = 'nada';

  mouseUp() {
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
