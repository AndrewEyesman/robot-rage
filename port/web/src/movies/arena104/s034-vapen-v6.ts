// arena104 behavior 34 "vapen v6": the plough, a passive part. Its sprite follows the
// robot on the hidden map (front or back member by where it's mounted), and it's in
// gPlog, the list of sprites that sweep away mines, nails and discs.

import { G, member, sprite } from '../../director';
import { LList, propList, sym, vector, type LSymbol } from '../../lingo';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { eq, sp } from './weapon-util';

// global gPartDescription, world, gRobot1, gRobot2, gPlog

export class VapenV6 {
  state: LSymbol;
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  counter: number;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    const middlepoint = vector(5.56, -44.72, -5.0);
    void middlepoint;
    this.state = sym('idle');
    this.counter = 0;
    (G.gPlog as LList).add(propList(sym('sp'), this.sp, sym('robotSp'), this.robotSp));
    sprite(this.sp).ink = 8;
    this.state = sym('init');
  }

  prepareFrame() {
    switch (this.state) {
      case sym('init'):
        if (eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v6')), sym('f'))) {
          sprite(this.sp).member = member('v6 f', 1);
        } else {
          sprite(this.sp).member = member('v6 b', 1);
        }
        this.state = sym('idle');
        break;
      case sym('idle'): {
        const angle = sprite(this.robotSp).rotation;
        sprite(this.sp).loc = sprite(this.robotSp).loc;
        sprite(this.sp).rotation = angle + 90;
        break;
      }
    }
  }
}
