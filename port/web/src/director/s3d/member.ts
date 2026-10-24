// A Shockwave 3D cast member at runtime: the world built from the extracted file
// (port/extract's w3d/<name>.json), with Lingo's member API: model/group/light/camera/
// shader/texture/modelResource lookup, creation and deletion, resetWorld,
// cloneModelFromCastmember and modelsUnderRay. Loaded with its cast, so scripts use
// it synchronously, as they do in Director.

import * as THREE from 'three';
import { LColor, LList, LPropList, sym, type LSymbol } from '../../lingo';
import { DImage } from '../image';
import { W3dMemberRef, type CastLib, type Member } from '../members';
import type { MemberDoc } from '../docs';
import { warnOnce } from '../player';
import { fileName, nameKey, nodeList, symName, type NodeList } from './lists';
import { AMBIENT, DIRECTIONAL, LightRig, POINT } from './material';
import { Camera3D, Group3D, Light3D, Model, type Node3D } from './nodes';
import { ModelResource, Shader, Texture3D } from './resources';
import { fromThree, toThree, type Vector } from './vector';
import { W3dMember } from './w3d';

const lc = nameKey;

export class Shockwave3dMember extends W3dMemberRef {
  /** The lights every material of this member reads (shared uniforms). */
  readonly rig = new LightRig();
  /** The file's data (geometry, textures), kept for resetWorld. */
  file: W3dMember | null = null;
  readonly scene = new THREE.Scene();
  world!: Group3D;
  defaultShader!: Shader;
  models: Model[] = [];
  groups: Group3D[] = [];
  lights: Light3D[] = [];
  cameras: Camera3D[] = [];
  shaders: Shader[] = [];
  textures: Texture3D[] = [];
  resources: ModelResource[] = [];
  /** 4 once loaded (member.state). */
  state = 0;
  bgcolor: LColor = new LColor(0, 0, 0);
  ambientColor: LColor = new LColor(0, 0, 0);
  directionalColor: LColor = new LColor(255, 255, 255);
  directionalPreset: LSymbol = sym('none');
  private lastAdvance = 0;

  constructor(castLib: CastLib, number: number, name: string, doc: MemberDoc) {
    super(castLib, number, name, doc);
    this.scene.matrixWorldAutoUpdate = false;
  }

  async load() {
    if (this.file) return;
    this.file = await W3dMember.loadUrl(this.url, this.rig);
    this.build();
    this.state = 4;
  }

  // ------------------------------------------------------------ building from the file

