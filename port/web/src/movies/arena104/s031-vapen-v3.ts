// arena104 behavior 31 "vapen v3": the laser. A press, when the battery isn't flat and
// the last shot is over (1.5 s), fires a "laser behavior" sprite and costs energy.

import { sendSprite, sprite, the } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { PointToVector } from './s006-arena-3d';
import { eq, sp } from './weapon-util';

// global gPartDescription, world

export class VapenV3 {
  robotNumber: number;
  robotSp: number;
  weaponNumber: number;
  sp: number;
  robot2Sp: number;
  state: LSymbol;
  pstartTime: number | undefined = undefined;

  constructor(sp0: number, rn: number, rsp: number, n: number) {
    this.sp = sp0;
    this.robotNumber = rn;
    this.robotSp = rsp;
    this.robot2Sp = 10;
    if (this.robotSp === 10) {
      this.robot2Sp = 20;
    }
    this.weaponNumber = n;
    this.state = sym('idle');
  }

  fire(buttondown: LValue) {
    if (buttondown) {
      if (!eq(sp(this.robotSp, 'state'), sym('battery'))) {
        if (this.state === sym('idle')) {
          sendSprite(0, 'createSprite', 'laser', PointToVector(sprite(this.robotSp).loc, -90), this.robotNumber, this.robotSp, sp(this.robotSp, 'angle'));
          sendSprite(this.robotSp, 'spendEnergy', 2);
          this.pstartTime = the.milliSeconds;
          playsound('laser sound', 255);
          this.state = sym('initshoot');
        }
      }
    }
  }

  prepareFrame() {
    switch (this.state) {
      case sym('initshoot'):
        if (the.milliSeconds > this.pstartTime! + 200) {
          this.state = sym('shoot');
        }
        break;
      case sym('shoot'):
        if (the.milliSeconds > this.pstartTime! + 1500) {
          this.state = sym('idle');
        }
        break;
    }
  }
}
