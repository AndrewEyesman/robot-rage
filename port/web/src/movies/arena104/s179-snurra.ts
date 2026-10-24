// arena104 behavior 179 "snurra" (sprite 2 on frame 9, before every round): builds both
// robots and the world, then circles the camera half way round the arena before the
// round starts.

import { G, go, put, the } from '../../director';
import { vector, type Shockwave3dMember } from '../../director/s3d';
import { add } from '../../lingo';
import { BuildRobots } from '../robotwars/s006-3d-scripts';
import { BuildWorld } from './s006-arena-3d';
import { n } from './util';

// global world

const world = (): Shockwave3dMember => G.world;

export class Snurra {
  pDeg: number | undefined = undefined;

  beginSprite() {
    BuildRobots();
    put('done building robots');
    BuildWorld();
    put('done building world');
    const grp = world().newGroup('camgroup');
    world().camera(1).parent = grp;
    world().camera(1).worldPosition = vector(12000, 6000, -12000);
    world().camera(1).pointAt(vector(0, 0, 0));
    world().camera(1).hither = 30;
  }

  exitFrame() {
    world().group('camgroup').rotate(0, 1, 0);
    this.pDeg = n(add(this.pDeg, 2));
    if (this.pDeg > 180) {
      world().group('camgroup').transform.rotation = vector(0, 0, 0);
      world().camera(1).hither = 1;
      go(the.frame + 1);
    }
    go(the.frame);
  }
}
