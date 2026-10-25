// The nodes of a 3D member's world: models, groups, lights and cameras, with the
// Lingo node API (transform, worldPosition, rotate, translate, pointAt, addChild,
// clone...). Each node owns a THREE.Group whose matrix IS the node's transform (no
// decomposition, so shear and mirroring survive, as in Director); a model's meshes
// hang off its group as THREE.Mesh children, beside its child nodes' groups.

import * as THREE from 'three';
import { LColor, LList, LPoint, sym, type LSymbol } from '../../lingo';
import { warnOnce } from '../player';
import { nameKey, nodeList, symName, type NodeList } from './lists';
import { ParticleSystem, type ParticleParams } from './particles';
import { ModelResource, Shader, Texture3D, rgb255, type AnyColor } from './resources';
import { boundVector, directorBasis, eulerMatrix, fromThree, mirrorsOnZ, s3dCompat, toThree, Transform, rotationOf, Vector } from './vector';
import type { Shockwave3dMember } from './member';

export type NodeKind = 'model' | 'group' | 'light' | 'camera';

/** relativeTo for rotate/translate: #self (default), #parent, #world or a node. */
type RelativeTo = LSymbol | string | Node3D | undefined;

const VISIBILITY = ['none', 'front', 'back', 'both'];
const SIDE: Record<string, THREE.Side> = { front: THREE.FrontSide, back: THREE.BackSide, both: THREE.DoubleSide };

let serials = 0;

export abstract class Node3D {
  abstract readonly kind: NodeKind;
  /** The node's group; its matrix is the node's local transform. */
  readonly obj = new THREE.Group();
  parentNode: Node3D | null = null;
  readonly children: Node3D[] = [];
  /** Creation order (clone names follow it). */
  serial = serials++;
  /** Set once deleted from its member; Lingo references to it are dead. */
  deleted = false;
  /** Lingo's node.userData property list. */
  userData: unknown = undefined;

  constructor(
    public name: string,
    readonly member: Shockwave3dMember,
  ) {
    this.obj.matrixAutoUpdate = false;
    this.obj.name = name;
    this.obj.userData.node = this;
  }

  touch() {
    this.obj.matrixWorldNeedsUpdate = true;
  }

  // ---- transforms

  /** node.transform: bound to the node (`.position.y = 0`, `.rotate(...)` move it). */
  get transform(): Transform {
    return new Transform(this.obj.matrix, () => this.touch());
  }
  set transform(t: Transform) {
    this.obj.matrix.copy(t.matrix);
    this.touch();
  }

  /** The world matrix, walking the parents (not three.js's cached one). */
  worldMatrix(): THREE.Matrix4 {
    const m = this.obj.matrix.clone();
    return this.parentNode ? this.parentNode.worldMatrix().multiply(m) : m;
  }
  private parentWorld(): THREE.Matrix4 {
    return this.parentNode ? this.parentNode.worldMatrix() : new THREE.Matrix4();
  }

  getWorldTransform(): Transform {
    return new Transform(this.worldMatrix());
  }

  get worldPosition(): Vector {
    return boundVector(new THREE.Vector3().setFromMatrixPosition(this.worldMatrix()), (v) => (this.worldPosition = v));
  }
  set worldPosition(v: Vector) {
    const p = toThree(v).applyMatrix4(this.parentWorld().invert());
    this.obj.matrix.setPosition(p);
    this.touch();
  }

  /** The frame a rotation or translation is expressed in, relative to the parent. */
  private applyInFrame(delta: THREE.Matrix4, rel: RelativeTo) {
    const m = this.obj.matrix;
    if (rel instanceof Node3D) {
      const pw = this.parentWorld();
      const nw = rel.worldMatrix();
      const r = pw.clone().invert().multiply(nw).multiply(delta).multiply(nw.clone().invert()).multiply(pw);
      m.premultiply(r);
    } else if (symName(rel) === 'world') {
      const pw = this.parentWorld();
      m.premultiply(pw.clone().invert().multiply(delta).multiply(pw));
    } else if (symName(rel) === 'parent') {
      m.premultiply(delta);
    } else {
      m.multiply(delta);
    }
    this.touch();
  }

