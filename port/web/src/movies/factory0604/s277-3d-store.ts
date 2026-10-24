// factory0604 movie script 277 "3d store": the Buy/Sell preview's 3D, copying a part's
// models from the parts member ("tumbitar") into the preview member and centring the
// robot group on them. Also a debugging recolour of the texter cast and a table of
// weapon mass points (unused).

import { member } from '../../director';
import { vector, type Group3D, type Shockwave3dMember } from '../../director/s3d';
import { LList, LPropList, add, div, lingoString, neg, propList, sym, type LValue, type LVector } from '../../lingo';
import { castLib } from '../../director';
import { put } from '../../director';
import { propOf } from './util';

export function InstallStorePart(botGroup: Group3D, srcMember: Shockwave3dMember, dstMember: Shockwave3dMember, part: LValue) {
  if (propOf(part, 'model') === undefined) return;
  let adjustV: LVector = vector(0, 0, 0);
  const models = propOf(part, 'model') as LList;
  for (const m of models) {
    let name = lingoString(m);
    // Wheels: every pass takes the first wheel model (the others are mirrored copies).
    if (propOf(part, 'typ') === sym('hjul')) name = lingoString(models.getAt(1));
    if (srcMember.model(name) === undefined) {
      put('No model or group for this part: ' + name);
      continue;
    }
    if (dstMember.model(name) !== undefined) {
      put('Model name exists already: ' + name);
      continue;
    }
    dstMember.cloneModelFromCastmember(name, name, srcMember);
    dstMember.model(name).worldPosition = srcMember.model(name).worldPosition;
    dstMember.model(name).transform = srcMember.model(name).getWorldTransform();
    botGroup.addChild(dstMember.model(name), sym('preserveParent'));
    adjustV = add(adjustV, srcMember.model(name).worldPosition) as LVector;
  }
  adjustV = div(adjustV, models.count + 0.0001) as LVector;
  botGroup.worldPosition = neg(adjustV) as LVector;
}

export function UnInstallStorePart(dstMember: Shockwave3dMember, part: LValue) {
  if (propOf(part, 'model') === undefined) return;
  for (const name of propOf(part, 'model') as LList) dstMember.deleteModel(lingoString(name));
}

export function setcolors() {
  const texter = castLib('texter');
  for (let i = 1; i <= texter.memberCount; i++) {
    const m = member(i, 'texter');
    if ('backColor' in m) (m as { backColor: unknown }).backColor = 249;
  }
}

export function createMassPointList(): LPropList {
  const tList = new LPropList();
  const entry = (n: number, x: number, y: number, z: number) => propList(sym('modelnum'), n, sym('vectorPos'), vector(x, y, z));
  tList.addProp(sym('v2'), entry(1, 0.0611, -0.1005, 59.3431));
  tList.addProp(sym('v3'), entry(2, -54.3917, -3.9363, -0.1791));
  tList.addProp(sym('v4'), entry(2, 0, 0, 0));
  tList.addProp(sym('v5'), entry(1, 0, 0, 0));
  tList.addProp(sym('v6'), entry(1, 0, 0, 0));
  tList.addProp(sym('v7'), entry(3, 0, 0, 0));
  tList.addProp(sym('v8'), entry(1, 0, 0, 0));
  tList.addProp(sym('v9'), entry(2, 0, 0, 0));
  tList.addProp(sym('v10'), entry(1, 0, 0, 0));
  tList.addProp(sym('v11'), entry(2, 0, 0, 0));
  tList.addProp(sym('v12'), entry(4, 0, 0, 0));
  return tList;
}
