// arena104 behavior 250 "spear behavior": one harpoon (vapen v24's speargun). The
// spear model leaves the gun and flies 200 units a frame; hitting the other robot does
// v24's damage and leaves the spear stuck in it, hitting a wall leaves it in the wall.

import { G, dot, sendSprite, sprite, the, intersects } from '../../director';
import type { Model } from '../../director/s3d';
import { div, num, point, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { GetDistance } from '../robotwars/s004-new-init';
import { playsound } from '../robotwars/s030-soundscript';
import { VectorToPoint } from './s006-arena-3d';
import { monteringsplats } from '../robotwars/s006-3d-scripts';
import { arenaFixes } from './enhancements';
import { eq, sp, world } from './weapon-util';

// global world, gPlog, gPartDescription, gPlayerNumber

export class SpearBehavior {
  sp: number;
  m: Model | undefined;
  robotSprite: number;
  V: LValue = undefined;
  x: LValue = undefined;
  y: LValue = undefined;
  z: LValue = undefined;
  dx: LValue = undefined;
  dy: LValue = undefined;
  dz: LValue = undefined;
  lastx: LValue = undefined;
  lasty: LValue = undefined;
  robot2Sp: number;
  pstartTime: number;
  state: LSymbol;
  pCounter: LValue = undefined;
  pr: LValue = undefined;
  m2: LValue = undefined;
  m3: LValue = undefined;
  m4: LValue = undefined;
  g: LValue = undefined;
  pSTill: LValue = undefined;
  height: LValue = undefined;
  suffix: string;
  /** Which way along its z the spear flies: the original's +1 flies it tail first. */
  dir = 1;

  constructor(sp0: number, _name: string, _v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    if (rsp === 10) {
      this.robot2Sp = 20;
      this.suffix = '1';
    } else {
      this.robot2Sp = 10;
      this.suffix = '2';
    }
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        this.suffix = '2';
      } else {
        this.suffix = '1';
      }
    }
    this.robotSprite = rsp;
    this.m = world().model('speargun' + this.suffix).child[1] as Model;
    this.m.shader = world().model('spear' + this.suffix).shader;
    world().group('world').addChild(this.m, sym('preserveWorld'));
    // Enhancement (enhancements.ts, ?quirks=spear): the spear model's head is at its -z,
    // but the original flies it along +z, tail first: out of the back of a gun at the
    // front, and forward from a gun at the back with its head pointing back. Fixed, every
    // spear flies forward head first; a gun at the back still fires forward, as it did.
    if (arenaFixes.spearForward) {
      this.dir = -1;
      if (eq(monteringsplats(sp(this.robotSprite, 'robotRD'), sym('v24')), sym('b'))) {
        this.m.rotate(0, 180, 0);
      }
    }
    sprite(this.sp).rotation = sprite(this.robotSprite).rotation - 90;
    this.state = sym('move');
  }

  prepareFrame() {
    switch (this.state) {
      case sym('move'): {
        const m = this.m!;
        this.pCounter = num(this.pCounter) + 1;
        m.translate(0, 0, 200 * this.dir);
        sprite(this.sp).loc = VectorToPoint(div(m.worldPosition, 5.0) as LVector);
        if (intersects(this.sp, this.robot2Sp)) {
          playsound('hit_33', 255);
          sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v24', 'skada'), sym('splitter'));
          this.pstartTime = the.milliSeconds;
          sp(this.robot2Sp, 'pRobot').addChild(m, sym('preserveWorld'));
          this.moveit(this.robot2Sp);
          m.shader = world().model('spearC2').shader;
          this.state = sym('Remove');
        }
        if (num(GetDistance(sprite(this.sp).loc, point(1200, 400))) > 1000) {
          // The model is deleted but the wall test below still runs (and may move it).
          world().deleteModel(m.name);
          this.state = sym('Remove');
        }
        const list = [15, 16, 25, 26, 17, 18];
        const stuck = 0;
        void stuck;
        for (let i = 1; i <= list.length; i++) {
          if (intersects(this.sp, list[i - 1])) {
            this.moveit(list[i - 1]);
            this.state = sym('Remove');
            break;
          }
        }
        break;
      }
      case sym('Remove'):
        sendSprite(0, 'removeSprite', this.sp);
        this.state = sym('done');
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

  moveit(spri: number) {
    const m = this.m!;
    let steps = 0;
    // Quirk kept: the loop exits after its first pass, so the spear backs off at most once.
    while (intersects(this.sp, spri)) {
      steps = steps + 0.5;
      m.translate(0, 0, -this.dir);
      sprite(this.sp).loc = VectorToPoint(div(m.worldPosition, 5.0) as LVector);
      break;
    }
    m.translate(0, 0, this.dir * steps);
    sprite(this.sp).loc = VectorToPoint(div(m.worldPosition, 5.0) as LVector);
  }
}