  /**
   * rotate(x, y, z {, relativeTo}), rotate(vector {, relativeTo}) or
   * rotate(point, axis, angle {, relativeTo}). #self (the default) turns the node about
   * its own axes and position; #parent and #world turn it about that frame's origin,
   * so the position orbits (Director's rotate, unlike preRotate).
   */
  rotate(a: number | Vector, b?: number | Vector | RelativeTo, c?: number | RelativeTo, d?: RelativeTo) {
    let r: THREE.Matrix4;
    let rel: RelativeTo;
    if (a instanceof Vector && b instanceof Vector) {
      r = rotationOf(a, b, c as number);
      rel = d;
    } else if (a instanceof Vector) {
      r = rotationOf(a);
      rel = b as RelativeTo;
    } else {
      r = eulerMatrix(a, b as number, c as number);
      rel = d;
    }
    if (rel === undefined || symName(rel) === 'self') {
      // dirplayer turns about a point scaled with the node (M * delta; s3dCompat).
      if (a instanceof Vector && b instanceof Vector && s3dCompat.dirplayerMirrors) this.applyInFrame(r, rel);
      else this.applySelf(r);
      return;
    }
    this.applyInFrame(r, rel);
  }

  /**
   * A rotation (or a turn about a point) in the node's own frame: Director splits the
   * transform into T * R * S (directorBasis: a mirror is S's negative z) and makes it
   * T * R * delta * S, so the axes and the pivot point are R's, unscaled and never
   * mirrored. Measured in Adobe's player on mirrored and scaled models; a plain M * delta
   * turned a mirrored part the wrong way about x and y (the claws, the axe). A sheared
   * basis takes M * delta.
   */
  private applySelf(delta: THREE.Matrix4) {
    const m = this.obj.matrix;
    const { rot, scale } = directorBasis(m);
    const e = rot.elements;
    const cols = [0, 1, 2].map((c) => new THREE.Vector3(e[c * 4], e[c * 4 + 1], e[c * 4 + 2]));
    const maxDot = Math.max(Math.abs(cols[0].dot(cols[1])), Math.abs(cols[0].dot(cols[2])), Math.abs(cols[1].dot(cols[2])));
    if (!(maxDot < 1e-3 && [scale.x, scale.y, scale.z].every((x) => Math.abs(x) > 1e-8))) {
      m.multiply(delta);
      this.touch();
      return;
    }
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const out = rot.multiply(delta).scale(scale);
    out.elements[12] += pos.x;
    out.elements[13] += pos.y;
    out.elements[14] += pos.z;
    m.copy(out);
    this.touch();
  }

