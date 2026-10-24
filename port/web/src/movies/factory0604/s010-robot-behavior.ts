// factory0604 behavior 10 "robot behavior" (sprite 6 in the Workshop and Paintshop): the
// 3D preview of the robot in member "robot". Builds it from its parts with the chassis's
// models (robot1-3), paints it with the paint maps, spins it slowly; drag to spin it.
// #add3DPart / #remove3DPart / #updateTexture keep it in step with the workshop.

import { Behavior, cursor, rgbColor, sendAllSprites, the } from '../../director';
import { member3d, vector, type Group3D, type Shockwave3dMember } from '../../director/s3d';
import { LList, LPropList, sym, type LSymbol, type LValue } from '../../lingo';
import { InstallByggPart, UnInstallPart, updateRobotTexture } from '../robotwars/s006-3d-scripts';
import { eq } from '../robotwars/util';
import { parts, robotDesc } from './util';

/** The chassis's 3D member: robot1-3 by ram[1] (VOID for no match, as `case` leaves it). */
function chassisMember(rd: LPropList): Shockwave3dMember | undefined {
  const ram = (rd.prop('ram') as LList).getAt(1);
  if (ram === sym('r1')) return member3d('robot1');
  if (ram === sym('r2')) return member3d('robot2');
  if (ram === sym('r3')) return member3d('robot3');
  return undefined;
}

/**
 * BuildbyggRobot (a handler of this behavior, called without `me`): a group of the
 * robot's part models; weapons go where wpnPos puts them.
 */
export function BuildbyggRobot(groupName: string, robotlist: LPropList, dstMember: Shockwave3dMember, srcMember: Shockwave3dMember | undefined): Group3D {
  const rd = robotDesc();
  const suffix = eq(groupName, 'robot2') ? '2' : '';
  const botGroup = dstMember.newGroup(groupName);
  const vapen = rd.prop('vapen') as LList;
  for (const q of robotlist) {
    // Quirk: skips any entry equal to the wpnPos list (an empty wpnPos skips every
    // empty list too, which have nothing to install anyway).
    if (eq(robotlist.getaProp(sym('wpnPos')), q)) continue;
    if (q instanceof LList) {
      for (const e of q) {
        srcMember = chassisMember(rd) ?? srcMember;
        const part = parts().getProp(e);
        const plats = vapen.getOne(e);
        if (plats > 0) {
          InstallByggPart(botGroup, srcMember!, dstMember, part, suffix, (rd.prop('wpnPos') as LList).getAt(plats));
          continue;
        }
        InstallByggPart(botGroup, srcMember!, dstMember, part, suffix);
      }
      continue;
    }
    // A non-list entry (none in a robot description) is looked up as a part.
    const part = parts().getProp(q);
    const plats = vapen.getOne(q);
    if (plats > 0) {
      InstallByggPart(botGroup, srcMember!, dstMember, part, suffix, (rd.prop('wpnPos') as LList).getAt(plats));
      continue;
    }
    InstallByggPart(botGroup, srcMember!, dstMember, part, suffix);
  }
  return botGroup;
}

export class RobotBehavior extends Behavior {
  sp = 0;
  m!: Shockwave3dMember;
  robot!: Group3D;
  counter = 0;
  angle: LValue;
  dangle = 0;
  lastloch = 0;
  state: LSymbol | undefined;
  srcRobot: Shockwave3dMember | undefined;

  InitRobot() {
    this.m = member3d('robot');
    const m = this.m;
    m.resetWorld();
    const rd = robotDesc();
    if ((rd.prop('ram') as LList).count > 0) this.srcRobot = chassisMember(rd) ?? this.srcRobot;
    else this.srcRobot = member3d('robot1');
    if (!m.group('robot')) {
      this.robot = BuildbyggRobot('robot', rd, m, this.srcRobot);
      updateRobotTexture(m, this.robot, 'map1A', robotDesc(), 1, 1);
      updateRobotTexture(m, this.robot, 'map1B', robotDesc(), 2, 1);
      m.newLight('whitelight', sym('spot'));
      const whitelight = m.light('whitelight');
      whitelight.worldPosition = vector(0.0, 500.0, 1600.0);
      whitelight.color = rgbColor(255, 255, 255);
      whitelight.specular = false;
      m.camera[1].translate(0, 200, 150);
      m.camera[1].pointAt(vector(0, -50, 0), vector(0, -1, 0));
      this.robot.rotate(120, 0, 0);
      this.robot.rotate(0, 150, 0);
    } else {
      this.robot = m.group('robot');
    }
    this.dangle = 1.0;
    this.setZoom(0);
    sendAllSprites('setzoomer');
  }

