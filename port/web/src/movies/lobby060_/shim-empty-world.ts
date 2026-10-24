// TEMPORARY SHIM (lobby agent), not a translation: member "robot" (internal member 70,
// the 3D view of a robot's card) is a Shockwave 3D member authored as an empty world, so
// it has no W3D payload; port/extract writes it as a plain "Ole" member and the runtime
// makes it an empty Member, which has no 3D API. The garage's "robot" (factory0604
// member 111) is the same. Until the extractor marks such members and director/s3d
// gives them Director's default world, this swaps in a Shockwave3dMember holding that
// default world: group "World", camera "DefaultView" 250 units out on Z, the
// "DefaultShader", and the two UI lights.

import { castLib, member, sprite } from '../../director';
import { Camera3D, Group3D, Light3D, Shader, Shockwave3dMember } from '../../director/s3d';
import type { MemberDoc } from '../../director/docs';

class EmptyWorldMember extends Shockwave3dMember {
  async load() {
    this.buildEmpty();
    this.state = 4;
  }

  resetWorld() {
    for (const n of this.allNodes()) n.deleted = true;
    this.buildEmpty();
  }

  private buildEmpty() {
    for (const m of this.models) m.dispose();
    for (const s of this.shaders) s.dispose();
    this.scene.clear();
    this.models = [];
    this.lights = [];
    this.cameras = [];
    this.textures = [];
    this.resources = [];
    this.world = new Group3D('World', this);
    this.groups = [this.world];
    this.scene.add(this.world.obj);
    this.defaultShader = Shader.fromDoc(this, undefined, undefined, 'DefaultShader');
    this.shaders = [this.defaultShader];
    const amb = new Light3D('UIAmbient', this, 'ambient', [0, 0, 0]);
    const dir = new Light3D('UIDirectional', this, 'directional', [1, 1, 1]);
    this.lights.push(amb, dir);
    this.world.attach(amb, false);
    this.world.attach(dir, false);
    const c = new Camera3D('DefaultView', this, 30, 1, 10000);
    c.obj.matrix.makeTranslation(0, 0, 250);
    this.world.attach(c, false);
    this.cameras.push(c);
  }
}

/** Make member `name` of the internal cast a live (empty) 3D world, once. */
export function ensureEmptyWorld(name: string) {
  const old = member(name, 1);
  if (old instanceof Shockwave3dMember || old.number === 0) return;
  const cast = castLib(1);
  const doc = { num: old.number, name: old.name, type: 'Ole' } as unknown as MemberDoc;
  const m = new EmptyWorldMember(cast, old.number, old.name, doc);
  void m.load();
  cast.set(old.number, m);
  // Sprites already showing the old member follow it.
  for (let ch = 1; ch <= 1000; ch++) if (sprite(ch).memberRef === old) sprite(ch).member = m;
}
