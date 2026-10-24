// Shockwave 3D for translated scripts: the Lingo 3D API on three.js.
//
//   import { member3d, vector, transform } from '../../director/s3d';
//   const world = member3d('arena');
//   world.model('Barrel').visibility = 'back';          // #back
//   world.model('staden').transform.position.y = -72475;
//   sprite(7).camera.fieldOfView = 60;
//
// Importing this module installs the runtime: casts then load their 3D members as live
// worlds (Shockwave3dMember), and 3D sprites draw through Shockwave3dRenderer.

import * as THREE from 'three';
import { member, player } from '../api';
import { memberHooks } from '../members';
import { Sprite } from '../sprite';
import { Shockwave3dMember } from './member';
import { Shockwave3dRenderer, setSpriteCamera, spriteCamera } from './renderer';
import type { Camera3D } from './nodes';

export { Shockwave3dMember } from './member';
export { Node3D, Model, Group3D, Light3D, Camera3D, Overlay, type ShaderList, type NodeKind } from './nodes';
export { Shader, Texture3D, ModelResource, type Emitter, type Range, type AnyColor } from './resources';
export { Transform, transform, vector, Vector, boundVector, toThree, fromThree, eulerMatrix, matrixEuler } from './vector';
export { Shockwave3dRenderer, spriteCamera, setSpriteCamera, type ViewRect } from './renderer';
export { type NodeList } from './lists';

// Colours are used as stored, with no colour management, as Director's renderer did.
THREE.ColorManagement.enabled = false;

memberHooks.w3d = (castLib, number, name, doc) => {
  install3d();
  return new Shockwave3dMember(castLib, number, name, doc);
};

let renderer: Shockwave3dRenderer | null = null;

/** The running player's 3D sprite renderer (installed with the first 3D member). */
export function install3d(): Shockwave3dRenderer {
  const existing = player?.renderers.get('shockwave3d');
  if (existing instanceof Shockwave3dRenderer) return existing;
  renderer ??= new Shockwave3dRenderer();
  player?.renderers.set('shockwave3d', renderer);
  return renderer;
}

/** member("arena") as a 3D member (typed); undefined when it isn't one. */
export function member3d(nameOrNum: string | number, castLib?: string | number): Shockwave3dMember {
  const m = member(nameOrNum, castLib);
  return (m instanceof Shockwave3dMember ? m : undefined) as Shockwave3dMember;
}

// sprite(n).camera
declare module '../sprite' {
  interface Sprite {
    /** The camera a 3D sprite shows (Director's sprite.camera). */
    camera: Camera3D | undefined;
  }
}
Object.defineProperty(Sprite.prototype, 'camera', {
  get(this: Sprite) {
    return spriteCamera(this);
  },
  set(this: Sprite, c: Camera3D | undefined) {
    setSpriteCamera(this, c);
  },
  configurable: true,
});
