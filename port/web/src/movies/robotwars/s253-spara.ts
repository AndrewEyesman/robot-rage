// robotwars behavior 253 "Spara" (save): leaving the garage: leaves the IRC room,
// saves the robot if it changed and its paint map if needed, then drops gIRC/gRoom.

import { Behavior, G, call, dot, go, member, postNetText, put, sendAllSprites, sendSprite, the } from '../../director';
import { LPropList, TAB, duplicate, lingoString, sym, voidp, type LSymbol, type LValue } from '../../lingo';
import { image2text } from './s007-jump-movie';
import { RobotWarsReceive, RobotWarsSend, setMessage } from './s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from './s098-md5';
import { eq } from './util';
import { gameFixes } from '../fixes';

export class Spara extends Behavior {
  state: LSymbol | undefined;
  pnetId: number | undefined;
  wait = 0;

  beginSprite() {
    put('saving');
    sendSprite(1, 'usedoktor');
    if (!eq(G.gRoom, undefined)) {
      G.gLastroom = undefined;
      call('LeaveRoom', G.gRoom);
    }
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
        sendAllSprites('showDoorMessage', 'Your robot is saved.');
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
      // Only the robot's id and name in the original; the port's fix (movies/fixes.ts,
      // gameFixes.mapSession) adds the session, so the server needn't trust the address.
      if (gameFixes.mapSession) infoList.setaProp('sessionid', dot(G.gLobby, 'session'));
      // A local, as in behavior 18.
      const gStartSendTime: LValue = the.milliSeconds;
      void gStartSendTime;
      sendAllSprites('showDoorMessage', 'VŠnta lite...');
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
        (dot(G.gUserData, 'propertyList') as LPropList).setaProp(sym('saveMap'), 0);
        sendAllSprites('showDoorMessage', 'Your robot is saved.');
        this.state = sym('done');
        this.wait = 60;
      }
    } else if (st === sym('done')) {
      // The IRC connection itself stays open: gMultiuserInstanceIRC still holds it.
      G.gIRC = undefined;
      G.gRoom = undefined;
      go(the.frame + 1);
    }
  }
}