  private build() {
    const file = this.file!;
    const doc = file.doc;
    for (const m of this.models) m.dispose();
    for (const s of this.shaders) s.dispose();
    this.scene.clear();
    this.models = [];
    this.lights = [];
    this.cameras = [];
    this.shaders = [];
    this.textures = [];
    this.resources = [];
    this.world = new Group3D('World', this);
    this.groups = [this.world];
    this.scene.add(this.world.obj);

    for (const name of Object.keys(doc.textures)) {
      const t = file.texture(name);
      if (t) this.textures.push(new Texture3D(fileName(name), t, 'fromFile'));
    }
    for (const sd of doc.shaders) this.shaders.push(Shader.fromDoc(this, sd, sd.material ? file.materialDoc(sd.material) : undefined, fileName(sd.name)));
    this.defaultShader = this.shader('DefaultShader') ?? Shader.fromDoc(this, undefined, undefined, 'DefaultShader');
    if (!this.shaders.includes(this.defaultShader)) this.shaders.unshift(this.defaultShader);
    for (const name of Object.keys(doc.resources)) {
      const rd = doc.resources[name];
      this.resources.push(new ModelResource(fileName(name), 'fromfile', this, file.geometry(name), rd.meshes.map((m) => fileName(m.shader ?? 'DefaultShader'))));
    }

    const byName = new Map<string, Node3D>();
    const lightDocs = new Map(doc.lights.map((l) => [lc(l.name), l]));
    for (const n of doc.nodes) {
      let node: Node3D;
      if (n.type === 'model') {
        const resName = n.modelResource || n.resource;
        const res = this.modelResource(fileName(resName));
        const shaders = (res?.geometries() ?? [null]).map((_, i) => this.shader(fileName(file.submeshShader(resName, i, n.shader))) ?? this.defaultShader);
        const m = new Model(fileName(n.name), this, res, shaders);
        m.setVisibilityIndex(n.visibility);
        this.models.push(m);
        node = m;
      } else if (n.type === 'light') {
        const l = lightDocs.get(lc(n.resource.trim() || n.name));
        node = new Light3D(fileName(n.name), this, l?.type ?? 'point', l?.color, l?.attenuation, l?.spotAngle, l?.specular ?? true);
        this.lights.push(node as Light3D);
      } else if (n.type === 'view') {
        const c = new Camera3D(fileName(n.name), this, n.fov || 30, n.near || 5, n.far || 10000);
        if (n.ortho) c.projection = 'orthographic';
        this.cameras.push(c);
        node = c;
      } else {
        node = new Group3D(fileName(n.name), this);
        this.groups.push(node as Group3D);
      }
      node.obj.matrix.fromArray(n.transform);
      byName.set(lc(n.name), node);
    }
    for (const n of doc.nodes) {
      const node = byName.get(lc(n.name))!;
      const parent = n.parent && lc(n.parent) !== 'world' ? byName.get(lc(n.parent)) : undefined;
      (parent ?? this.world).attach(node, false);
    }
    // A member without a camera still draws through a default one.
    if (!this.cameras.length) {
      const c = new Camera3D('DefaultView', this);
      c.obj.matrix.makeTranslation(0, 0, 250);
      this.world.attach(c, false);
      this.cameras.push(c);
    }
  }

  /** resetWorld(): back to the file's world; references to the old nodes are dead. */
  resetWorld() {
    for (const n of this.allNodes()) n.deleted = true;
    if (this.file) this.build();
  }
  revertToWorldDefaults() {
    this.resetWorld();
  }

  // ------------------------------------------------------------ lookup

  get model(): NodeList<Model> {
    return nodeList(() => this.models);
  }
  get group(): NodeList<Group3D> {
    return nodeList(() => this.groups);
  }
  get light(): NodeList<Light3D> {
    return nodeList(() => this.lights);
  }
  get camera(): NodeList<Camera3D> {
    return nodeList(() => this.cameras);
  }
  get shader(): NodeList<Shader> {
    return nodeList(() => this.shaders);
  }
  get texture(): NodeList<Texture3D> {
    return nodeList(() => this.textures);
  }
  get modelResource(): NodeList<ModelResource> {
    return nodeList(() => this.resources);
  }

  allNodes(): Node3D[] {
    return [...this.models, ...this.groups, ...this.lights, ...this.cameras];
  }

  /** Any node with this name (node names are unique across kinds). */
  nodeNamed(name: string): Node3D | undefined {
    const k = lc(name);
    return this.allNodes().find((n) => lc(n.name) === k);
  }

  /** Put a node made elsewhere (a clone) into its kind's list. */
  register(n: Node3D) {
    if (n instanceof Model) this.models.push(n);
    else if (n instanceof Light3D) this.lights.push(n);
    else if (n instanceof Camera3D) this.cameras.push(n);
    else if (n instanceof Group3D) this.groups.push(n);
  }

  private checkName(name: string, what: string) {
    if (this.nodeNamed(name)) throw new Error(`${what}("${name}"): Object with duplicate name already exists`);
  }

  // ------------------------------------------------------------ nodes

  /** newModel(name {, resource}): a new model in the world. */
  newModel(name: string, resource?: ModelResource): Model {
    this.checkName(name, 'newModel');
    const m = new Model(name, this, resource || undefined);
    this.models.push(m);
    this.world.attach(m, false);
    return m;
  }
  newGroup(name: string): Group3D {
    this.checkName(name, 'newGroup');
    const g = new Group3D(name, this);
    this.groups.push(g);
    this.world.attach(g, false);
    return g;
  }
  /** newLight(name, #ambient | #directional | #point | #spot) */
  newLight(name: string, type: LSymbol | string): Light3D {
    this.checkName(name, 'newLight');
    const l = new Light3D(name, this, symName(type));
    this.lights.push(l);
    this.world.attach(l, false);
    return l;
  }
  newCamera(name: string): Camera3D {
    this.checkName(name, 'newCamera');
    const c = new Camera3D(name, this);
    this.cameras.push(c);
    this.world.attach(c, false);
    return c;
  }

