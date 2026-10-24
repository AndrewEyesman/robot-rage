// arena104 behavior 40 "nail behavior": a nail on the floor (vapen v13). Once its owner
// has driven off it, a robot running over it takes v13's damage (then it rests 2 s);
// a plough or other gPlog sprite pushes it away, sliding until it stops or drops off
// the roof or into the pit.

import { G, dot, intersects, sendSprite, sprite, the } from '../../director';
import type { Model } from '../../director/s3d';
import { LList, LPropList, add, mul, num, point, sub, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { GetAngle } from '../robotwars/s007-jump-movie';
import { playsound } from '../robotwars/s030-soundscript';
import { PointToVector } from './s006-arena-3d';
import { DEG, sp, world } from './weapon-util';

// global world, gPlog, gPartDescription, gPlayerNumber

export class NailBehavior {
  sp: number;
  m: Model | undefined;
  robotSprite: number;
  V: LVector;
  x: number | undefined = undefined;
  y: number | undefined = undefined;
  dx: number | undefined = undefined;
  dy: number | undefined = undefined;
  pstartTime: number;
  state: LSymbol;

  constructor(sp0: number, _name: string, v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    let robot2Sp: number;
    let suffix: string;
    if (rsp === 10) {
      robot2Sp = 20;
      suffix = '1';
    } else {
      robot2Sp = 10;
      suffix = '2';
    }
    void robot2Sp;
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        suffix = '2';
      } else {
        suffix = '1';
      }
    }
    this.m = world().newModel('nail' + this.sp);
    this.m.resource = world().modelResource('spik');
    this.m.parent = world().group('world');
    this.m.shader = world().model('spik' + suffix).shader;
    this.V = v0;
    this.m.worldPosition = mul(this.V, 5) as LVector;
    this.m.scale(0.1);
    this.robotSprite = rsp;
    this.state = sym('place');
  }

  prepareFrame() {
    switch (this.state) {
      case sym('place'): {
        const t = the.milliSeconds - this.pstartTime;
        if (t > 300 && !intersects(this.robotSprite, this.sp)) {
          this.state = sym('idle');
        }
        break;
      }
      case sym('idle'):
        for (const q of G.gPlog as LList) {
          const qsp = num((q as LPropList).getaProp(sym('sp')));
          const qrobotSp = num((q as LPropList).getaProp(sym('robotSp')));
          if (intersects(qsp, this.sp)) {
            const angle = num(GetAngle(sprite(qsp).locH - sprite(this.sp).locH, sprite(qsp).locV - sprite(this.sp).locV));
            this.x = sprite(this.sp).locH;
            this.y = sprite(this.sp).locV;
            this.dx = -(0.4 * num(sp(qrobotSp, 'fart')) + 1.2) * Math.cos(angle * DEG);
            this.dy = -(0.4 * num(sp(qrobotSp, 'fart')) + 1.2) * Math.sin(angle * DEG);
            playsound('hitsmall', 255);
            this.state = sym('slide');
            return;
          }
        }
        if (intersects(this.sp, 10)) {
          playsound('hitnail', 255);
          sendSprite(10, 'damage', dot(G.gPartDescription, 'v13', 'skada'), sym('nothing'));
          this.pstartTime = the.milliSeconds;
          this.state = sym('hit');
        }
        if (intersects(this.sp, 20)) {
          playsound('hitnail', 255);
          sendSprite(20, 'damage', dot(G.gPartDescription, 'v13', 'skada'), sym('nothing'));
          this.pstartTime = the.milliSeconds;
          this.state = sym('hit');
        }
        break;
      case sym('hit'):
        if (the.milliSeconds > this.pstartTime + 2000) {
          this.state = sym('idle');
        }
        break;
      case sym('slide'): {
        const lastx = this.x!;
        const lasty = this.y!;
        this.x = this.x! + this.dx!;
        this.y = this.y! + this.dy!;
        for (let i = 15; i <= 18; i++) {
          if (intersects(this.sp, i)) {
            this.x = lastx;
            this.y = lasty;
          }
        }
        if (this.x > 1580 || this.x < 820 || intersects(this.sp, 6)) {
          this.state = sym('fall');
        }
        if (this.dx! > 0.3) {
          this.dx = this.dx! - 0.3;
        }
        if (this.dx! < -0.3) {
          this.dx = this.dx! + 0.3;
        }
        if (this.dy! > 0.3) {
          this.dy = this.dy! - 0.3;
        }
        if (this.dy! < -0.3) {
          this.dy = this.dy! + 0.3;
        }
        if (Math.abs(this.dx!) + Math.abs(this.dy!) < 0.8) {
          this.state = sym('idle');
        }
        this.m!.worldPosition = mul(5, PointToVector(point(this.x, this.y), -100)) as LVector;
        sprite(this.sp).loc = point(this.x, this.y);
        break;
      }
      // The original has a second `#slide:` branch here (bouncing inside x 1070-1300,
      // y 0-400 and slowing near the pit); `case` takes the first match, so it never runs.
      case sym('fall'): {
        // dz and z are locals, VOID (0) on every call: the nail settles at y = -1 and
        // stays in #fall, never reaching #Remove (the original's bug, kept).
        let dz: LValue = undefined;
        let z: LValue = undefined;
        dz = add(dz, 1);
        z = sub(z, dz);
        this.m!.worldPosition.y = num(z);
        if (num(z) < -2000) {
          this.state = sym('Remove');
        }
        break;
      }
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        world().deleteModel(this.m!.name);
        this.state = sym('doneNail');
        break;
    }
  }

  endSprite() {
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      this.m = undefined;
    }
  }

  doneSprite() {
    this.state = sym('done');
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      this.m = undefined;
    }
  }
}
