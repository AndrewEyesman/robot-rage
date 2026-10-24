// arena104 behavior 10 "fire behavior", on the fire pit's sprite: the robot behavior's
// initFire / stopFire switch the pit between smoke and flames (InitFirePit made both).

import { world } from './weapon-util';

// global world

export class FireBehavior {
  sp: number | undefined = undefined;
  x: unknown = undefined;
  y: unknown = undefined;
  z: unknown = undefined;
  m: unknown = undefined;
  col: unknown = undefined;
  pstartTime: unknown = undefined;
  state: unknown = undefined;

  initFire() {
    if (Number(world().modelResource('pitfire').emitter.loop) === 0) {
      world().modelResource('pitfire').emitter.loop = 1;
      world().modelResource('pitfire').blendRange.start = 100;
      world().modelResource('pitfire').emitter.numParticles = 50;
      world().modelResource('pitsmoke').emitter.loop = 0;
    }
  }

  stopFire() {
    if (Number(world().modelResource('pitsmoke').emitter.loop) === 0) {
      world().modelResource('pitsmoke').emitter.loop = 1;
      world().modelResource('pitsmoke').emitter.numParticles = 50;
      world().modelResource('pitfire').emitter.loop = 0;
    }
  }
}