  /**
   * Deleting a node takes it out of its member and the world. Its children are left
   * without a parent (out of the world, still in the member): BuildRobot relies on that,
   * deleting every parentless model after building (dirplayer deletes the children
   * instead; either way they stop drawing).
   */
  private deleteNode<T extends Node3D>(list: T[], x: string | number | T): boolean {
    const n = typeof x === 'object' ? x : typeof x === 'number' ? list[Math.trunc(x) - 1] : list.find((m) => lc(m.name) === lc(String(x)));
    if (!n || (n as Node3D) === this.world) return false;
    for (const c of [...n.children]) c.detach();
    n.detach();
    list.splice(list.indexOf(n), 1);
    if (n instanceof Model) n.dispose();
    n.deleted = true;
    return true;
  }
  deleteModel(x: string | number | Model) {
    return this.deleteNode(this.models, x);
  }
  deleteGroup(x: string | number | Group3D) {
    return this.deleteNode(this.groups, x);
  }
  deleteLight(x: string | number | Light3D) {
    return this.deleteNode(this.lights, x);
  }
  deleteCamera(x: string | number | Camera3D) {
    return this.deleteNode(this.cameras, x);
  }

  // ------------------------------------------------------------ shaders, textures, resources

  private named<T extends { name: string }>(list: T[], name: string, what: string) {
    if (list.some((x) => lc(x.name) === lc(name))) throw new Error(`${what}("${name}"): Object with duplicate name already exists`);
  }

  /** newShader(name, #standard) (other shader types are drawn as #standard). */
  newShader(name: string, type: LSymbol | string = 'standard'): Shader {
    this.named(this.shaders, name, 'newShader');
    if (symName(type) !== 'standard') warnOnce(`newShader #${symName(type)} is drawn as #standard`);
    const s = new Shader(name, this);
    this.shaders.push(s);
    return s;
  }
  /** Models using a deleted shader fall back to DefaultShader. */
  deleteShader(x: string | number) {
    const s = typeof x === 'number' ? this.shaders[x - 1] : this.shader(x);
    if (!s || s === this.defaultShader) return;
    this.shaders.splice(this.shaders.indexOf(s), 1);
    for (const m of this.models) {
      const list = m.shaderList;
      for (let i = 1; i <= list.count; i++) if (list[i] === s) list[i] = this.defaultShader;
    }
  }

  /** newTexture(name {, #fromCastMember, member | #fromImageObject, image}) */
  newTexture(name: string, type?: LSymbol | string, source?: Member | DImage): Texture3D {
    this.named(this.textures, name, 'newTexture');
    const k = symName(type);
    let t: Texture3D;
    if (k === 'fromimageobject' && source instanceof DImage) t = Texture3D.fromImage(name, source);
    else if (k === 'fromcastmember') t = Texture3D.fromMember(name, source as Member | undefined);
    else t = Texture3D.fromImage(name, new DImage(1, 1, 32), 'empty');
    this.textures.push(t);
    return t;
  }
  deleteTexture(x: string | number) {
    const t = typeof x === 'number' ? this.textures[x - 1] : this.texture(x);
    if (!t) return;
    this.textures.splice(this.textures.indexOf(t), 1);
    for (const s of this.shaders) s.layers.forEach((l) => l.texture === t && ((l.texture = undefined), s.touch()));
    for (const r of this.resources) if (r.texture === t) r.texture = undefined;
  }

  /** newModelResource(name, #box | #sphere | #plane | #cylinder | #particle {, facing}) */
  newModelResource(name: string, type: LSymbol | string, facing?: LSymbol | string): ModelResource {
    this.named(this.resources, name, 'newModelResource');
    const r = new ModelResource(name, symName(type), this);
    if (facing !== undefined) r.facing = facing;
    this.resources.push(r);
    return r;
  }
  deleteModelResource(x: string | number) {
    const r = typeof x === 'number' ? this.resources[x - 1] : this.modelResource(x);
    if (!r) return;
    this.resources.splice(this.resources.indexOf(r), 1);
    for (const m of this.models) if (m.resource === r) m.resource = undefined;
  }

