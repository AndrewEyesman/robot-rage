// arena104 parent script 21 "wheel h3" (initWheels puts it on the robot's sprite + 1):
// six wheels: the tightest turns and the most slip.

import { sprite } from '../../director';
import type { Group3D, Model } from '../../director/s3d';
import type { LList } from '../../lingo';
import { n, sp, world } from './util';

// global world

export class WheelH3 {
  robot: Group3D;
  rsp: number;
  modelList: Model[];
  turnRadius: number;
  slip: number;

  constructor(robot0: Group3D, rsp0: number, L: LList, rn: number) {
    this.robot = robot0;
    this.modelList = [];
    this.rsp = rsp0;
    let suffix = '1';
    if (rn === 2) {
      suffix = '2';
    }
    for (const mname of L) {
      const tmodel = world().model(String(mname) + suffix);
      if (tmodel !== undefined) {
        this.modelList.push(world().model(String(mname) + suffix));
      }
    }
    this.turnRadius = 1.5;
    this.slip = 0.5;
  }

  exitFrame() {
    if (hasMember(this.rsp)) {
      if (sp(this.rsp, 'speed') !== undefined) {
        const k = 2 * n(sp(this.rsp, 'speed')) + 0.5 * Math.abs(n(sp(this.rsp, 'dx'))) + 0.5 * Math.abs(n(sp(this.rsp, 'dy')));
        this.modelList[0].rotate(k, 0, 0);
        this.modelList[1].rotate(k, 0, 0);
        this.modelList[2].rotate(k, 0, 0);
        this.modelList[3].rotate(k, 0, 0);
        this.modelList[4].rotate(k, 0, 0);
        this.modelList[5].rotate(k, 0, 0);
        // After this return the original steers the front wheels by dangle (never reached).
        return;
      }
    }
  }
}

/** The robot's sprite still has its member (member(0, 0) is none). */
function hasMember(n0: number) {
  return !!sprite(n0).memberRef && sprite(n0).memberNum !== 0;
}
