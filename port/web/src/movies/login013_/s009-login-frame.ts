// login013_ behavior "LoginFrame" (frames "login" and "create"): logs in or creates
// a member through gCom, then goes to the robot list. With gameFixes.keepLogin a
// session kept from an earlier login skips this screen (resumeKeptLogin).

import { Behavior, G, getPref, go, gotoNetPage, member, put, setPref, sprite, the } from '../../director';
import { EMPTY, LPropList, num, point, propList, sym, type LSymbol } from '../../lingo';
import { callGlobal, dot as dget } from '../../director';
import { forgetLogin, keepLogin, keptLogin, scrolledFieldText } from '../fixes';

/** gameFixes.keepLogin: when the robot list began checking a kept login (resumeKeptLogin). */
let resumedAt: number | undefined;
let resumeTried = false;

/**
 * gameFixes.keepLogin: with a kept login, once a page, leaves what a login leaves and
 * answers true, and the caller (the first frame, before this screen is drawn) goes
 * straight to the robot list, whose getmyrobots checks the session (resumeChecked).
 */
export function resumeKeptLogin(): boolean {
  const kept = keptLogin();
  if (!kept || resumeTried) return false;
  resumeTried = true;
  G.gUrl = dget(G.gShockplay, 'info', 'gUrl');
  G.gLobby = propList(sym('miniclipid'), kept.id, sym('session'), kept.sid);
  G.gMyEmail = kept.email;
  setPref('RobotRageEmail1', kept.email);
  resumedAt = the.milliSeconds;
  return true;
}

/**
 * gameFixes.keepLogin: the robot list's answer for a resumed login (-2 for none in
 * time): true when it's alive. Otherwise back to the login screen; a dead session (18)
 * is forgotten, a failed connection keeps it for the next visit.
 */
export function resumeChecked(err: number): boolean {
  resumedAt = undefined;
  if (err === 0) return true;
  if (err === 18) forgetLogin();
  member('gcom_STATE').text = EMPTY;
  go('login');
  return false;
}

/** gameFixes.keepLogin: a resumed login's check has gone unanswered past gCom's 30 s. */
export function resumeTimedOut(): boolean {
  return resumedAt !== undefined && the.milliSeconds > resumedAt + 31000;
}

export function resumingLogin(): boolean {
  return resumedAt !== undefined;
}


export class LoginFrame extends Behavior {
  pState: LSymbol | undefined;
  pTryNum = 0;

  beginSprite() {
    G.gLobby = new LPropList();
    this.pState = sym('init');
    const a = getPref('RobotRageEmail1') ?? keptLogin()?.email ?? '';
    if (a.length < 1 && the.frameLabel === 'login') go('create');
    else member('username_box').text = a;
    member('gcom_STATE').text = EMPTY;
  }

  exitFrame() {
    G.gCom.checkNetMessages();
    switch (this.pState) {
      case sym('init'):
        this.pState = sym('done');
        break;
      case sym('CreateMember'):
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