  private uniqueName<T extends { name: string }>(list: T[], name: string, tag: string): string {
    if (!list.some((x) => lc(x.name) === lc(name))) return name;
    let n = 1;
    while (list.some((x) => lc(x.name) === lc(`${name}-${tag}${n}`))) n++;
    return `${name}-${tag}${n}`;
  }

  /** A copy of a shader in this member (cloneDeep). */
  copyShader(s: Shader, tag = 'copy', textureMap?: (t: Texture3D) => Texture3D): Shader {
    const c = s.copy(this.uniqueName(this.shaders, s.name, tag), this, textureMap);
    this.shaders.push(c);
    return c;
  }
  /** A copy of a model resource in this member (cloneDeep); file geometry is shared. */
  copyResource(r: ModelResource, tag = 'copy'): ModelResource {
    const name = this.uniqueName(this.resources, r.name, tag);
    const c = r.kind === 'fromfile' ? new ModelResource(name, 'fromfile', this, r.geometries(), r.fileShaders) : new ModelResource(name, r.kind, this);
    if (r.kind !== 'fromfile') {
      for (const k of ['width', 'height', 'length', 'radius', 'resolution', 'topRadius', 'bottomRadius'] as const) if (r[k]) c[k] = r[k];
      if (r.particle) Object.assign(c.particle!, r.particle);
      c.texture = r.texture;
    }
    this.resources.push(c);
    return c;
  }

  /**
   * cloneModelFromCastmember(newName, sourceName, sourceMember): a copy of another
   * member's model and its children in this world, with copies of the model resources,
   * shaders and textures they use. Names that collide with this member's get
   * "-clone<N>" (as dirplayer does), so a robot keeps its own shaders in the arena.
   */
  cloneModelFromCastmember(newName: string, srcName: string, src: Shockwave3dMember): Model | undefined {
    const root = src?.model?.(srcName);
    if (!root) {
      warnOnce(`cloneModelFromCastmember: no model "${srcName}" in ${src?.name}`);
      return undefined;
    }
    this.checkName(newName, 'cloneModelFromCastmember');
    const textures = new Map<Texture3D, Texture3D>();
    const textureOf = (t: Texture3D) => {
      let c = textures.get(t);
      if (!c) {
        const same = this.textures.find((x) => lc(x.name) === lc(t.name));
        if (same && same.three === t.three) c = same;
        else {
          c = new Texture3D(this.uniqueName(this.textures, t.name, 'clone'), t.three, t.kind);
          this.textures.push(c);
        }
        textures.set(t, c);
      }
      return c;
    };
    const shaders = new Map<Shader, Shader>();
    const shaderOf = (s: Shader) => {
      if (s === src.defaultShader) return this.defaultShader;
      let c = shaders.get(s);
      if (!c) shaders.set(s, (c = this.copyShader(s, 'clone', textureOf)));
      return c;
    };
    const resources = new Map<ModelResource, ModelResource>();
    const resourceOf = (r: ModelResource) => {
      let c = resources.get(r);
      if (!c) resources.set(r, (c = this.copyResource(r, 'clone')));
      return c;
    };
    const copy = (n: Node3D, name: string): Node3D => {
      let c: Node3D;
      if (n instanceof Model) {
        const list = n.shaderList;
        const sh = Array.from({ length: list.count }, (_, i) => shaderOf(list[i + 1]));
        const m = new Model(name, this, n.resource ? resourceOf(n.resource) : undefined, sh);
        m.visibility = n.visibility;
        c = m;
      } else {
        // Cameras below a cloned model come over as plain groups (the game has none).
        if (n instanceof Camera3D) warnOnce(`cloneModelFromCastmember: camera ${n.name} copied as a group`);
        c = new Group3D(name, this);
      }
      c.obj.matrix.copy(n.obj.matrix);
      this.register(c);
      for (const ch of n.children) {
        if (ch instanceof Light3D) continue; // lights aren't copied
        const childName = this.nodeNamed(ch.name) ? this.uniqueName(this.allNodes(), ch.name, 'clone') : ch.name;
        c.attach(copy(ch, childName), false);
      }
      return c;
    };
    const top = copy(root, newName) as Model;
    this.world.attach(top, false);
    return top;
  }