  /**
   * translate(x, y, z {, relativeTo}) / translate(vector {, relativeTo}); #self moves
   * along the node's own unscaled axes, R's of directorBasis: on a mirrored node z
   * points against the matrix's z column (measured in Adobe's player).
   */
  translate(a: number | Vector, b?: number | RelativeTo, c?: number, d?: RelativeTo) {
    const v = a instanceof Vector ? toThree(a) : new THREE.Vector3(a, b as number, c);
    const rel = a instanceof Vector ? (b as RelativeTo) : d;
    const m = this.obj.matrix;
    const e = m.elements;
    if (rel instanceof Node3D || symName(rel) === 'world') {
      // A world (or node) direction, into the parent's frame.
      const frame = rel instanceof Node3D ? rel.worldMatrix() : new THREE.Matrix4();
      const dir = v.clone().transformDirection(frame).multiplyScalar(v.length());
      const inv = this.parentWorld().invert();
      const local = dir.applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));
      e[12] += local.x;
      e[13] += local.y;
      e[14] += local.z;
    } else if (symName(rel) === 'parent') {
      e[12] += v.x;
      e[13] += v.y;
      e[14] += v.z;
    } else {
      const mirror = mirrorsOnZ(m);
      for (let c2 = 0; c2 < 3; c2++) {
        const l = Math.hypot(e[c2 * 4], e[c2 * 4 + 1], e[c2 * 4 + 2]) || 1;
        const k = ((c2 === 2 && mirror ? -1 : 1) * [v.x, v.y, v.z][c2]) / l;
        e[12] += e[c2 * 4] * k;
        e[13] += e[c2 * 4 + 1] * k;
        e[14] += e[c2 * 4 + 2] * k;
      }
    }
    this.touch();
  }

  /** scale(k) / scale(x, y, z) / scale(vector): scales the node along its own axes (the position stays). */
  scale(a: number | Vector, b?: number, c?: number) {
    const s = a instanceof Vector ? toThree(a) : b === undefined ? new THREE.Vector3(a, a, a) : new THREE.Vector3(a, b, c ?? 1);
    const e = this.obj.matrix.elements;
    for (let i = 0; i < 3; i++) {
      e[i] *= s.x;
      e[4 + i] *= s.y;
      e[8 + i] *= s.z;
    }
    this.touch();
  }

  /**
   * pointAt(vector or node {, up}): turn the node in place so the -Z axis of its world
   * rotation (directorBasis) faces the target, with Y toward `up` (default
   * vector(0, 1, 0)), keeping its world scale, a mirror too. Measured in Adobe's player:
   * a mirrored node's matrix z column ends up pointing at the target (the laser beam).
   */
  pointAt(target: Vector | Node3D, up?: Vector) {
    const t = target instanceof Node3D ? target.worldMatrix() : null;
    const tp = t ? new THREE.Vector3().setFromMatrixPosition(t) : toThree(target as Vector);
    const world = this.worldMatrix();
    const pos = new THREE.Vector3().setFromMatrixPosition(world);
    if (tp.distanceToSquared(pos) < 1e-12 || !Number.isFinite(tp.x + tp.y + tp.z)) return;
    let u = up ? toThree(up).normalize() : new THREE.Vector3(0, 1, 0);
    const fwd = tp.clone().sub(pos).normalize();
    if (Math.abs(u.dot(fwd)) > 0.999) u = new THREE.Vector3(1, 0, 0);
    const look = new THREE.Matrix4().lookAt(pos, tp, u).scale(directorBasis(world).scale).setPosition(pos);
    this.obj.matrix.copy(this.parentWorld().invert().multiply(look));
    this.touch();
  }

  // ---- hierarchy

  get parent(): Node3D | undefined {
    return this.parentNode ?? undefined;
  }
  /**
   * node.parent = n keeps the node's local transform (as dirplayer does; Director's
   * dictionary doesn't say whether it preserves the world transform like addChild's
   * default). parent = VOID takes it out of the world.
   */
  set parent(p: Node3D | undefined) {
    if (p) p.attach(this, false);
    else this.detach();
  }

  /** addChild(node {, #preserveWorld | #preserveParent}). */
  addChild(node: Node3D, mode?: LSymbol | string) {
    this.attach(node, symName(mode) !== 'preserveparent');
  }

  attach(node: Node3D, keepWorld: boolean) {
    if (node === this || this.isDescendantOf(node)) return warnOnce(`addChild: ${node.name} can't be its own ancestor`);
    if (keepWorld) {
      const w = node.worldMatrix();
      node.obj.matrix.copy(this.worldMatrix().invert().multiply(w));
    }
    node.detach();
    node.parentNode = this;
    this.children.push(node);
    this.obj.add(node.obj);
    node.touch();
  }

  detach() {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    if (i >= 0) p.children.splice(i, 1);
    p.obj.remove(this.obj);
    this.parentNode = null;
  }

  isDescendantOf(n: Node3D): boolean {
    for (let p = this.parentNode; p; p = p.parentNode) if (p === n) return true;
    return false;
  }

  /** node.child("name"), node.child(i), node.child[i], node.child.count */
  get child(): NodeList<Node3D> {
    return nodeList(() => this.children);
  }

  /** Every node below this one, in creation order. */
  descendants(): Node3D[] {
    const out: Node3D[] = [];
    const walk = (n: Node3D) => n.children.forEach((c) => (out.push(c), walk(c)));
    walk(this);
    return out.sort((a, b) => a.serial - b.serial);
  }

  isInWorld(): boolean {
    const w = this.member.world;
    return (this as Node3D) === w || this.isDescendantOf(w);
  }
  /** Back into the world, as a child of the World group (local transform kept). */
  addToWorld() {
    if (!this.isInWorld()) this.member.world.attach(this, false);
  }
  /** Out of the world (parent becomes VOID); the node keeps existing in its member. */
  removeFromWorld() {
    this.detach();
  }

  // ---- cloning

  /** A copy of just this node (no children), not yet in any list. */
  protected abstract copyNode(name: string, deep: boolean): Node3D;

  /**
   * clone(name): a copy of the node and all its children under the same parent, sharing
   * resources and shaders. cloneDeep(name) also copies the model resources, shaders and
   * textures. Children are named "<original>-copy<N>" (Director's convention, as
   * dirplayer verified against frog01).
   */
  clone(name: string): Node3D {
    return this.cloneTree(name, false);
  }
  cloneDeep(name: string): Node3D {
    return this.cloneTree(name, true);
  }

  private cloneTree(name: string, deep: boolean): Node3D {
    const m = this.member;
    if (name && m.nodeNamed(name)) throw new Error(`clone("${name}"): Object with duplicate name already exists`);
    const root = name || `${this.name}-copy`;
    const names = new Map<Node3D, string>([[this, root]]);
    const taken = (s: string) => !!m.nodeNamed(s) || [...names.values()].some((x) => nameKey(x) === nameKey(s));
    let n = 1;
    const nameOf = (x: Node3D) => {
      if (names.has(x)) return;
      while (taken(`${x.name}-copy${n}`)) n++;
      names.set(x, `${x.name}-copy${n}`);
    };
    // Each unnamed node in creation order, then its parent if that's in the subtree.
    const subtree = this.descendants();
    for (const d of subtree) {
      nameOf(d);
      if (d.parentNode && d.parentNode !== this && subtree.includes(d.parentNode)) nameOf(d.parentNode);
    }
    const copies = new Map<Node3D, Node3D>();
    for (const src of [this, ...subtree]) {
      const c = src.copyNode(names.get(src)!, deep);
      c.obj.matrix.copy(src.obj.matrix);
      c.userData = src.userData;
      copies.set(src, c);
      m.register(c);
    }
    for (const src of subtree) copies.get(src.parentNode!)!.attach(copies.get(src)!, false);
    const top = copies.get(this)!;
    if (this.parentNode) this.parentNode.attach(top, false);
    return top;
  }

  // ---- bounds

  /** [center, radius] in world space, covering the node's models and their children. */
  get boundingSphere(): LList {
    const box = new THREE.Box3();
    this.obj.updateWorldMatrix(true, true);
    this.obj.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry && !(o.userData.particles as boolean)) {
        o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld));
      }
    });
    if (box.isEmpty()) return new LList([fromThree(new THREE.Vector3().setFromMatrixPosition(this.worldMatrix())), 0]);
    const s = box.getBoundingSphere(new THREE.Sphere());
    return new LList([fromThree(s.center), s.radius]);
  }

  /** Per-draw bookkeeping (models rebuild meshes and materials here). */
  sync(): void {}

  toString() {
    return `${this.kind}("${this.name}")`;
  }
  toLingoString() {
    return this.toString();
  }
}

