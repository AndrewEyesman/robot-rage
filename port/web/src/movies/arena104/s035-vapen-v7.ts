// arena104 behavior 35 "vapen v7": the spike, a passive part. Its sprite follows the
// robot; ramming the other robot with it bounces both and does the part's damage (at
// most every 400 ms, shared with every other hit through gLastHitTime).

import { G, dot, intersects, member, sendSprite, sprite, the } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { eq, sp } from './weapon-util';

// global gPartDescription, world, gRobot1, gRobot2, gLastHitTime

export class VapenV7 {
  state: LSymbol;
  n: LValue = undefined;
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
    sprite(this.sp).ink = 8;
    this.state = sym('init');
    this.counter = 0;
  }

  fire(_buttondown?: LValue) {
    // nothing()
  }

  prepareFrame() {
    const angle = sprite(this.robotSp).rotation;
    sprite(this.sp).loc = sprite(this.robotSp).loc;
    sprite(this.sp).rotation = angle + 90;
    const hitrobot = intersects(this.sp, this.robot2Sp);
    switch (this.state) {
      case sym('init'): {
        let suffix = '1';
        if (this.robotNumber === 2) {
          suffix = '2';
        }
        void suffix;
        if (eq(monteringsplats(sp(this.robotSp, 'robotRD'), sym('v7')), sym('f'))) {
          sprite(this.sp).member = member('v11 f', 1);
        } else {
          sprite(this.sp).member = member('v11 b', 1);
        }
        this.state = sym('idle');
        break;
      }
      case sym('idle'):
        break;
    }
    if (hitrobot) {
      if (!eq(sp(this.robot2Sp, 'state'), sym('slow'))) {
        const dx10 = sp(this.robotSp, 'dx');
        const dy10 = sp(this.robotSp, 'dy');
        const angle10 = sp(this.robotSp, 'angle');
        const speed10 = sp(this.robotSp, 'speed');
        sendSprite(this.robotSp, 'hit', sp(this.robot2Sp, 'dx'), sp(this.robot2Sp, 'dy'), sp(this.robot2Sp, 'angle'), sp(this.robot2Sp, 'speed'));
        sendSprite(this.robot2Sp, 'hit', dx10, dy10, angle10, speed10);
        if (the.milliSeconds > G.gLastHitTime + 400) {
          playsound('krock_m_pik', 255);
          sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v7', 'skada'), sym('nothing'));
          G.gLastHitTime = the.milliSeconds;
        }
      }
    }
  }
}
