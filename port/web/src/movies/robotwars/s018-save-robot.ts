// robotwars behavior 18 "save robot": saves the robot (setrobot, with the MD5 of its
// property list and the session) and then its paint map if it changed (setrobotmap).

import { Behavior, G, dot, go, member, postNetText, sendSprite, the } from '../../director';
import { LPropList, TAB, duplicate, lingoString, sym, type LSymbol, type LValue } from '../../lingo';
import { image2text } from './s007-jump-movie';
import { RobotWarsReceive, RobotWarsSend, setMessage } from './s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from './s098-md5';

export class SaveRobot extends Behavior {
  state: LSymbol | undefined;
  pnetId: number | undefined;
  wait = 0;

  beginSprite() {
    sendSprite(1, 'usedoktor');
    this.wait = 0;
    this.state = sym('sendResult');
  }

  exitFrame() {
    go(the.frame);
    if (this.wait > 0) {
      this.wait = this.wait - 1;
      return;
    }
    const st = this.state;
    if (st === sym('sendResult')) {
      G.muInstance = 0;
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
      } else if ((dot(G.gUserData, 'propertyList') as LPropList).getaProp(sym('saveMap'))) {
        this.state = sym('sendMap');
      } else {
        setMessage('Your robot is saved.', 0, 3000);
        G.gSavedUserData = duplicate(G.gUserData);
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
      // A local here (no `global gStartSendTime`), so RobotWarsReceive's 20 s timeout
      // still counts from the last RobotWarsSend.
      const gStartSendTime: LValue = the.milliSeconds;
      void gStartSendTime;
      setMessage('Kontaktar servern...', 5000);
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
        sendSprite(1, 'usedoktor');
        (dot(G.gUserData, 'propertyList') as LPropList).setaProp(sym('saveMap'), 0);
        setMessage('Your robot is saved.', 0, 3000);
        sendSprite(1, 'makedoktor');
        this.state = sym('done');
        this.wait = 60;
      }
    } else if (st === sym('done')) {
      go(the.frame + 1);
    }
  }
}