export class Group3D extends Node3D {
  readonly kind = 'group' as const;
  protected copyNode(name: string): Node3D {
    return new Group3D(name, this.member);
  }
}

// ---------------------------------------------------------------- models

/** model.shaderList: shaderList[i] (get/set), count, and properties set on every shader. */
export interface ShaderList {
  [index: number]: Shader;
  readonly count: number;
  ambient: AnyColor;
  diffuse: AnyColor;
  specular: AnyColor;
  emissive: AnyColor;
  shininess: number;
  blend: number;
  transparent: boolean | number;
  texture: Texture3D | undefined;
  textureMode: LSymbol | string;
  renderStyle: LSymbol | string;
  useDiffuseWithTexture: boolean | number;
  flat: boolean;
}

export class Model extends Node3D {
  readonly kind = 'model' as const;
  private _resource: ModelResource | undefined;
  private shaders: Shader[] = [];
  private _visibility = 'front';
  private meshes: THREE.Mesh[] = [];
  private built: { resource: ModelResource | undefined; version: number } | null = null;
  particles: ParticleSystem | null = null;
  private particleListener: ((c: Partial<ParticleParams>) => void) | null = null;
  private particleTexture: Texture3D | undefined;
  readonly modifiers = new Set<string>();

  constructor(name: string, member: Shockwave3dMember, resource?: ModelResource, shaders?: Shader[]) {
    super(name, member);
    this._resource = resource;
    this.shaders = shaders ?? [];
    this.fillShaders();
  }

