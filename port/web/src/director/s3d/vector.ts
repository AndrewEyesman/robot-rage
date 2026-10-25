// Lingo's 3D value types. vector() is the Lingo library's LVector (arithmetic with
// add/sub/mul/div from port/web/src/lingo, string() as Director prints it); this adds
// transform() and the binding of vectors read from nodes. Director's coordinates are
// used as they are by three.js (right-handed, y up), so the matrices are three.js's.
//
// A vector or transform read from a node property is bound to it, the way Director's
// are: `model.transform.position.y = -10000` and `model.worldPosition.y = 5` move the
// model. Arithmetic results and duplicate() are free values.

import * as THREE from 'three';
import { LVector, vector } from '../../lingo';

export { LVector as Vector, vector };
type Vector = LVector;
const Vector = LVector;

const DEG = Math.PI / 180;

/** Transforms print their 16 numbers with 6 significant digits ("1.00000", "-94.0000"). */
function f6(n: number) {
  if (n === 0 || Object.is(n, -0)) return '0.00000';
  const s = n.toPrecision(6);
  return s.includes('e') ? n.toFixed(5) : s;
}

/** A vector whose component writes go back to its source (a node or transform property). */
export function boundVector(v: THREE.Vector3, owner: (v: LVector) => void): LVector {
  const out = new LVector(v.x, v.y, v.z);
  const c = { x: v.x, y: v.y, z: v.z };
  for (const k of ['x', 'y', 'z'] as const) {
    Object.defineProperty(out, k, {
      get: () => c[k],
      set: (n: number) => {
        c[k] = +n;
        owner(out);
      },
      enumerable: true,
    });
  }
  return out;
}

export const toThree = (v: LVector) => new THREE.Vector3(v.x, v.y, v.z);
export const fromThree = (v: THREE.Vector3) => new LVector(v.x, v.y, v.z);

/** Director's rotation vector (degrees): R = Rz * Ry * Rx, X applied first. */
export function eulerMatrix(rx: number, ry: number, rz: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'ZYX'));
}

/**
 * For comparisons with dirplayer (port/tools/weapon-trace.mjs, ?s3d=dirplayer): dirplayer
 * splits a mirrored matrix without putting the mirror on z, as the port did before
 * (docs/port-issues.md #71), so its own-axis operations on mirrored nodes go the other
 * way; and it turns rotate(point, axis, angle) about a point scaled with the node. The trace runs the port the same way, to compare the translated weapons with the
 * original Lingo tick by tick.
 */
export const s3dCompat = {
  dirplayerMirrors: typeof location !== 'undefined' && new URLSearchParams(location.search).get('s3d') === 'dirplayer',
};

/** Whether Director reads the matrix as mirrored (a negative z scale; directorBasis). */
export function mirrorsOnZ(m: THREE.Matrix4): boolean {
  return m.determinant() < 0 && !s3dCompat.dirplayerMirrors;
}

/**
 * Director's split of a matrix's 3x3 part into rotation x scale: the scale is the
 * columns' lengths, with z's negative when the matrix mirrors; the rotation is what's
 * left. Measured in Adobe's player: a mirror on any axis reads as scale (1, 1, -1)
 * (`t.scale = vector(-1, 1, 1)` then reads scale (1, 1, -1), rotation (180, 0, -180)).
 * The game's models all sit under the W3D's mirroring "Scene Root", so every part
 * cloned with its world transform is mirrored, and a node's own-axis operations
 * (rotate, translate, pointAt, transform.rotation and .scale) work in this split.
 */
