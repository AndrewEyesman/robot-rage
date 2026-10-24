// lobby060_ behavior 50 "Spara" (save; not in the score, the door frames use
// robotwars' version): saves the robot if it changed and its paint map if needed.

import { Behavior, G, dot, go, member, postNetText, put, sendAllSprites, the } from '../../director';
import { LPropList, TAB, duplicate, lingoString, sym, voidp, type LSymbol } from '../../lingo';
import { image2text } from '../robotwars/s007-jump-movie';
import { RobotWarsReceive, RobotWarsSend, setMessage } from '../robotwars/s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from '../robotwars/s098-md5';
import { eq } from './util';

export class Spara50 extends Behavior {
  state: LSymbol | undefined;
  pnetId: number | undefined;
  wait = 0;

  beginSprite() {
    sendAllSprites('usedoktor');
    put('saving');
    this.wait = 0;
    const pl = dot(G.gUserData, 'propertyList') as LPropList;
    if (Number(dot(pl, 'info1')) !== 1112 - Number(dot(pl, 'money'))) {
      pl.setaProp(sym('money'), 0);
      pl.setaProp(sym('info1'), 1112 - Number(dot(pl, 'money')));
    }
    if (voidp(G.gSavedUserData)) this.state = sym('sendResult');
    else if (eq(G.gUserData, G.gSavedUserData)) {
      put('nothing changed in gUserData');
      this.state = sym('getMap');
    } else {
      this.state = sym('sendResult');
    }
    sendAllSprites('makedoktor');
  }

  exitFrame() {
    go(the.frame);
    if (this.wait > 0) {
      this.wait = this.wait - 1;
      return;
    }
    const st = this.state;
    if (st === sym('sendResult')) {
      setMessage('Sparar', 0, 3 * 30);
      const infoList = new LPropList();
      infoList.addProp('action', 'setrobot');
      infoList.addProp('proplist', lingoString(dot(G.gUserData, 'propertyList')));
      let ss = cleanSpace(lingoString(dot(G.gUserData, 'propertyList')) + lingoString(dot(G.gLobby, 'session')));
      ss = StringToCapital(ss + 'md5istheshitlkasdfkhj');
      infoList.addProp('chksum', md5(ss));
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      this.state = sym('waitNet');
    } else if (st === sym('waitNet')) {
      const r = RobotWarsReceive(this.pnetId!);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        this.state = sym('done');
        this.wait = 60;
      } else {
        this.state = sym('getMap');
        G.gSavedUserData = duplicate(G.gUserData);
      }
    } else if (st === sym('getMap')) {
      if ((dot(G.gUserData, 'propertyList') as LPropList).getaProp(sym('saveMap'))) {
        this.state = sym('sendMap');
      } else {
        sendAllSprites('showDoorMessage', 'Din robot är sparad.');
        this.state = sym('done');
        this.wait = 60;
      }
    } else if (st === sym('sendMap')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'setrobotmap');
      let txtdata = image2text(member('map1A').image);
      if ((dot(G.gUserData, 'propertyList', 'robotDescription', 'torn')?.count ?? 0) > 0) txtdata = txtdata + TAB + image2text(member('map1B').image);
      infoList.addProp('map', txtdata);
      infoList.setaProp('robotid', dot(G.gGameGlobals, 'userID'));
      infoList.setaProp('robotname', dot(G.gGameGlobals, 'robotname'));
      // gStartSendTime = the milliSeconds: a local.
      sendAllSprites('showDoorMessage', 'Vänta lite...');
      this.pnetId = postNetText(lingoString(G.gUrl) + lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      this.state = sym('waitNet2');
    } else if (st === sym('waitNet2')) {
      const r = RobotWarsReceive(this.pnetId!);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        this.state = sym('done');
        this.wait = 60;
      } else {
        sendAllSprites('usedoktor');
        (dot(G.gUserData, 'propertyList') as LPropList).setaProp(sym('saveMap'), 0);
        sendAllSprites('showDoorMessage', 'Din robot är sparad.');
        this.state = sym('done');
        this.wait = 60;
        sendAllSprites('makedoktor');
      }
    } else if (st === sym('done')) {
      go(the.frame + 1);
    }
  }
}
