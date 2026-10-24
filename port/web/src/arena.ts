// The arena world, set up as the arena movie's BuildWorld does.

import * as THREE from 'three';
import { AMBIENT, DIRECTIONAL, LightRig, POINT } from './director/s3d/material';
import { W3dMember, setModelSide, setModelVisible } from './director/s3d/w3d';

export interface Arena {
  member: W3dMember;
  root: THREE.Group;
  byName: Map<string, THREE.Group>;
  /** Director's DefaultView camera, as authored (hither/yon are set by BuildWorld). */
  defaultView: THREE.Matrix4;
}

export async function loadArena(rig: LightRig, assets: string): Promise<Arena> {
  const member = await W3dMember.load(`${assets}/arena104/w3d`, 'arena', rig);
  const { root, byName } = member.buildWorld();
  const model = (name: string) => byName.get(name.toLowerCase());

  model('Gallerplan') && setModelVisible(model('Gallerplan')!, false);
  model('Barrel') && setModelSide(model('Barrel')!, THREE.BackSide, rig);
  model('Plane.1.1') && setModelSide(model('Plane.1.1')!, THREE.DoubleSide, rig);
  model('Plane')?.position.set(-24000, 6000, -27000);
  model('Plane.1')?.position.set(-23400, 6000, -16000);
  model('Plane.2')?.position.set(-45000, 6000, -9800);
  model('Plane.4')?.position.set(-33500, 6000, -9800);
  // Weapon effect models parked out of sight until a weapon uses them.
  for (const q of ['olja', 'pang', 'laserray', 'lim', 'granat', 'spik', 'mina']) {
    const m = model(q);
    if (m) m.position.y = -10000;
  }
  model('raket')?.removeFromParent();
  const staden = model('staden');
  if (staden) {
    staden.scale.x = 0.97;
    staden.position.y = -72475;
  }

  // Lights: BuildWorld deletes "UIambient", leaving the scene's own lights.
  root.updateMatrixWorld(true);
  const lights = [];
  for (const l of member.lights) {
    if (l.name.toLowerCase() === 'uiambient') continue;
    const node = model(l.name);
    const pos = node ? new THREE.Vector3().setFromMatrixPosition(node.matrixWorld) : new THREE.Vector3();
    // Directional and spot lights shine down their node's -Z axis.
    const dir = node ? new THREE.Vector3(0, 0, -1).transformDirection(node.matrixWorld) : new THREE.Vector3(0, -1, 0);
    const type = l.type === 'ambient' ? AMBIENT : l.type === 'directional' ? DIRECTIONAL : POINT;
    lights.push({ type, color: l.color, pos, dir, att: l.attenuation });
  }
  rig.set(lights);

  const view = member.node('DefaultView');
  return { member, root, byName, defaultView: view ? member.worldMatrix(view.name) : new THREE.Matrix4() };
}
