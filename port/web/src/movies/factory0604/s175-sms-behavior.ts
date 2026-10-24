// factory0604 behavior 175 "SMS-Behavior" (unused in the score): a pay-by-SMS button
// for a special weapon. Opens the payment page through the fan site's page script
// (javascript: URLs, which the port ignores) and passes the click to sprite - 1.

import { Behavior, G, cursor, dot, gotoNetPage, put, sendSprite, the } from '../../director';
import { lingoString, symbol, type LValue } from '../../lingo';
import { eq } from '../robotwars/util';
import { parts, urlEncode } from './util';

export class SmsBehavior extends Behavior {
  sp = 0;
  weaponid: LValue = 'nada';
  pActive: LValue;
  pmethod: LValue = 'nada';

  beginSprite() {
    this.sp = this.spriteNum;
    const on = (feature: string) => (eq(dot(G.gVersionList, feature, 'version'), '1') ? 1 : 0);
    switch (lingoString(this.weaponid)) {
      case 'v3':
      case 'v1':
        this.pActive = on('minor');
        break;
      case 'v4':
        this.pActive = on('grk');
        break;
      case 'v9':
        this.pActive = on('klo');
        break;
      case 'v16':
        this.pActive = on('raketer');
        break;
      case 'v17':
        this.pActive = on('missiler');
        break;
      case 'p1':
        this.pActive = 1;
        break;
    }
  }

  mouseEnter() {
    if (this.pActive) cursor(280);
  }

  mouseLeave() {
    if (this.pActive) cursor(-1);
    sendSprite(the.currentSpriteNum - 1, 'mouseLeave');
  }

  endSprite() {
    if (this.pActive) cursor(-1);
  }

  mouseDown() {
    sendSprite(the.currentSpriteNum - 1, 'mouseDown');
  }

  mouseUp() {
    const PT_STRING =
      'PT_ItemName=' + urlEncode(dot(parts().getProp(symbol(this.weaponid)), 'namn')) + '&PT_robotid=' + lingoString(dot(G.gGameGlobals, 'userID')) + '&PT_weaponid=' + lingoString(this.weaponid);
    const page = (n: string) =>
      `openMetaCharge('http://engine.metacharge.com/templates/miniclip/${n}/?product=miniclip0040&aff=raketspel&` +
      PT_STRING +
      `','miniclip${n}','scrollbars=no,height=420,width=460,status=yes,location=no,resizable=yes` +
      ",screenx=100,screeny=100,left=100,top=100');";
    let js: LValue;
    switch (lingoString(this.pmethod)) {
      case 'SMS1':
        js = page('0040');
        break;
      case 'SMS5':
        js = page('0041');
        break;
      case 'MCPE5':
        js = page('0043');
        break;
      case 'IVR5':
        js = page('0044');
        break;
    }
    const strU = 'javascript:' + lingoString(js);
    gotoNetPage(strU);
    put(strU);
    sendSprite(the.currentSpriteNum - 1, 'mouseUp');
  }
}