  /** One shader per mesh (Director's DefaultShader where none is given). */
  private fillShaders() {
    const n = Math.max(1, this._resource?.geometries().length ?? 1);
    while (this.shaders.length < n) this.shaders.push(this.shaders[this.shaders.length - 1] ?? this.member.defaultShader);
  }

  get resource(): ModelResource | undefined {
    return this._resource;
  }
  set resource(r: ModelResource | undefined) {
    this._resource = r || undefined;
    this.fillShaders();
  }

  /** #front, #back, #both or #none. */
  get visibility(): LSymbol {
    return sym(this._visibility);
  }
  set visibility(v: LSymbol | string) {
    const s = symName(v);
    if (VISIBILITY.includes(s)) this._visibility = s;
  }
  setVisibilityIndex(i: number) {
    this._visibility = VISIBILITY[i] ?? 'front';
  }

  get shaderList(): ShaderList {
    const self = this;
    const each = (k: string, v: unknown) => new Set(self.shaders).forEach((s) => ((s as unknown as Record<string, unknown>)[k] = v));
    return new Proxy({} as ShaderList, {
      get(_t, p) {
        if (p === 'count') return self.shaders.length;
        if (typeof p === 'string' && /^\d+$/.test(p)) return self.shaders[Number(p) - 1];
        if (typeof p === 'string') return (self.shaders[0] as unknown as Record<string, unknown>)?.[p];
        return undefined;
      },
      set(_t, p, v) {
        if (typeof p === 'string' && /^\d+$/.test(p)) {
          const i = Number(p) - 1;
          if (i >= 0 && i < self.shaders.length) self.shaders[i] = v as Shader;
        } else if (typeof p === 'string') each(p, v);
        return true;
      },
    });
  }
  /** model.shaderList = shader sets every entry. */
  set shaderList(s: Shader | ShaderList) {
    if (s instanceof Shader) this.shaders = this.shaders.map(() => s);
    else this.shaders = Array.from({ length: s.count }, (_, i) => s[i + 1]);
  }
  /** model.shader is shaderList[1]; setting it sets every entry. */
  get shader(): Shader {
    return this.shaders[0];
  }
  set shader(s: Shader) {
    this.shaders = this.shaders.map(() => s);
  }

  // ---- modifiers

  addModifier(m: LSymbol | string) {
    const k = symName(m);
    if (k !== 'meshdeform') warnOnce(`addModifier #${k} isn't supported`);
    this.modifiers.add(k);
  }
  removeModifier(m: LSymbol | string) {
    this.modifiers.delete(symName(m));
  }
  get modifier(): LList {
    return new LList([...this.modifiers].map((k) => sym(k === 'meshdeform' ? 'meshDeform' : k)));
  }
  /** meshDeform (read side): meshDeform.mesh[k].vertexList, in model space. */
  get meshDeform() {
    if (!this.modifiers.has('meshdeform')) return undefined;
    const lists = this._resource?.vertexLists() ?? [];
    return { mesh: nodeList(() => lists.map((vertexList) => ({ name: '', vertexList }))) };
  }

  // ---- drawing

  /** Bring the meshes in line with the resource, shaders and visibility. */
  sync() {
    const r = this._resource;
    if (!this.built || this.built.resource !== r || this.built.version !== r?.version) this.rebuild();
    if (this.particles) return this.syncParticles();
    const side = SIDE[this._visibility] ?? THREE.FrontSide;
    const shown = this._visibility !== 'none';
    this.meshes.forEach((mesh, i) => {
      mesh.visible = shown;
      const sh = this.shaders[i] ?? this.shaders[this.shaders.length - 1] ?? this.member.defaultShader;
      mesh.material = sh.material(side, !!mesh.geometry.getAttribute('uv1'));
    });
  }

