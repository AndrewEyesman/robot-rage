// arena104 behavior 44 "oil behavior": an oil slick (vapen v15), a clone of the
// "olja" model that grows in over 18 frames. A robot on it slides (slippery 0.97)
// until it has left it, then gets its grip back (slippery 0).

import { put, sendSprite, the, intersects } from '../../director';
import { vector, type Model } from '../../director/s3d';
import { LList, mul, sym, type LSymbol, type LVector } from '../../lingo';
import { world } from './weapon-util';

// global world, gPlog, gPartDescription

export class OilBehavior {
  sp: number;
  m: Model | undefined;
  robotSprite: number;
  V: LVector;
  x: unknown = undefined;
  y: unknown = undefined;
  dx: unknown = undefined;
  dy: unknown = undefined;
  n: number | undefined = undefined;
  pstartTime: number;
  state: LSymbol;

  constructor(sp0: number, _name: string, v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    const m = (this.m = world().model('olja').clone('oil' + this.sp) as Model);
    m.parent = world().group('world');
    m.transform.scale = vector(0.3, 0.3, 0.3);
    for (let i = 1; i <= 4; i++) {
      m.child[i].transform.position = vector(0, 0, 0);
    }
    this.V = v0;
    const V = this.V;
    if (V.x > 1389) {
      if (V.x > 1456) {
        V.x = 1524;
        (m.child[1] as Model).visibility = sym('none');
        (m.child[2] as Model).visibility = sym('none');
      } else {
        V.x = 1389;
      }
    }
    if (V.x < -1386) {
      if (V.x < -1453) {
        V.x = -1521;
        (m.child[3] as Model).visibility = sym('none');
        (m.child[4] as Model).visibility = sym('none');
      } else {
        V.x = -1386;
      }
    }
    // The box in the middle of the roof (z from -657 to -172, x from -158 to 163): a
    // puddle near it is pushed to its edge, and the quarters that would lie over it hidden.
    const rad = 160;
    const list = [-172, -657, -158, 163];
    const hide = [0, 0, 0, 0];
    if (V.z < list[0] + rad && V.z > list[1] - rad && V.x > list[2] - rad && V.x < list[3] + rad) {
      if (V.z > list[0]) {
        if (V.z > list[0] + Math.trunc(rad / 2)) {
          V.z = list[0] + rad;
        } else {
          V.z = list[0];
          hide[1] = hide[1] + 1;
          hide[2] = hide[2] + 1;
        }
      } else {
        if (V.z < list[0] && V.z > Math.trunc((list[0] + list[1]) / 2)) {
          if (V.z < list[0] - Math.trunc(rad / 2)) {
            V.z = list[0] - rad;
            hide[0] = hide[0] + 1;
            hide[1] = hide[1] + 1;
            hide[2] = hide[2] + 1;
            hide[3] = hide[3] + 1;
          } else {
            V.z = list[0];
            hide[1] = hide[1] + 1;
            hide[2] = hide[2] + 1;
          }
        }
      }
      if (V.z < list[1]) {
        if (V.z < list[1] - Math.trunc(rad / 2)) {
          V.z = list[1] - rad;
        } else {
          V.z = list[1];
          hide[0] = hide[0] + 1;
          hide[3] = hide[3] + 1;
        }
      } else {
        if (V.z > list[1] && V.z < Math.trunc((list[0] + list[1]) / 2)) {
          if (V.z > list[1] + Math.trunc(rad / 2)) {
            V.z = list[1] + rad;
            hide[0] = hide[0] + 1;
            hide[1] = hide[1] + 1;
            hide[2] = hide[2] + 1;
            hide[3] = hide[3] + 1;
          } else {
            hide[0] = hide[0] + 1;
            hide[3] = hide[3] + 1;
            V.z = list[1];
          }
        }
      }
      if (V.x < list[2]) {
        if (V.x < list[2] - Math.trunc(rad / 2)) {
          V.x = list[2] - rad;
        } else {
          V.x = list[2];
          hide[0] = hide[0] + 1;
          hide[1] = hide[1] + 1;
        }
      } else {
        if (V.x > list[2] && V.x < Math.trunc((list[2] + list[3]) / 2)) {
          if (V.x > list[2] + Math.trunc(rad / 2)) {
            V.x = list[2] + rad;
            hide[0] = hide[0] + 1;
            hide[1] = hide[1] + 1;
            hide[2] = hide[2] + 1;
            hide[3] = hide[3] + 1;
          } else {
            V.x = list[2];
            hide[0] = hide[0] + 1;
            hide[1] = hide[1] + 1;
          }
        }
      }
      if (V.x > list[3]) {
        if (V.x > list[3] + Math.trunc(rad / 2)) {
          V.x = list[3] + rad;
        } else {
          V.x = list[3];
          hide[2] = hide[2] + 1;
          hide[3] = hide[3] + 1;
        }
      } else {
        if (V.x < list[3] && V.x > Math.trunc((list[2] + list[3]) / 2)) {
          if (V.x < list[3] - Math.trunc(rad / 2)) {
            V.x = list[3] - rad;
            hide[0] = hide[0] + 1;
            hide[1] = hide[1] + 1;
            hide[2] = hide[2] + 1;
            hide[3] = hide[3] + 1;
          } else {
            V.x = list[3];
            hide[2] = hide[2] + 1;
            hide[3] = hide[3] + 1;
          }
        }
      }
      put(new LList(hide));
      for (let i = 1; i <= 4; i++) {
        if (hide[i - 1] > 1) {
          (m.child[i] as Model).visibility = sym('none');
        }
      }
    }
    m.worldPosition = mul(V, 5) as LVector;
    m.scale(0.1);
    this.robotSprite = rsp;
    this.state = sym('place');
  }

  prepareFrame() {
    switch (this.state) {
      case sym('place'): {
        const t = the.milliSeconds - this.pstartTime;
        void t;
        this.n = 1;
        this.state = sym('grow');
        break;
      }
      case sym('grow'):
        this.m!.scale(1 + 1.3 / this.n!);
        this.n = this.n! + 1;
        if (this.n > 18) {
          this.state = sym('idle');
        }
        break;
      case sym('idle'):
        if (intersects(this.sp, 10)) {
          sendSprite(10, 'slippery', 0.97);
          this.pstartTime = the.milliSeconds;
          this.state = sym('hit');
        }
        if (intersects(this.sp, 20)) {
          sendSprite(20, 'slippery', 0.97);
          this.pstartTime = the.milliSeconds;
          this.state = sym('hit');
        }
        break;
      case sym('hit'): {
        let q = 0;
        if (!intersects(this.sp, 10)) {
          sendSprite(10, 'slippery', 0.0);
        } else {
          q = 1;
        }
        if (!intersects(this.sp, 20)) {
          sendSprite(20, 'slippery', 0.0);
        } else {
          q = 1;
        }
        if (!q) {
          this.state = sym('idle');
        }
        break;
      }
      // Nothing sets #Remove: a puddle stays for the rest of the match.
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
    this.state = sym('nada');
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      this.m = undefined;
    }
  }
}
