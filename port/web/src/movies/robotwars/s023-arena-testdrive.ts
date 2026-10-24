// robotwars behavior 23 "Arena_Testdrive": goes to a marker (on mouseUp or exitFrame)
// only if the robot has a chassis, wheels, engine and battery; otherwise says what's
// missing through sprite 84 (#buildMess).

import { Behavior, G, cursor, dot, go, rollover, sendAllSprites, sendSprite, the } from '../../director';
import { LList, LPropList, propList, sym, type LSymbol, type LValue } from '../../lingo';

export class ArenaTestdrive extends Behavior {
  newFrame: LValue;
  sp = 0;
  onEvent: LSymbol | undefined;
  pActive: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    if (this.onEvent === sym('mouseUp')) if (rollover(this.sp)) cursor(280);
    this.pActive = 1;
  }

  Activate(q: LValue) {
    this.pActive = q;
  }

  private check(order: string[]) {
    let missing: LValue = 0;
    const rd = dot(G.gUserData, 'propertyList', 'robotDescription') as LPropList;
    for (const q of order) {
      const L = rd.getaProp(sym(q)) as LList;
      if (L.count === 0) missing = sym(q);
    }
    if (missing === 0) {
      go(this.newFrame as string);
      sendAllSprites('refresh');
    } else if (missing === sym('ram')) sendSprite(84, 'buildMess', 'Your robot has no chassi.', sym('flash2'));
    else if (missing === sym('hjul')) sendSprite(84, 'buildMess', 'Your robot has no wheels.', sym('flash2'));
    else if (missing === sym('motor')) sendSprite(84, 'buildMess', 'Your robot has no engine.', sym('flash2'));
    else if (missing === sym('batteri')) sendSprite(84, 'buildMess', 'Your robot has no battery', sym('flash2'));
  }

  exitFrame() {
    if (this.onEvent === sym('exitFrame')) this.check(['ram', 'hjul', 'motor', 'batteri']);
  }

  mouseUp() {
    if (!this.pActive) return;
    if (this.sp !== the.clickOn) return;
    if (this.onEvent === sym('mouseUp')) this.check(['batteri', 'motor', 'hjul', 'ram']);
  }

  mouseEnter() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(280);
  }

  mouseLeave() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(-1);
  }

  endSprite() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(-1);
  }

  getPropertyDescriptionList() {
    return propList(
      sym('onEvent'), propList(sym('comment'), 'on:', sym('format'), sym('symbol'), sym('default'), sym('mouseUp'), sym('range'), new LList([sym('mouseUp'), sym('exitFrame')])),
      sym('newFrame'), propList(sym('comment'), 'go to marker:', sym('format'), sym('marker'), sym('default'), ''),
    );
  }
}
