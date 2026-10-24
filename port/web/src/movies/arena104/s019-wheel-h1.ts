// arena104 parent script 19 "wheel h1" (initWheels puts it on the robot's sprite + 1):
// the big wheels: wide turns and little slip.

import { sprite, the } from '../../director';
import type { Group3D, Model } from '../../director/s3d';
import type { LList } from '../../lingo';
import { n, sp, world } from './util';

// global world

export class WheelH1 {
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
    this.turnRadius = 5.8;
    this.slip = 0.95;
  }

  exitFrame() {
    // Only on frame 10 (a match): in Training (frame 20) these wheels never turn.
    if (the.frame === 10 || the.frame === 10) {
      if (hasMember(this.rsp)) {
        if (sp(this.rsp, 'speed') !== undefined) {
          const k = 2 * n(sp(this.rsp, 'speed')) + 0.5 * Math.abs(n(sp(this.rsp, 'dx'))) + 0.5 * Math.abs(n(sp(this.rsp, 'dy')));
          this.modelList[0].rotate(k, 0, 0);
          this.modelList[1].rotate(k, 0, 0);
        }
      }
    }
  }
}

/** The robot's sprite still has its member (member(0, 0) is none). */
function hasMember(n0: number) {
  return !!sprite(n0).memberRef && sprite(n0).memberNum !== 0;
}
