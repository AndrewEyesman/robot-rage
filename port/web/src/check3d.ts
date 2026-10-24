// A check of the Shockwave 3D API: the arena movie's 3D sprite, its world built by the
// translated BuildWorld and the robot by the translated BuildRobot/updateRobotTexture,
// posed like the arena demo (index.html) so the two can be compared pixel for pixel
// (port/tools/check3d.mjs).
//
//   check3d.html?parts=r1,h2,ma1,b1,v6&pos=f      (part ids as in the game)

import { boot, G } from './director';
import { member3d, transform, vector, type Group3D } from './director/s3d';
import { LList, LPropList, sym } from './lingo';
import './movies';
import { createPartDescription } from './movies/robotwars/s049-part-description';
import { BuildRobot, updateRobotTexture } from './movies/robotwars/s006-3d-scripts';
import { BuildWorld } from './movies/arena104/s006-arena-3d';
import { parts } from './parts';

const query = new URLSearchParams(location.search);

/** A robotDescription property list, as the server's robot data gives it. */
function describe(ids: string, positions: string): LPropList {
  const keys = ['ram', 'torn', 'hjul', 'motor', 'batteri', 'vapen', 'wpnPos', 'special', 'ammunition'];
  const lists = new Map(keys.map((k) => [k, new LList()]));
  for (const id of ids.split(',').filter(Boolean)) lists.get(parts[id]?.typ ?? '')?.append(sym(id));
  for (const p of positions.split(',').slice(0, lists.get('vapen')!.count)) lists.get('wpnPos')!.append(sym(p));
  return new LPropList(keys.map((k) => [sym(k), lists.get(k)!]));
}

async function main() {
  const player = boot(document.getElementById('stage') as HTMLDivElement, '/assets');
  // Hold the arena's game frame, where channel 7 is the 3D sprite.
  player.onFrame = (p) => p.go(9);
  await player.start('arena104', 9);

  createPartDescription();
  const rd = describe(query.get('parts') ?? 'r1,h2,ma1,b1,v6', query.get('pos') ?? 'f');
  BuildWorld();
  const world = member3d('arena');
  G.gRobot1 = BuildRobot('robot1', rd, world);
  (G.gRobot1 as Group3D).scale(2.0);
  updateRobotTexture(world, G.gRobot1, 'map1A', rd, 1, 1);
  if ((rd.getaProp(sym('torn')) as LList).count) updateRobotTexture(world, G.gRobot1, 'map1B', rd, 2, 1);

  // The camera script's set-up: the camera in a group that follows the robot.
  const camera = world.camera(1);
  camera.fieldOfView = 60;
  camera.colorBuffer.clearValue = { red: 0, green: 0, blue: 0 } as never;
  const camgrp = world.newGroup('camgrp');
  camera.parent = camgrp;
  camera.transform = transform();

  const robot = G.gRobot1 as Group3D;
  Object.assign(window, {
    __check: {
      world,
      robot,
      /** The robot behavior's UpdateRobot, from a pose; the camera group placed and aimed. */
      pose(p: { x: number; y: number; z: number; angle: number; anglex: number; anglez: number }, cam: { pos: number[]; target: number[]; fov: number }) {
        robot.transform.rotation = vector(p.anglex, 0, p.anglez);
        robot.parent!.transform.rotation = vector(0, -p.angle + 90, 0);
        robot.parent!.worldPosition = vector(p.x * 5, p.z, p.y * 5);
        camgrp.worldPosition = vector(cam.pos[0], cam.pos[1], cam.pos[2]);
        camgrp.pointAt(vector(cam.target[0], cam.target[1], cam.target[2]), vector(0, 1, 0));
        camera.fieldOfView = cam.fov;
      },
      particles(on: boolean) {
        for (const n of ['pitsmoke', 'pitfire', 'explosion']) world.model(n).visibility = on ? 'front' : 'none';
      },
      models: () => world.models.map((m) => `${m.name} <${m.parent?.name ?? 'VOID'}> ${m.visibility}`),
    },
  });
  document.title += ' (ready)';
}

main().catch((e) => {
  console.error(e);
  document.title = `error: ${e}`;
});