  private rebuild() {
    for (const m of this.meshes) this.obj.remove(m);
    this.meshes = [];
    this.dropParticles();
    const r = this._resource;
    this.built = { resource: r, version: r?.version ?? 0 };
    if (!r) return;
    if (r.particle) {
      const p = new ParticleSystem({ ...r.particle }, (r.texture?.three ?? blank()) as THREE.Texture, new THREE.Vector3(), 128);
      p.growable = true;
      p.mesh.userData.particles = true;
      this.particleListener = (c) => p.set(c);
      r.listeners.add(this.particleListener);
      this.particles = p;
      this.particleTexture = r.texture;
      this.member.scene.add(p.mesh);
      return;
    }
    this.fillShaders();
    r.geometries().forEach((g, i) => {
      // Invisible meshes still count for modelsUnderRay (the robots' dummy boxes rely on it).
      const mesh = new THREE.Mesh(g, this.member.defaultShader.material(THREE.FrontSide, false));
      mesh.name = `${this.name}#${i}`;
      mesh.userData.model = this;
      mesh.userData.meshID = i + 1;
      this.meshes.push(mesh);
      this.obj.add(mesh);
    });
  }

  private syncParticles() {
    const p = this.particles!;
    const r = this._resource!;
    if (r.texture !== this.particleTexture) {
      this.particleTexture = r.texture;
      p.texture = (r.texture?.three ?? blank()) as THREE.Texture;
    }
    p.mesh.visible = this._visibility !== 'none' && this.isInWorld();
    // Particles live in the world; they're born at the model's position, or at the
    // emitter's region when that is a single point (in the model's space), which the
    // weapons use to put sparks where a hit was.
    const region = r.region;
    const pt = region instanceof LList && region.count === 1 ? region.getAt(1) : undefined;
    if (pt instanceof Vector) p.emitter.copy(toThree(pt).applyMatrix4(this.worldMatrix()));
    else p.emitter.setFromMatrixPosition(this.worldMatrix());
  }

  private dropParticles() {
    if (!this.particles) return;
    this.member.scene.remove(this.particles.mesh);
    if (this.particleListener) this._resource?.listeners.delete(this.particleListener);
    this.built?.resource?.listeners.delete(this.particleListener!);
    this.particles = null;
    this.particleListener = null;
  }

  /** The model's meshes (for rays). */
  get meshList(): readonly THREE.Mesh[] {
    return this.meshes;
  }

  dispose() {
    this.dropParticles();
  }

  protected copyNode(name: string, deep: boolean): Node3D {
    const m = this.member;
    if (!deep) {
      const c = new Model(name, m, this._resource, [...this.shaders]);
      c._visibility = this._visibility;
      return c;
    }
    const res = this._resource ? m.copyResource(this._resource) : undefined;
    const shaderMap = new Map<Shader, Shader>();
    const shaders = this.shaders.map((s) => {
      if (s === m.defaultShader) return s;
      if (!shaderMap.has(s)) shaderMap.set(s, m.copyShader(s));
      return shaderMap.get(s)!;
    });
    const c = new Model(name, m, res, shaders);
    c._visibility = this._visibility;
    return c;
  }
}

let blankTexture: THREE.DataTexture | null = null;
function blank(): THREE.DataTexture {
  if (!blankTexture) {
    blankTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blankTexture.needsUpdate = true;
  }
  return blankTexture;
}

// ---------------------------------------------------------------- lights

export class Light3D extends Node3D {
  readonly kind = 'light' as const;
  /** ambient, directional, point, spot */
  private _type: string;
  private _color: [number, number, number];
  attenuation: Vector;
  spotAngle: number;
  specular: boolean;

  constructor(name: string, member: Shockwave3dMember, type: string, color: number[] = [1, 1, 1], attenuation: number[] = [1, 0, 0], spotAngle = 90, specular = true) {
    super(name, member);
    this._type = type;
    this._color = [color[0], color[1], color[2]];
    this.attenuation = new Vector(attenuation[0], attenuation[1], attenuation[2]);
    this.spotAngle = spotAngle;
    this.specular = specular;
  }

