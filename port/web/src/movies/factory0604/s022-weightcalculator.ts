// factory0604 movie script 22 "Weightcalculator": the robot's total weight, and a
// debugging inventory with every part.

import { sendAllSprites, sendSprite } from '../../director';
import { LList, LPropList, add, lf, lingoEquals, sym, type LValue } from '../../lingo';
import { inventory, parts, propOf, robotDesc, userPL } from './util';

export function calculateMaxWeight(rd: LPropList): LValue {
  let totalWeight: LValue = 0;
  for (const q of rd) {
    if (lingoEquals(robotDesc().getaProp(sym('wpnPos')), q)) continue;
    for (const part of q as LList) {
      const r = parts().getaProp(part);
      const t = propOf(r, 'vikt');
      if (t !== undefined) totalWeight = add(totalWeight, t);
    }
  }
  if (lingoEquals(totalWeight, 0)) totalWeight = lf(0.001);
  return totalWeight;
}

export function createSuperInventory() {
  userPL().setaProp(sym('inventory'), new LList(['r1', 't1', 'r2', 't2', 'r3', 't3'].map(sym)));
  const more = ['h1', 'h2', 'h3', 'h4', 'h5', 'ma1', 'ma2', 'ma3', 'mb1', 'mb2', 'mb3', 'b1', 'b2', 'b3', 'v1', 'v2', 'v3', 'v4', 'v6', 'v7', 'v8', 'v9', 'v10',
    'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v21', 'v22', 'v23', 'v24', 'v25', 'v26', 'v31', 'v32', 'v33', 'v34', 'v35', 'v36', 'v37'];
  for (const q of more) inventory().add(sym(q));
  sendSprite(1, 'makedoktor');
  sendAllSprites('UpdateAll');
}
