// factory0604 behavior 287 "Spara" (save; unused in the score, which uses robotwars'
// Spara): saves the robot if it changed (setrobot), then its paint maps if they changed
// (setrobotmapNew), and moves on.

import { Behavior, G, dot, go, member, postNetText, put, sendAllSprites, the } from '../../director';
import { LPropList, TAB, duplicate, lingoString, sym, voidp, type LSymbol, type LValue } from '../../lingo';
import { image2text } from '../robotwars/s007-jump-movie';
import { RobotWarsReceive, RobotWarsSend, setMessage } from '../robotwars/s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from '../robotwars/s098-md5';
import { eq } from '../robotwars/util';
import { robotDesc, userPL } from './util';

export class Spara287 extends Behavior {
  state: LSymbol | undefined;
  pnetId = 0;
  wait = 0;

  beginSprite() {
    this.wait = 0;
    if (voidp(G.gSavedUserData)) this.state = sym('sendResult');
    else if (eq(G.gUserData, G.gSavedUserData)) {
      put('nothing changed in gUserData');
      this.state = sym('getMap');
    } else {
      this.state = sym('sendResult');
    }
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
      infoList.addProp('proplist', lingoString(userPL()));
      let ss = cleanSpace(lingoString(userPL()) + lingoString(dot(G.gLobby, 'session')));
      ss = StringToCapital(ss + 'md5istheshitlkasdfkhj');
      infoList.addProp('chksum', md5(ss));
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      this.state = sym('waitNet');
    } else if (st === sym('waitNet')) {
      const r = RobotWarsReceive(this.pnetId);
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
      if (userPL().getaProp(sym('saveMap'))) {
        this.state = sym('sendMap');
      } else {
        sendAllSprites('showDoorMessage', 'Your robot is saved.');
        this.state = sym('done');
        this.wait = 60;
      }
    } else if (st === sym('sendMap')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'setrobotmapNew');
      let txtdata = image2text(member('map1A').image);
      if ((robotDesc().prop('torn') as { count: number }).count > 0) txtdata = txtdata + TAB + image2text(member('map1B').image);
      infoList.addProp('map', txtdata);
      infoList.setaProp('robotid', dot(G.gGameGlobals, 'userID'));
      infoList.setaProp('robotname', dot(G.gGameGlobals, 'robotname'));
      infoList.setaProp('sessionID', dot(G.gLobby, 'session'));
      // gStartSendTime = the milliSeconds: a local here.
      const gStartSendTime: LValue = the.milliSeconds;
      void gStartSendTime;
      sendAllSprites('showDoorMessage', 'VŠnta lite...');
      put(infoList);
      this.pnetId = postNetText(lingoString(G.gUrl) + lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      this.state = sym('waitNet2');
    } else if (st === sym('waitNet2')) {
      const r = RobotWarsReceive(this.pnetId);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        this.state = sym('done');
        this.wait = 60;
      } else {
        userPL().setaProp(sym('saveMap'), 0);
        sendAllSprites('showDoorMessage', 'Your robot is saved.');
        this.state = sym('done');
        this.wait = 60;
      }
    } else if (st === sym('done')) {
      go(the.frame + 1);
    }
  }
}
