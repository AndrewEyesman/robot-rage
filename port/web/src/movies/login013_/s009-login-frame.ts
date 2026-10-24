// login013_ behavior "LoginFrame" (frames "login" and "create"): logs in or creates
// a member through gCom, then goes to the robot list.

import { Behavior, G, getPref, go, gotoNetPage, member, put, setPref, sprite, the } from '../../director';
import { EMPTY, LPropList, num, point, propList, sym, type LSymbol } from '../../lingo';
import { callGlobal, dot as dget } from '../../director';


export class LoginFrame extends Behavior {
  pState: LSymbol | undefined;
  pTryNum = 0;

  beginSprite() {
    G.gLobby = new LPropList();
    this.pState = sym('init');
    const a = getPref('RobotRageEmail1') ?? '';
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
        G.gMyEmail = member('username_box').text;
        setPref('RobotRageEmail1', member('username_box').text);
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
          put('skicka mail' + member('username_box').text);
          const tjola = 'http://i.mb00.net/cgi-bin/pmg_subscribe.pl?list=Miniclip&sublist=37&email_address=' + member('username_box').text;
          gotoNetPage(`JavaScript:subscribeToNewsletter('${tjola}');`);
        }
        G.gLobby.setaProp(sym('miniclipid'), L.prop('id'));
        G.gLobby.setaProp(sym('session'), L.prop('sid'));
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
        propList('action', 'loginmember', 'password', member('visiblePassword').text, 'membername', member('username_box').text, 'uniquecode', G.gUser.uniqueCode),
        sym('done'), this, 0, propList(sym('loc'), point(554, 394)),
      );
      this.pState = sym('wait');
    }
  }

  CreateMember() {
    if (this.pState === sym('done')) {
      put('CreateMember');
      const tEmail = member('username_box').text;
      if (!callGlobal('isAnEmailAddress', tEmail)) {
        member('gcom_STATE').text = 'Not a proper email address!';
      } else {
        member('gcom_STATE').text = 'Please Wait! Creating member';
        G.gCom.send(
          'main.asp',
          propList('action', 'createmember', 'password', member('visiblePassword').text, 'membername', member('username_box').text, 'uniquecode', G.gUser.uniqueCode),
          sym('done'), this, 0, propList(sym('loc'), point(554, 394)),
        );
        this.pState = sym('wait');
      }
    }
  }
}
