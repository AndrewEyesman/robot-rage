// robotwars movie script 17 "Money Manager": buying and selling parts in the shop.
// Money is guarded by info1 = 1112 - money; a mismatch (a cheat) zeroes the money.

import { G, dot, member, sendAllSprites, sendSprite, setDot, the } from '../../director';
import { LList, RETURN, float, integer, lingoString, mul, num, voidp, type LValue } from '../../lingo';
import { getaPropOf } from './util';

// The script declares properties (state, Amount, withdraw, cash) though it is a movie
// script; they live on the script itself.
const self: { state: LValue; Amount: LValue; withdraw: LValue; cash: LValue } = { state: undefined, Amount: undefined, withdraw: undefined, cash: undefined };

export function createMoneySample(_me?: unknown) {
  if (voidp(G.gUserData)) {
    sendSprite(1, 'usedoktor');
    // gUserData is VOID here, so this is a script error in the original.
    setDot(G.gUserData, 'propertyList', 'money', 500);
    sendSprite(1, 'makedoktor');
  }
}

export function CashRegister(_me: unknown, num0: LValue, n: LValue) {
  self.Amount = num0;
  self.withdraw = n;
  switch (self.withdraw) {
    case 1:
      self.cash = num(self.cash) - num(self.Amount);
      break;
    case 0:
      self.cash = num(self.cash) + num(self.Amount);
      break;
  }
  return self.cash;
}

function checkInfo1() {
  if (num(dot(G.gUserData, 'propertyList', 'info1')) !== 1112 - num(dot(G.gUserData, 'propertyList', 'money'))) {
    setDot(G.gUserData, 'propertyList', 'money', 0);
    setDot(G.gUserData, 'propertyList', 'info1', 1112 - num(dot(G.gUserData, 'propertyList', 'money')));
  }
}

export function RegisterBuy(part: LValue) {
  sendSprite(1, 'usedoktor');
  if (getaPropOf(G.gPartDescription, part) === undefined) {
    const te = 'This part cannot be bought right now!';
    sendAllSprites('ShowthanksBox', te);
    return;
  }
  checkInfo1();
  const n = G.gPartDescription.getProp(part);
  if (num(dot(n, 'pris')) <= num(dot(G.gUserData, 'propertyList', 'money'))) {
    (dot(G.gUserData, 'propertyList', 'inventory') as LList).add(part);
    sendAllSprites('UpdateAll');
    setDot(G.gUserData, 'propertyList', 'money', num(dot(G.gUserData, 'propertyList', 'money')) - num(dot(n, 'pris')));
    // u = 12 * 55 * sin(1.0): unused.
    setDot(G.gUserData, 'propertyList', 'info1', 1112 - num(dot(G.gUserData, 'propertyList', 'money')));
    member('Money Stats').text = lingoString(dot(G.gUserData, 'propertyList', 'money'));
    const te = 'You have aquired the ' + lingoString(dot(n, 'namn')) + ' to the cost of ' + lingoString(dot(n, 'pris')) + ' credits.' + RETURN + RETURN + 'Go to the Workshop to add this part to your Robot.';
    sendAllSprites('ShowthanksBox', te);
    sendSprite(the.currentSpriteNum - 1, 'SetVisib', 0);
  } else {
    sendAllSprites('ShowthanksBox', "You don't have enough credits!!!" + RETURN + RETURN + 'Win credits in battles or sell/purchase your Super Weapons');
  }
  sendSprite(1, 'makedoktor');
}

export function RegisterSale(part: LValue) {
  sendSprite(1, 'usedoktor');
  const n = G.gPartDescription.getProp(part);
  checkInfo1();
  sendAllSprites('UpdateAll');
  setDot(G.gUserData, 'propertyList', 'money', num(dot(G.gUserData, 'propertyList', 'money')) + (integer(mul(float(dot(n, 'pris')), 0.90000000000000002)) ?? 0));
  // u = 11 * 55 * sin(2.0): unused.
  setDot(G.gUserData, 'propertyList', 'info1', 1112 - num(dot(G.gUserData, 'propertyList', 'money')));
  member('Money Stats').text = lingoString(dot(G.gUserData, 'propertyList', 'money'));
  sendSprite(1, 'makedoktor');
}