  // ------------------------------------------------------------ rays

  /**
   * modelsUnderRay(location, direction {, maxModels {, #simple | #detailed}}) or with a
   * property list [#maxNumberOfModels:, #levelOfDetail:, #modelList:]. Models in the
   * world are hit whether or not they're visible (the game hits the robots' invisible
   * dummy boxes); faces count from the side the model draws.
   */
  modelsUnderRay(pos: Vector, dir: Vector, opt?: number | LPropList, level?: LSymbol | string): LList {
    let max = Infinity;
    let detailed = false;
    let only: Model[] | null = null;
    if (opt instanceof LPropList) {
      const n = opt.getaProp(sym('maxNumberOfModels'));
      if (typeof n === 'number' && n > 0) max = n;
      detailed = symName(opt.getaProp(sym('levelOfDetail'))) === 'detailed';
      const ml = opt.getaProp(sym('modelList'));
      if (ml instanceof LList) only = ml.items.filter((x): x is Model => x instanceof Model);
    } else {
      if (typeof opt === 'number' && opt > 0) max = opt;
      detailed = symName(level) === 'detailed';
    }
    this.prepare();
    const ray = new THREE.Raycaster(toThree(pos), toThree(dir).normalize());
    const targets = (only ?? this.models).filter((m) => m.isInWorld()).flatMap((m) => m.meshList);
    const hits = ray.intersectObjects(targets as THREE.Object3D[], false);
    const out: unknown[] = [];
    const seen = new Set<Model>();
    for (const h of hits) {
      const m = h.object.userData.model as Model;
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (!detailed) out.push(m);
      else {
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3();
        out.push(
          new LPropList([
            [sym('model'), m],
            [sym('distance'), h.distance],
            [sym('isectPosition'), fromThree(h.point)],
            [sym('isectNormal'), fromThree(n)],
            [sym('meshID'), h.object.userData.meshID ?? 1],
            [sym('faceID'), (h.faceIndex ?? 0) + 1],
          ]),
        );
      }
      if (out.length >= max) break;
    }
    return new LList(out as never[]);
  }

  // ------------------------------------------------------------ drawing

  /** Bring three.js in line with the Lingo state: matrices, meshes, materials, lights. */
  prepare() {
    // Models first: a model whose meshes are (re)built here needs the matrix update
    // after, or rays miss it until the next call (the laser's first frame did).
    for (const m of this.models) m.sync();
    this.world.obj.updateMatrixWorld(true);
    this.syncLights();
  }

  private syncLights() {
    const list = [];
    for (const l of this.lights) {
      if (!l.isInWorld()) continue;
      const w = l.obj.matrixWorld;
      const t = l.typeName;
      const type = t === 'ambient' ? AMBIENT : t === 'directional' ? DIRECTIONAL : POINT;
      // Directional and spot lights shine down their node's -Z axis.
      list.push({
        type,
        color: l.rgb,
        pos: new THREE.Vector3().setFromMatrixPosition(w),
        dir: new THREE.Vector3(0, 0, -1).transformDirection(w),
        att: [l.attenuation.x, l.attenuation.y, l.attenuation.z],
      });
    }
    this.rig.set(list);
  }

  /** Move the particle systems on to `now` (ms); once per display frame however many sprites show the member. */
  advance(now: number) {
    const dt = this.lastAdvance ? Math.min(0.1, (now - this.lastAdvance) / 1000) : 0;
    if (now === this.lastAdvance) return;
    this.lastAdvance = now;
    for (const m of this.models) if (m.particles && m.isInWorld()) m.particles.update(dt);
  }

  toString() {
    return `(member ${this.number} of castLib ${this.castLib.number})`;
  }
}
