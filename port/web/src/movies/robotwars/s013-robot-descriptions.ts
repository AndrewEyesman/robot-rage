// robotwars movie script 13 "robot descriptions": a sample robot, and the robot's
// weight, speed and space from its parts (gPartDescription).

import { G, dot, put } from '../../director';
import { EMPTY, LList, LPropList, add, concatSpace, div, le, lf, num, propList, sym, type LValue } from '../../lingo';
import { eq, getaPropOf } from './util';

export function createRobotSample2(): LPropList {
  const rd = propList(
    sym('ram'), new LList([sym('r3')]), sym('torn'), new LList([sym('t1')]), sym('hjul'), new LList([sym('h5')]), sym('motor'), new LList([sym('ma1')]),
    sym('batteri'), new LList([sym('b2')]), sym('vapen'), new LList([sym('v2'), sym('v11'), sym('v6')]), sym('wpnPos'), new LList([sym('f'), sym('t'), sym('b')]),
    sym('special'), new LList(), sym('ammunition'), new LList(),
  );
  const pl = propList(
    sym('robotDescription'), rd, sym('inventory'), new LList([sym('t2'), sym('v12'), sym('v10'), sym('v2'), sym('v3'), sym('v6')]), sym('money'), 1200,
    sym('space'), 100, sym('spaceleft'), 10, sym('maxSpeed'), 40, sym('pansar'), 80, sym('info1'), 1112 - 1200,
  );
  const userData = propList(sym('robotid'), 16, sym('robotname'), 'player2', sym('score'), 0, sym('propertyList'), pl);
  return userData;
}

/** The parts of each slot (the weapon positions don't count), plus the armour / 1.5. */
export function calculateUsedWeight(rd: LPropList): LValue {
  let usedWeight: LValue = 0;
  for (const q of rd) {
    if (eq(dot(G.gUserData, 'propertyList', 'robotDescription', 'wpnPos'), q)) continue;
    for (const part of q as LList) {
      const r = getaPropOf(G.gPartDescription, part);
      if (!eq(r, undefined)) {
        const t = getaPropOf(r, sym('vikt'));
        if (!eq(t, undefined)) usedWeight = add(usedWeight, t);
        continue;
      }
      put(concatSpace(concatSpace(EMPTY, part), 'har ingen vikt'));
    }
  }
  const p = div(dot(G.gUserData, 'propertyList', 'pansar'), lf(1.5));
  usedWeight = add(usedWeight, p);
  return usedWeight;
}

export function calculateMaxSpeed(vikt: LValue, motor: LValue): LValue {
  let k: number | undefined;
  switch (motor) {
    case sym('ma1'):
      k = 1.5;
      break;
    case sym('ma2'):
      k = 1.0;
      break;
    case sym('ma3'):
      k = 0.5;
      break;
    case sym('mb1'):
      k = 0.25;
      break;
    case sym('mb2'):
      k = 0.20000000000000001;
      break;
    case sym('mb3'):
      k = 0.10000000000000001;
      break;
  }
  let speed: LValue = lf(1.0 - ((k ?? 0) * num(vikt)) / 150.0);
  if (num(speed) > 1) speed = lf(1.0);
  if (num(speed) < 0) speed = 0;
  return speed;
}

/** Space from the chassis and tower (0.001 when there is none). */
export function calculateMaxSpace(rd: LPropList): LValue {
  let totalspace: LValue = 0;
  for (const q of rd) {
    if (eq(dot(G.gUserData, 'propertyList', 'robotDescription', 'wpnPos'), q)) continue;
    for (const part of q as LList) {
      const r = getaPropOf(G.gPartDescription, part);
      if (dot(r, 'typ') === sym('ram') || dot(r, 'typ') === sym('torn')) totalspace = add(totalspace, getaPropOf(r, sym('utrymme')));
    }
  }
  if (eq(totalspace, 0)) totalspace = lf(0.001);
  return totalspace;
}

/** Space the other parts take (everything but chassis, tower and wheels). */
export function CalculateUsedSpace(rd: LPropList): LValue {
  let usedSpace: LValue = 0;
  for (const q of rd) {
    if (eq(dot(G.gUserData, 'propertyList', 'robotDescription', 'wpnPos'), q)) continue;
    for (const part of q as LList) {
      const r = getaPropOf(G.gPartDescription, part);
      const typ = dot(r, 'typ');
      if (typ !== sym('ram') && typ !== sym('torn') && typ !== sym('hjul')) usedSpace = add(usedSpace, getaPropOf(r, sym('utrymme')));
    }
  }
  return usedSpace;
}

export function EnoughRoomForPart(rd: LPropList, part: LValue): boolean {
  const r = getaPropOf(G.gPartDescription, part);
  let t = getaPropOf(r, sym('utrymme'));
  if (eq(t, undefined)) t = 0;
  return le(add(CalculateUsedSpace(rd), t), calculateMaxSpace(rd));
}
