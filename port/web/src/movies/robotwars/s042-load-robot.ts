// robotwars behavior 42 "load robot": fetches the robot (getrobot), checks its MD5,
// fills in defaults (an empty robot, ircrobotname, weapons bought by SMS), and, when
// #loadmap is set, its paint map (getrobotmap).

import { Behavior, G, dot, go, member, netDone, netError, netTextResult, put, sendSprite, the } from '../../director';
import {
  LList, LPropList, RETURN, TAB, duplicate, item, itemCount, lingoString, setItemDelimiter, sym, value, type LSymbol, type LValue,
} from '../../lingo';
import { formatInternalUserName } from './s004-new-init';
import { text2image } from './s007-jump-movie';
import { clearRobotProplist } from './s011-purl';
import { HideMessage, RobotWarsReceive, RobotWarsSend, setMessage } from './s019-net-lingo';
import { cleanSpace, md5, StringToCapital } from './s098-md5';
import { eq } from './util';

export class LoadRobot extends Behavior {
  state: LSymbol | undefined;
  pnetId: number | undefined;
  wait = 0;
  loadmap: LValue;

  beginSprite() {
    this.wait = 0;
    this.state = sym('init');
    put('load robot');
  }

  /** propertyList = [] or no robotDescription: start from the empty robot (and save its map). */
  private defaults() {
    const ud = G.gUserData as LPropList;
    if (eq(dot(ud, 'propertyList'), new LList())) {
      ud.setaProp(sym('propertyList'), clearRobotProplist());
      (dot(ud, 'propertyList') as LPropList).setaProp(sym('saveMap'), 1);
    } else if (eq(dot(ud, 'propertyList', 'robotDescription'), new LList())) {
      ud.setaProp(sym('propertyList'), clearRobotProplist());
      (dot(ud, 'propertyList') as LPropList).setaProp(sym('saveMap'), 1);
    } else {
      (dot(ud, 'propertyList') as LPropList).setaProp(sym('saveMap'), 0);
    }
  }

  exitFrame() {
    go(the.frame);
    if (this.wait > 0) this.wait = this.wait - 1;
    const st = this.state;
    if (st === sym('init')) {
      G.gUserData = undefined;
      this.state = sym('send');
    } else if (st === sym('send')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'getrobot');
      put(infoList);
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      setMessage('HŠmtar robot..', 0, 3000);
      this.state = sym('waitNet');
    } else if (st === sym('waitNet')) {
      const r = RobotWarsReceive(this.pnetId!);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        put('time out');
        this.state = sym('error');
        this.wait = 60;
      } else {
        const L = value(r) as LPropList;
        let ss = cleanSpace(lingoString(dot(L, 'propertyList')) + lingoString(dot(L, 'friendslist')) + lingoString(dot(L, 'GameStats')));
        ss = StringToCapital(ss + 'md5istheshitlkasdfkhj');
        if (!eq(dot(r, 'checksum'), md5(ss))) {
          put('BAD SHIT!' + RETURN);
        } else {
          put('checksum is OK' + RETURN);
          G.gUserData = L;
          const ud = L;
          this.defaults();
          if (ud.getaProp(sym('ircrobotname')) === undefined) {
            put('ircrobotname lŠggs till');
            ud.addProp(sym('ircrobotname'), formatInternalUserName(dot(G.gGameGlobals, 'robotname')));
          } else {
            put('ircrobotname fanns');
          }
          // smsweapons = [#v1, #v4, #v9, #v16, #v17]: unused.
          const boughtWeapons = duplicate(dot(ud, 'friendslist')) as LList;
          const pl = dot(ud, 'propertyList') as LPropList;
          if (pl.getaProp(sym('soldweapons')) === undefined) pl.setaProp(sym('soldweapons'), new LList());
          const sold = dot(pl, 'soldweapons') as LList;
          for (let i = 1; i <= sold.count; i++) {
            const n = boughtWeapons.getPos(sold.getAt(i));
            if (n > 0) boughtWeapons.deleteAt(n);
          }
          for (const q of dot(pl, 'robotDescription', 'vapen') as LList) {
            const n = boughtWeapons.getPos(q);
            if (n > 0) boughtWeapons.deleteAt(n);
          }
          for (const q of dot(pl, 'inventory') as LList) {
            const n = boughtWeapons.getPos(q);
            if (n > 0) boughtWeapons.deleteAt(n);
          }
          for (const q of boughtWeapons) (dot(pl, 'inventory') as LList).add(q);
          if (pl.getaProp(sym('info1')) === undefined) pl.setaProp(sym('info1'), 1112 - Number(dot(pl, 'money')));
          if (Number(dot(pl, 'info1')) !== 1112 - Number(dot(pl, 'money'))) {
            pl.setaProp(sym('money'), 0);
            pl.setaProp(sym('info1'), 1112 - Number(dot(pl, 'money')));
          }
          G.gSavedUserData = duplicate(G.gUserData);
          if (this.loadmap) this.state = sym('requestMap');
          else this.state = sym('finished');
          ud.addProp(sym('robotid'), dot(G.gGameGlobals, 'userID'));
          sendSprite(1, 'makedoktor');
        }
      }
    } else if (st === sym('requestMap')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'getrobotmap');
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      setMessage('HŠmtar robot...', 0, 23000);
      this.state = sym('waitMap');
    } else if (st === sym('waitMap')) {
      if (netDone(this.pnetId)) {
        const err = netError(this.pnetId);
        const txtdata = netTextResult(this.pnetId);
        if (eq(err, 'OK')) {
          setItemDelimiter(TAB);
          text2image(member('map1A').image, item(txtdata, 1));
          if (itemCount(txtdata) > 1) text2image(member('map1B').image, item(txtdata, 2));
          this.state = sym('done');
          this.wait = 60;
        } else {
          setMessage('Kunde inte ansluta till servern. (' + lingoString(err) + ')', 0, 5000);
          this.state = sym('error');
        }
      }
    } else if (st === sym('done')) {
      sendSprite(1, 'usedoktor');
      this.defaults();
      sendSprite(1, 'makedoktor');
      HideMessage();
      go(the.frame + 1);
    } else if (st === sym('finished')) {
      if (eq(dot(G.gUserData, 'propertyList'), new LList())) (G.gUserData as LPropList).setaProp(sym('propertyList'), clearRobotProplist());
      sendSprite(1, 'makedoktor');
      HideMessage();
      go(the.frame + 1);
    } else if (st === sym('error')) {
      go(1);
    }
  }
}