  setZoom(V: number) {
    this.m = member3d('robot');
    this.m.camera[1].fieldOfView = 50 - V / 6;
  }

  add3DPart(p: LValue) {
    const rd = robotDesc();
    this.srcRobot = chassisMember(rd) ?? this.srcRobot;
    const vapen = rd.prop('vapen') as LList;
    const install = (e: LValue) => {
      const part = parts().getProp(e);
      const plats = vapen.getOne(e);
      if (plats > 0) InstallByggPart(this.robot, this.srcRobot!, this.m, part, '', (rd.prop('wpnPos') as LList).getAt(plats));
      else InstallByggPart(this.robot, this.srcRobot!, this.m, part);
    };
    if (p instanceof LList) for (const e of p) install(e);
    else install(p);
    const robot = member3d('robot');
    for (let i = robot.model.count; i >= 1; i--) if (robot.model[i].parent === undefined) robot.deleteModel(i);
  }

  remove3DPart(p: LValue) {
    if (p instanceof LList) {
      for (const e of p) UnInstallPart(this.m, parts().getProp(e));
    } else {
      UnInstallPart(this.m, parts().getProp(p));
    }
    const robot = member3d('robot');
    for (let i = robot.model.count; i >= 1; i--) if (robot.model[i].parent === undefined) robot.deleteModel(i);
  }

  findTornModelNumber() {
    for (let i = 1; i <= this.robot.child.count; i++) if (this.robot.child[i].name.toLowerCase().includes('torn')) return i;
    return undefined;
  }

  updateTexture(_name: LValue, n: LValue) {
    if (this.state === sym('wait')) return;
    // The rest of the original handler (its own shader and texture code) is dead code
    // after an `exit`.
    switch (n) {
      case 1:
        updateRobotTexture(this.m, this.robot, 'map1A', robotDesc(), 1, 1);
        break;
      case 2:
        updateRobotTexture(this.m, this.robot, 'map1B', robotDesc(), 2, 1);
        break;
    }
  }

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('preload');
  }

  mouseDown() {
    this.lastloch = the.mouseH;
    cursor(290);
    this.state = sym('drag');
  }

  mouseWithin() {
    if (!the.stillDown) cursor(260);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    this.state = sym('idle');
  }

  mouseUpOutSide() {
    this.state = sym('idle');
  }

  prepareFrame() {
    const loaded = () => member3d('robot').state === 4 && member3d('robot1').state === 4 && member3d('robot2').state === 4 && member3d('robot3').state === 4;
    const st = this.state;
    if (st === sym('preload')) {
      // preloadMember(): the port loads every member with its cast.
      this.state = sym('wait');
      if (loaded()) {
        this.InitRobot();
        this.state = sym('idle');
      }
    } else if (st === sym('wait')) {
      if (loaded()) this.state = sym('init');
    } else if (st === sym('init')) {
      this.InitRobot();
      this.state = sym('idle');
    } else if (st === sym('drag')) {
      const locH = the.mouseH;
      this.dangle = 0.5 * this.dangle + (locH - this.lastloch) / 4.0;
      this.lastloch = locH;
      this.robot.rotate(0, this.dangle, 0);
    } else if (st === sym('idle')) {
      this.counter = this.counter + 1;
      if (this.counter % 2 === 0) this.robot.rotate(0, this.dangle, 0);
      if (this.dangle > 2) this.dangle = this.dangle - 0.02;
      if (this.dangle < -2) this.dangle = this.dangle + 0.02;
      if (Math.abs(this.dangle) < 0.01) this.dangle = 0.0;
    }
  }
}