  get type(): LSymbol {
    return sym(this._type);
  }
  set type(t: LSymbol | string) {
    this._type = symName(t);
  }
  get typeName() {
    return this._type;
  }
  get color(): LColor {
    return new LColor(Math.round(this._color[0] * 255), Math.round(this._color[1] * 255), Math.round(this._color[2] * 255));
  }
  set color(c: AnyColor) {
    this._color = rgb255(c).map((x) => x / 255) as [number, number, number];
  }
  /** The colour as floats (the file's exact values). */
  get rgb(): [number, number, number] {
    return this._color;
  }

  protected copyNode(name: string): Node3D {
    return new Light3D(name, this.member, this._type, this._color, [this.attenuation.x, this.attenuation.y, this.attenuation.z], this.spotAngle, this.specular);
  }
}

// ---------------------------------------------------------------- cameras

/** An overlay or backdrop: a texture drawn over (or under) the camera's view. */
export class Overlay {
  readonly name = '';
  /** Percent. */
  blend = 100;
  scale = 1;
  constructor(
    public source: Texture3D,
    /** Where the regPoint goes, in the sprite's pixels. */
    public loc: LPoint,
    /** Degrees, clockwise. */
    public rotation: number,
    public regPoint: LPoint = new LPoint(0, 0),
  ) {}
}

export class Camera3D extends Node3D {
  readonly kind = 'camera' as const;
  /** Vertical field of view, degrees. */
  fieldOfView: number;
  hither: number;
  yon: number;
  private _projection = 'perspective';
  orthoHeight = 200;
  /** The node the camera draws (the world by default). */
  rootNode: Node3D | undefined;
  readonly overlays: Overlay[] = [];
  readonly backdrops: Overlay[] = [];
  readonly colorBuffer = { clearValue: new LColor(0, 0, 0) as AnyColor, clearAtRender: true as boolean | number };
  readonly fog = { enabled: false as boolean | number, near: 1, far: 1000, color: new LColor(0, 0, 0) as AnyColor, decayMode: sym('linear') as LSymbol | string };

  constructor(name: string, member: Shockwave3dMember, fov = 30, hither = 5, yon = 10000) {
    super(name, member);
    this.fieldOfView = fov;
    this.hither = hither;
    this.yon = yon;
  }

  get projection(): LSymbol {
    return sym(this._projection);
  }
  set projection(p: LSymbol | string) {
    this._projection = symName(p) === 'orthographic' ? 'orthographic' : 'perspective';
  }
  get isOrthographic() {
    return this._projection === 'orthographic';
  }
  get projectionAngle() {
    return this.fieldOfView;
  }
  set projectionAngle(v: number) {
    this.fieldOfView = v;
  }

  /** camera.overlay[i] / camera.overlay.count (overlays are found by index). */
  get overlay(): NodeList<Overlay> {
    return nodeList(() => this.overlays);
  }
  get backdrop(): NodeList<Overlay> {
    return nodeList(() => this.backdrops);
  }
  addOverlay(t: Texture3D, loc: LPoint, rotation = 0) {
    this.overlays.push(new Overlay(t, loc, rotation));
  }
  insertOverlay(index: number, t: Texture3D, loc: LPoint, rotation = 0) {
    this.overlays.splice(Math.max(0, index - 1), 0, new Overlay(t, loc, rotation));
  }
  removeOverlay(index: number) {
    if (index >= 1 && index <= this.overlays.length) this.overlays.splice(index - 1, 1);
  }
  addBackdrop(t: Texture3D, loc: LPoint, rotation = 0) {
    this.backdrops.push(new Overlay(t, loc, rotation));
  }
  insertBackdrop(index: number, t: Texture3D, loc: LPoint, rotation = 0) {
    this.backdrops.splice(Math.max(0, index - 1), 0, new Overlay(t, loc, rotation));
  }
  removeBackdrop(index: number) {
    if (index >= 1 && index <= this.backdrops.length) this.backdrops.splice(index - 1, 1);
  }

  protected copyNode(name: string): Node3D {
    const c = new Camera3D(name, this.member, this.fieldOfView, this.hither, this.yon);
    c._projection = this._projection;
    c.orthoHeight = this.orthoHeight;
    return c;
  }
}
