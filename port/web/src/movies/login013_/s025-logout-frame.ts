// login013_ behavior "logoutFrame": logs out of the server, then back to frame 1.

import { Behavior, G, go, member, put, the } from '../../director';
import { EMPTY, num, point, propList, sym, type LPropList, type LSymbol } from '../../lingo';

export class LogoutFrame extends Behavior {
  pState: LSymbol | undefined;
  myList: unknown;

  beginSprite() {
    this.pState = sym('init');
  }

  exitFrame() {
    G.gCom.checkNetMessages();
    switch (this.pState) {
      case sym('init'):
        member('gcom_STATE').text = 'Please Wait!\rLogout.';
        G.gCom.send(
          'main.asp',
          propList('action', 'logoutmember', 'sessionid', G.gLobby.prop('session'), 'uniquecode', G.gUser.uniqueCode),
          sym('done'), this, 0, propList(sym('loc'), point(554, 394)),
        );
        this.pState = sym('wait');
        break;
      case sym('nada'):
        put('logged out!');
        go(1);
        break;
    }
    go(the.frame);
  }

  done(L: LPropList) {
    if (num(L.prop('err')) === 0) member('gcom_STATE').text = EMPTY;
    else member('gcom_STATE').text = 'Unable proceed ' + String(L.prop('err'));
    this.pState = sym('nada');
  }
}
