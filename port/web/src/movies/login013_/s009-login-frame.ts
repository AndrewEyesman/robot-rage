// login013_ behavior "LoginFrame" (frames "login" and "create"): logs in or creates
// a member through gCom, then goes to the robot list. With gameFixes.keepLogin a
// session kept from an earlier login goes straight to the robot list while it's alive.

import { Behavior, G, getPref, go, gotoNetPage, member, put, setPref, sprite, the } from '../../director';
import { EMPTY, LPropList, num, point, propList, sym, type LSymbol } from '../../lingo';
import { callGlobal, dot as dget } from '../../director';
import { forgetLogin, keepLogin, keptLogin, scrolledFieldText, type KeptLogin } from '../fixes';


export class LoginFrame extends Behavior {
  pState: LSymbol | undefined;
  pTryNum = 0;
  /** gameFixes.keepLogin: the kept login being checked, and since when. */
  pKept: KeptLogin | undefined;
  pKeptSince = 0;

  beginSprite() {
    G.gLobby = new LPropList();
    this.pState = sym('init');
    const kept = keptLogin();
    const a = getPref('RobotRageEmail1') ?? kept?.email ?? '';
    if (a.length < 1 && the.frameLabel === 'login') go('create');
    else member('username_box').text = a;
    member('gcom_STATE').text = EMPTY;
    if (kept) this.resume(kept);
  }

  /** gameFixes.keepLogin: check the kept session with the server (getmyrobots answers 18 for a dead one). */
  private resume(kept: KeptLogin) {
    G.gUrl = dget(G.gShockplay, 'info', 'gUrl');
    member('gcom_STATE').text = 'Please Wait!';
    G.gCom.send(
      'main.asp',
      propList('action', 'getmyrobots', 'sessionid', kept.sid, 'uniquecode', G.gUser.uniqueCode),
      sym('resumed'), this, 0, propList(sym('loc'), point(554, 394)),
    );
    this.pKept = kept;
    this.pKeptSince = the.milliSeconds;
    this.pState = sym('resume');
  }

  resumed(L: LPropList) {
    if (this.pState !== sym('resume') || !this.pKept) return;
    const err = num(L.prop('err'));
    if (err === 0) {
      G.gLobby.setaProp(sym('miniclipid'), this.pKept.id);
      G.gLobby.setaProp(sym('session'), this.pKept.sid);
      this.pState = sym('resumed');
      return;
    }
    // A dead session is forgotten; a failed connection keeps it for the next visit.
    if (err === 18) forgetLogin();
    this.pKept = undefined;
    member('gcom_STATE').text = EMPTY;
    this.pState = sym('done');
  }

  exitFrame() {
    G.gCom.checkNetMessages();
    switch (this.pState) {
      case sym('init'):
        this.pState = sym('done');
        break;
      case sym('CreateMember'):
        break;
      case sym('resume'):
        // gCom drops a request unanswered after 30 s: log in by hand then.
        if (the.milliSeconds > this.pKeptSince + 31000) this.resumed(propList(sym('err'), -2));
        break;
      case sym('resumed'):
        G.gMyEmail = this.pKept!.email;
        setPref('RobotRageEmail1', this.pKept!.email);
        go('listrobots');
        break;
      case sym('listRobots'):
        G.gMyEmail = scrolledFieldText('username_box');
        setPref('RobotRageEmail1', scrolledFieldText('username_box'));
        go('listrobots');
        break;
      case sym('logout'):
        go('logout');
        break;
    }
    go(the.frame);
  }

  logout() {
    this.pState = sym('logout');
  }

  done(L: LPropList) {
    switch (num(L.prop('err'))) {
      case 0:
        if (sprite(11).visible && the.frameLabel === 'create') {
          put('skicka mail' + scrolledFieldText('username_box'));
          const tjola = 'http://i.mb00.net/cgi-bin/pmg_subscribe.pl?list=Miniclip&sublist=37&email_address=' + scrolledFieldText('username_box');
          gotoNetPage(`JavaScript:subscribeToNewsletter('${tjola}');`);
        }
        G.gLobby.setaProp(sym('miniclipid'), L.prop('id'));
        G.gLobby.setaProp(sym('session'), L.prop('sid'));
        keepLogin(L.prop('sid'), L.prop('id'), scrolledFieldText('username_box'));
        this.pState = sym('listRobots');
        break;
      case -1:
        member('gcom_STATE').text = 'Not a valid email/password! ';
        this.pState = sym('done');
        break;
      case -2:
        this.pTryNum = this.pTryNum + 1;
        this.pState = this.pTryNum < 2 ? sym('send') : sym('done');
        break;
      case -3:
      case -100:
        this.pState = sym('done');
        break;
      case -103:
        member('gcom_STATE').text = 'Email already taken! ';
        this.pState = sym('done');
        break;
      default:
        member('gcom_STATE').text = 'Unable proceed ' + String(L.prop('err'));
        this.pState = sym('done');
    }
  }

  login() {
    if (this.pState === sym('done')) {
      put('login');
      G.gUrl = dget(G.gShockplay, 'info', 'gUrl');
      member('gcom_STATE').text = 'Please Wait!';
      G.gCom.send(
        'main.asp',
        propList('action', 'loginmember', 'password', member('visiblePassword').text, 'membername', scrolledFieldText('username_box'), 'uniquecode', G.gUser.uniqueCode),
        sym('done'), this, 0, propList(sym('loc'), point(554, 394)),
      );
      this.pState = sym('wait');
    }
  }

  CreateMember() {
    if (this.pState === sym('done')) {
      put('CreateMember');
      const tEmail = scrolledFieldText('username_box');
      if (!callGlobal('isAnEmailAddress', tEmail)) {
        member('gcom_STATE').text = 'Not a proper email address!';
      } else {
        member('gcom_STATE').text = 'Please Wait! Creating member';
        G.gCom.send(
          'main.asp',
          propList('action', 'createmember', 'password', member('visiblePassword').text, 'membername', scrolledFieldText('username_box'), 'uniquecode', G.gUser.uniqueCode),
          sym('done'), this, 0, propList(sym('loc'), point(554, 394)),
        );
        this.pState = sym('wait');
      }
    }
  }
}