export function directorBasis(m: THREE.Matrix4): { rot: THREE.Matrix4; scale: THREE.Vector3 } {
  const e = m.elements;
  const scale = new THREE.Vector3(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  if (mirrorsOnZ(m)) scale.z = -scale.z;
  const k = [scale.x, scale.y, scale.z].map((x) => (Math.abs(x) > 1e-12 ? 1 / x : 0));
  const rot = new THREE.Matrix4().set(
    e[0] * k[0], e[4] * k[1], e[8] * k[2], 0,
    e[1] * k[0], e[5] * k[1], e[9] * k[2], 0,
    e[2] * k[0], e[6] * k[1], e[10] * k[2], 0,
    0, 0, 0, 1,
  );
  return { rot, scale };
}

/** The rotation vector of a matrix's rotation part (scale removed), as Director reports it. */
export function matrixEuler(m0: THREE.Matrix4): Vector {
  const m = directorBasis(m0).rot;
  const e = m.elements;
  const s0 = Math.hypot(e[0], e[1], e[2]) || 1;
  const s1 = Math.hypot(e[4], e[5], e[6]) || 1;
  const s2 = Math.hypot(e[8], e[9], e[10]) || 1;
  const n2 = e[2] / s0;
  const ry = Math.asin(Math.max(-1, Math.min(1, -n2)));
  const cy = Math.cos(ry);
  let rx: number;
  let rz: number;
  if (Math.abs(cy) > 1e-6) {
    rx = Math.atan2(e[6] / s1 / cy, e[10] / s2 / cy);
    rz = Math.atan2(e[1] / s0 / cy, e[0] / s0 / cy);
  } else {
    rx = 0;
    rz = Math.atan2(e[4] / s1, e[5] / s1);
  }
  return new LVector(rx / DEG, ry / DEG, rz / DEG);
}

/** Lingo's transform(): a 4x4 matrix (scale, then rotation, then position). */
export class Transform {
  /** The matrix; for a node's transform, the node's own local matrix. */
  private readonly m: THREE.Matrix4;
  private readonly changed: (() => void) | null;

  constructor(m?: THREE.Matrix4, changed?: () => void) {
    this.m = m ?? new THREE.Matrix4();
    this.changed = changed ?? null;
  }

  /** A copy of the matrix. */
  get matrix(): THREE.Matrix4 {
    return this.m.clone();
  }
  /** Replace the matrix (keeps the binding). */
  setMatrix(m: THREE.Matrix4) {
    this.m.copy(m);
    this.changed?.();
  }

  duplicate(): Transform {
    return new Transform(this.m.clone());
  }

  identity() {
    this.setMatrix(new THREE.Matrix4());
  }

  get position(): Vector {
    return boundVector(new THREE.Vector3().setFromMatrixPosition(this.m), (v) => (this.position = v));
  }
  set position(v: Vector) {
    this.m.setPosition(v.x, v.y, v.z);
    this.changed?.();
  }

  /** Director's scale: z's negative on a mirrored transform (directorBasis). */
  get scale(): Vector {
    return boundVector(directorBasis(this.m).scale, (v) => (this.scale = v));
  }
  /** Keeps the rotation and position: M = T * R * S(v), so a positive scale ends a mirror (as in Adobe's player). */
  set scale(v: Vector) {
    const { scale: s } = directorBasis(this.m);
    const e = this.m.elements;
    const target = [v.x, v.y, v.z];
    const cur = [s.x, s.y, s.z];
    for (let c = 0; c < 3; c++) {
      if (Math.abs(cur[c]) <= 1e-12) e[c * 4 + c] = target[c];
      else for (let r = 0; r < 3; r++) e[c * 4 + r] *= target[c] / cur[c];
    }
    this.changed?.();
  }

  get rotation(): Vector {
    return boundVector(toThree(matrixEuler(this.m)), (v) => (this.rotation = v));
  }
  /** Keeps the scale (a mirror too) and position: M = T * R(v) * S. */
  set rotation(v: Vector) {
    const s = directorBasis(this.m).scale;
    const p = new THREE.Vector3().setFromMatrixPosition(this.m);
    const r = eulerMatrix(v.x, v.y, v.z).scale(s);
    r.setPosition(p);
    this.m.copy(r);
    this.changed?.();
  }

  get xAxis(): Vector {
    return fromThree(new THREE.Vector3().setFromMatrixColumn(this.m, 0).normalize());
  }
  get yAxis(): Vector {
    return fromThree(new THREE.Vector3().setFromMatrixColumn(this.m, 1).normalize());
  }
  get zAxis(): Vector {
    return fromThree(new THREE.Vector3().setFromMatrixColumn(this.m, 2).normalize());
  }

  /**
   * transform.rotate(x, y, z) / rotate(vector) / rotate(point, axis, angle): a rotation
   * applied after the transform, about the parent's origin (the position turns too).
   */
  rotate(a: number | Vector, b?: number | Vector, c?: number) {
    this.m.premultiply(rotationOf(a, b, c));
    this.changed?.();
  }
  /** preRotate: the rotation applied first, about the transform's own axes. */
  preRotate(a: number | Vector, b?: number | Vector, c?: number) {
    this.m.multiply(rotationOf(a, b, c));
    this.changed?.();
  }
  translate(a: number | Vector, b?: number, c?: number) {
    const v = vec3(a, b, c);
    this.m.premultiply(new THREE.Matrix4().makeTranslation(v.x, v.y, v.z));
    this.changed?.();
  }
  preTranslate(a: number | Vector, b?: number, c?: number) {
    const v = vec3(a, b, c);
    this.m.multiply(new THREE.Matrix4().makeTranslation(v.x, v.y, v.z));
    this.changed?.();
  }
  /** transform.scale(x, y, z) / scale(k): scale after the transform (the position scales too). */
  scaleBy(a: number | Vector, b?: number, c?: number) {
    const v = typeof a === 'number' && b === undefined ? new THREE.Vector3(a, a, a) : vec3(a, b, c);
    this.m.premultiply(new THREE.Matrix4().makeScale(v.x, v.y, v.z));
    this.changed?.();
  }
  preScale(a: number | Vector, b?: number, c?: number) {
    const v = typeof a === 'number' && b === undefined ? new THREE.Vector3(a, a, a) : vec3(a, b, c);
    this.m.multiply(new THREE.Matrix4().makeScale(v.x, v.y, v.z));
    this.changed?.();
  }

  /** inverse(): a new transform. */
  inverse(): Transform {
    return new Transform(this.m.clone().invert());
  }
  /** invert(): in place. */
  invert() {
    this.m.invert();
    this.changed?.();
  }
  /** t1 * t2 (a transform) or t * v (a point). */
  mul(o: Transform): Transform;
  mul(o: Vector): Vector;
  mul(o: Transform | Vector): Transform | Vector {
    if (o instanceof Vector) return fromThree(toThree(o).applyMatrix4(this.m));
    return new Transform(this.m.clone().multiply(o.m));
  }
  /** multiply(t): this = t * this (t applied after). */
  multiply(o: Transform) {
    this.m.premultiply(o.m);
    this.changed?.();
  }
  preMultiply(o: Transform) {
    this.m.multiply(o.m);
    this.changed?.();
  }
  /** interpolate(t2, percent): a new transform part way to t2. */
  interpolate(o: Transform, percent: number): Transform {
    const out = this.duplicate();
    out.interpolateTo(o, percent);
    return out;
  }
  interpolateTo(o: Transform, percent: number) {
    const k = percent / 100;
    const [p1, q1, s1] = decompose(this.m);
    const [p2, q2, s2] = decompose(o.m);
    this.m.compose(p1.lerp(p2, k), q1.slerp(q2, k), s1.lerp(s2, k));
    this.changed?.();
  }

  /** transform[i]: the 16 numbers, column by column. */
  getAt(i: number): number {
    return this.m.elements[i - 1];
  }

  toLingoString() {
    return this.toString();
  }

  /** string(t): "transform(1.00000,0.00000,0.00000,0.00000, 0.00000,1.00000,...)" */
  toString() {
    const e = this.m.elements;
    const col = (c: number) => [0, 1, 2, 3].map((r) => f6(e[c * 4 + r])).join(',');
    return `transform(${col(0)}, ${col(1)}, ${col(2)}, ${col(3)})`;
  }
}

/** transform(): the identity. */
export function transform(): Transform {
  return new Transform();
}

export function decompose(m: THREE.Matrix4): [THREE.Vector3, THREE.Quaternion, THREE.Vector3] {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  return [p, q, s];
}

export function vec3(a: number | Vector, b?: number, c?: number): THREE.Vector3 {
  return a instanceof LVector ? toThree(a) : new THREE.Vector3(a, b ?? 0, c ?? 0);
}

/** The three forms of rotate's arguments: (x, y, z), (vector), (point, axis, angle). */
export function rotationOf(a: number | Vector, b?: number | Vector, c?: number): THREE.Matrix4 {
  if (a instanceof Vector && b instanceof Vector) {
    // About `axis` through `point`.
    const axis = toThree(b).normalize();
    const r = new THREE.Matrix4().makeRotationAxis(axis, (c ?? 0) * DEG);
    const p = toThree(a);
    return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  }
  const v = vec3(a, b as number | undefined, c);
  return eulerMatrix(v.x, v.y, v.z);
}
