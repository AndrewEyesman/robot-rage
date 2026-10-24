// A 3D member's shaders, textures and model resources, with the Lingo properties
// the game uses. Shaders build #standard materials (material.ts) on their member's
// lights; changing a property updates the materials in place on the next draw.

import * as THREE from 'three';
import { DColor } from '../color';
import { LColor, LList, sym, type LSymbol } from '../../lingo';
import { DImage } from '../image';
import { BitmapMember, TextualMember, type Member } from '../members';
import { drawLines } from '../text-layout';
import { warnOnce } from '../player';
import { fileName, symName } from './lists';
import { makeDirectorMaterial, updateDirectorMaterial, MAX_LAYERS, type DirectorMaterialParams, type Layer } from './material';
import type { ParticleParams } from './particles';
import { boundVector, Transform, Vector } from './vector';
import type { LayerDoc, MaterialDoc, ShaderDoc } from './w3d';
import type { Shockwave3dMember } from './member';

type RGBf = [number, number, number];

/** A colour as scripts give it: rgb() (LColor) or a runtime DColor. */
export type AnyColor = LColor | DColor;
const toColor = (c: RGBf) => new LColor(Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255));
export const rgb255 = (c: AnyColor): [number, number, number] => (c instanceof DColor ? [c.r, c.g, c.b] : [c.red, c.green, c.blue]);
const fromColor = (c: AnyColor): RGBf => rgb255(c).map((x) => x / 255) as RGBf;

// ------------------------------------------------------------------ textures

/** A texture's pixels as a GL texture, laid out like the extracted file textures. */
export function imageTexture(img: DImage): THREE.DataTexture {
  const w = Math.max(1, img.width);
  const h = Math.max(1, img.height);
  const data = new Uint8Array(w * h * 4);
  if (img.width && img.height) data.set(img.data);
  const alpha = img.depth === 32 && img.useAlpha;
  if (!alpha) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  configure(t);
  t.userData.hasAlpha = alpha;
  t.needsUpdate = true;
  return t;
}

/**
 * A text member as a texture's image: its text, anti-aliased, on a transparent
 * background the size of the member (the arena's chat and result overlays).
 */
export function textImage(m: TextualMember): DImage {
  const r = m.rect;
  const w = Math.max(1, Math.ceil(r.right - r.left));
  const h = Math.max(1, Math.ceil(r.bottom - r.top));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawLines(c.getContext('2d')!, m.lines(), 0, 0, undefined, true);
  const img = DImage.fromImage(c, 32);
  img.useAlpha = true;
  return img;
}

export function configure(t: THREE.Texture) {
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
}

export class Texture3D {
  /** fromFile, fromCastMember, fromImageObject (or empty for newTexture(name)). */
  readonly kind: string;
  /** Stored (textures are always drawn as RGBA8). */
  renderFormat: LSymbol | string = sym('default');
  /** Stored (textures are always mipmapped). */
  quality: LSymbol | string = sym('low');
  nearFiltering = true;
  compressed = false;
  /** The cast member it was made from (#fromCastMember). */
  member: Member | undefined;
  private img: DImage | undefined;

  constructor(
    public name: string,
    public three: THREE.Texture,
    type: string,
  ) {
    this.kind = type;
    this.three.name = name;
  }

  static fromImage(name: string, img: DImage, type = 'fromImageObject'): Texture3D {
    // newTexture copies the image: later changes to the bitmap don't reach the texture.
    const t = new Texture3D(name, imageTexture(img), type);
    t.img = img.duplicate();
    return t;
  }

  static fromMember(name: string, m: Member | undefined): Texture3D {
    if (m instanceof BitmapMember) {
      const t = Texture3D.fromImage(name, m.image, 'fromCastMember');
      t.member = m;
      return t;
    }
    if (m instanceof TextualMember) {
      const t = Texture3D.fromImage(name, textImage(m), 'fromCastMember');
      t.member = m;
      return t;
    }
    warnOnce(`newTexture #fromCastMember: ${m ? m.type : 'no'} member "${m?.name ?? ''}" isn't a bitmap; using an empty texture`);
    const t = Texture3D.fromImage(name, new DImage(1, 1, 32), 'fromCastMember');
    t.member = m;
    return t;
  }

  get type(): LSymbol {
    return sym(this.kind);
  }

  get width() {
    return (this.three.image as { width?: number } | undefined)?.width ?? 0;
  }
  get height() {
    return (this.three.image as { height?: number } | undefined)?.height ?? 0;
  }

  /** texture.image (a copy), and texture.image = img (replaces the pixels). */
  get image(): DImage | undefined {
    return this.img?.duplicate();
  }
  set image(img: DImage) {
    this.img = img.duplicate();
    const t = imageTexture(img);
    t.name = this.name;
    this.three = t;
    this.version++;
  }

  version = 0;

  toString() {
    return `texture("${this.name}")`;
  }
}

// ------------------------------------------------------------------ shaders

const TEXTURE_MODES = ['none', 'wrapplanar', 'wrapspherical', 'wrapcylindrical', 'reflection', 'diffuselight', 'specularlight'];
const BLEND_FUNCTIONS = ['replace', 'add', 'multiply', 'blend'];
const BLEND_SOURCES = ['alpha', 'constant'];
const LINGO_MODE: Record<string, string> = {
  none: 'none', wrapplanar: 'wrapPlanar', wrapspherical: 'wrapSpherical', wrapcylindrical: 'wrapCylindrical',
  reflection: 'reflection', diffuselight: 'diffuseLight', specularlight: 'specularLight',
};

interface LayerState {
  texture: Texture3D | undefined;
  /** Index into TEXTURE_MODES (the file's encoding). */
  mode: number;
  /** Index into BLEND_FUNCTIONS. */
  blendFunction: number;
  /** Index into BLEND_SOURCES. */
  blendSource: number;
  /** Percent. */
  blendConstant: number;
  matrix: THREE.Matrix4;
  wrap: THREE.Matrix4;
  repeat: boolean;
}

const newLayer = (): LayerState => ({
  texture: undefined,
  mode: 0,
  blendFunction: 2,
  blendSource: 1,
  blendConstant: 50,
  matrix: new THREE.Matrix4(),
  wrap: new THREE.Matrix4(),
  repeat: true,
});

/** A 1-based list property of a shader (textureList, blendFunctionList...). */
export interface ShaderPropList<T> {
  [index: number]: T;
  readonly count: number;
}

function propList<T>(get: (i: number) => T, set: (i: number, v: T) => void): ShaderPropList<T> {
  return new Proxy({} as ShaderPropList<T>, {
    get: (_t, p) => (p === 'count' ? MAX_SHADER_LAYERS : typeof p === 'string' && /^\d+$/.test(p) ? get(Number(p)) : undefined),
    set: (_t, p, v) => {
      if (typeof p === 'string' && /^\d+$/.test(p)) set(Number(p), v as T);
      return true;
    },
  });
}

/** Director's #standard shader has 8 texture layers; the renderer draws the first 3. */
const MAX_SHADER_LAYERS = 8;

export class Shader {
  readonly type = sym('standard');
  // Colours as floats (the file's values are kept exactly).
  private _ambient: RGBf = [63 / 255, 63 / 255, 63 / 255];
  private _diffuse: RGBf = [1, 1, 1];
  private _specular: RGBf = [1, 1, 1];
  private _emissive: RGBf = [0, 0, 0];
  private _shininess = 30;
  private _blend = 100;
  private _transparent = true;
  private _useDiffuseWithTexture = false;
  renderStyle: LSymbol | string = sym('fill');
  flat = false;
  silhouettes = false;
  readonly layers: LayerState[] = Array.from({ length: MAX_SHADER_LAYERS }, newLayer);
  /** Bumped on every change; materials catch up when next drawn. */
  version = 0;
  private readonly materials = new Map<string, { mat: THREE.ShaderMaterial; version: number; texVersion: number }>();

  constructor(
    public name: string,
    readonly member: Shockwave3dMember,
  ) {}

  /** A shader as the file defines it (no material: Director's DefaultShader look). */
  static fromDoc(member: Shockwave3dMember, doc: ShaderDoc | undefined, mat: MaterialDoc | undefined, name: string): Shader {
    const s = new Shader(name, member);
    s._diffuse = rgbf(mat?.diffuse, [1, 1, 1]);
    s._ambient = rgbf(mat?.ambient, [63 / 255, 63 / 255, 63 / 255]);
    s._emissive = rgbf(mat?.emissive, [0, 0, 0]);
    s._specular = rgbf(mat?.specular, [0, 0, 0]);
    s._shininess = mat?.shininess ?? 0;
    s._blend = (mat?.opacity ?? 1) * 100;
    let i = 0;
    for (const l of doc?.layers ?? []) {
      // Layers whose texture isn't in the file are left out (as the file loader does).
      const t = member.texture(fileName(l.texture));
      if (!t || i >= MAX_SHADER_LAYERS) continue;
      Object.assign(s.layers[i++], layerFromDoc(l, t));
    }
    return s;
  }

  touch() {
    this.version++;
  }

  /** Copy for cloneDeep / cloneModelFromCastmember (into `member`, under `name`). */
  copy(name: string, member: Shockwave3dMember, textureMap?: (t: Texture3D) => Texture3D): Shader {
    const s = new Shader(name, member);
    s._ambient = [...this._ambient];
    s._diffuse = [...this._diffuse];
    s._specular = [...this._specular];
    s._emissive = [...this._emissive];
    s._shininess = this._shininess;
    s._blend = this._blend;
    s._transparent = this._transparent;
    s._useDiffuseWithTexture = this._useDiffuseWithTexture;
    s.renderStyle = this.renderStyle;
    s.flat = this.flat;
    this.layers.forEach((l, i) => {
      Object.assign(s.layers[i], { ...l, matrix: l.matrix.clone(), wrap: l.wrap.clone(), texture: l.texture && textureMap ? textureMap(l.texture) : l.texture });
    });
    return s;
  }

  // ---- what the renderer needs

  params(side: THREE.Side): DirectorMaterialParams {
    const layers: Layer[] = [];
    for (const l of this.layers) {
      if (!l.texture || layers.length >= MAX_LAYERS) continue;
      layers.push({
        texture: l.texture.three,
        blendFunc: l.blendFunction,
        blendSrc: l.blendSource,
        blendConst: l.blendConstant / 100,
        mode: l.mode,
        uvSet: 0,
        transform: l.matrix,
      });
    }
    return {
      diffuse: this._diffuse,
      ambient: this._ambient,
      emissive: this._emissive,
      specular: this._specular,
      shininess: this._shininess,
      // An opaque shader ignores its blend.
      opacity: this._transparent ? this._blend / 100 : 1,
      layers,
      side,
      useDiffuseWithTexture: this._useDiffuseWithTexture,
    };
  }

  private texVersion() {
    let v = 0;
    for (const l of this.layers) v += l.texture?.version ?? 0;
    return v;
  }

  /** The material for one side setting (cached; updated if the shader changed). */
  material(side: THREE.Side, hasUv1: boolean): THREE.ShaderMaterial {
    const key = `${side}|${hasUv1}`;
    const tv = this.texVersion();
    const c = this.materials.get(key);
    if (c) {
      if (c.version !== this.version || c.texVersion !== tv) {
        updateDirectorMaterial(c.mat, this.params(side));
        c.version = this.version;
        c.texVersion = tv;
      }
      return c.mat;
    }
    const mat = makeDirectorMaterial(this.member.rig, this.params(side), hasUv1);
    mat.name = this.name;
    this.materials.set(key, { mat, version: this.version, texVersion: tv });
    return mat;
  }

  dispose() {
    for (const c of this.materials.values()) c.mat.dispose();
    this.materials.clear();
  }

  // ---- Lingo properties

  get ambient() {
    return toColor(this._ambient);
  }
  set ambient(c: AnyColor) {
    this._ambient = fromColor(c);
    this.touch();
  }
  get diffuse() {
    return toColor(this._diffuse);
  }
  set diffuse(c: AnyColor) {
    this._diffuse = fromColor(c);
    this.touch();
  }
  get specular() {
    return toColor(this._specular);
  }
  set specular(c: AnyColor) {
    this._specular = fromColor(c);
    this.touch();
  }
  get emissive() {
    return toColor(this._emissive);
  }
  set emissive(c: AnyColor) {
    this._emissive = fromColor(c);
    this.touch();
  }
  get shininess() {
    return this._shininess;
  }
  set shininess(n: number) {
    this._shininess = n;
    this.touch();
  }
  /** Opacity percent. */
  get blend() {
    return this._blend;
  }
  set blend(n: number) {
    this._blend = Math.max(0, Math.min(100, n));
    this.touch();
  }
  get transparent() {
    return this._transparent;
  }
  set transparent(v: boolean | number) {
    this._transparent = !!v;
    this.touch();
  }
  get useDiffuseWithTexture() {
    return this._useDiffuseWithTexture;
  }
  set useDiffuseWithTexture(v: boolean | number) {
    this._useDiffuseWithTexture = !!v;
    this.touch();
  }

  /** shader.texture is textureList[1]. */
  get texture(): Texture3D | undefined {
    return this.layers[0].texture;
  }
  set texture(t: Texture3D | undefined) {
    this.layers[0].texture = t || undefined;
    this.touch();
  }
  get textureList(): ShaderPropList<Texture3D | undefined> {
    return propList(
      (i) => this.layers[i - 1]?.texture,
      (i, t) => {
        if (this.layers[i - 1]) this.layers[i - 1].texture = t || undefined;
        this.touch();
      },
    );
  }
  /** Assigning a single value to a *List property sets every layer. */
  set textureList(t: Texture3D | undefined | ShaderPropList<Texture3D | undefined>) {
    for (const l of this.layers) l.texture = (t as Texture3D) || undefined;
    this.touch();
  }

  get textureMode(): LSymbol {
    return sym(LINGO_MODE[TEXTURE_MODES[this.layers[0].mode]] ?? 'none');
  }
  set textureMode(m: LSymbol | string) {
    this.setLayer(1, 'mode', modeOf(m));
  }
  get textureModeList(): ShaderPropList<LSymbol | string> {
    return propList<LSymbol | string>(
      (i) => sym(LINGO_MODE[TEXTURE_MODES[this.layers[i - 1]?.mode ?? 0]]),
      (i, m) => this.setLayer(i, 'mode', modeOf(m)),
    );
  }
  get blendFunction(): LSymbol {
    return sym(BLEND_FUNCTIONS[this.layers[0].blendFunction]);
  }
  set blendFunction(f: LSymbol | string) {
    this.setLayer(1, 'blendFunction', Math.max(0, BLEND_FUNCTIONS.indexOf(symName(f))));
  }
  get blendFunctionList(): ShaderPropList<LSymbol | string> {
    return propList<LSymbol | string>(
      (i) => sym(BLEND_FUNCTIONS[this.layers[i - 1]?.blendFunction ?? 2]),
      (i, f) => this.setLayer(i, 'blendFunction', Math.max(0, BLEND_FUNCTIONS.indexOf(symName(f)))),
    );
  }
  get blendSource(): LSymbol {
    return sym(BLEND_SOURCES[this.layers[0].blendSource]);
  }
  set blendSource(f: LSymbol | string) {
    this.setLayer(1, 'blendSource', Math.max(0, BLEND_SOURCES.indexOf(symName(f))));
  }
  get blendSourceList(): ShaderPropList<LSymbol | string> {
    return propList<LSymbol | string>(
      (i) => sym(BLEND_SOURCES[this.layers[i - 1]?.blendSource ?? 1]),
      (i, f) => this.setLayer(i, 'blendSource', Math.max(0, BLEND_SOURCES.indexOf(symName(f)))),
    );
  }
  get blendConstant(): number {
    return this.layers[0].blendConstant;
  }
  set blendConstant(n: number) {
    this.setLayer(1, 'blendConstant', n);
  }
  get blendConstantList(): ShaderPropList<number> {
    return propList(
      (i) => this.layers[i - 1]?.blendConstant ?? 50,
      (i, n) => this.setLayer(i, 'blendConstant', n),
    );
  }
  get textureRepeat(): boolean {
    return this.layers[0].repeat;
  }
  set textureRepeat(v: boolean | number) {
    this.setLayer(1, 'repeat', !!v);
  }

  /** textureTransform: bound to the layer (`.position = ...`, `.rotate(...)` change it). */
  get textureTransform(): Transform {
    return this.layerTransform(1, 'matrix');
  }
  set textureTransform(t: Transform) {
    this.layers[0].matrix.copy(t.matrix);
    this.touch();
  }
  get textureTransformList(): ShaderPropList<Transform> {
    return propList(
      (i) => this.layerTransform(i, 'matrix'),
      (i, t) => {
        this.layers[i - 1]?.matrix.copy(t.matrix);
        this.touch();
      },
    );
  }
  /**
   * wrapTransform orients the #wrapPlanar/#wrapSpherical/#wrapCylindrical projections
   * only; it does nothing to #none layers (dirplayer wrongly applies it to the UVs).
   * Stored: the wrap projections themselves aren't drawn yet (see textureMode).
   */
  get wrapTransform(): Transform {
    return this.layerTransform(1, 'wrap');
  }
  set wrapTransform(t: Transform) {
    this.layers[0].wrap.copy(t.matrix);
    this.touch();
  }
  get wrapTransformList(): ShaderPropList<Transform> {
    return propList(
      (i) => this.layerTransform(i, 'wrap'),
      (i, t) => {
        this.layers[i - 1]?.wrap.copy(t.matrix);
        this.touch();
      },
    );
  }

  private layerTransform(i: number, which: 'matrix' | 'wrap'): Transform {
    const l = this.layers[i - 1] ?? this.layers[0];
    return new Transform(l[which], () => this.touch());
  }

  private setLayer<K extends keyof LayerState>(i: number, k: K, v: LayerState[K]) {
    const l = this.layers[i - 1];
    if (!l) return;
    l[k] = v;
    this.touch();
  }

  toString() {
    return `shader("${this.name}")`;
  }
}

function modeOf(m: unknown): number {
  const i = TEXTURE_MODES.indexOf(symName(m));
  if (i > 0 && i !== 4) warnOnce(`textureMode #${symName(m)} is drawn with the mesh's own texture coordinates`);
  return Math.max(0, i);
}

function rgbf(c: number[] | undefined, dflt: RGBf): RGBf {
  return c ? [c[0], c[1], c[2]] : dflt;
}

function layerFromDoc(l: LayerDoc, t: Texture3D): Partial<LayerState> {
  return {
    texture: t,
    mode: l.mode,
    blendFunction: l.blendFunc,
    blendSource: l.blendSrc,
    blendConstant: l.blendConst * 100,
    matrix: new THREE.Matrix4().fromArray(l.texTransform),
  };
}

// ------------------------------------------------------------------ model resources

/** Director's particle defaults (Scripting Dictionary). */
export const PARTICLE_DEFAULTS: ParticleParams = {
  lifeTime: 10000,
  colorStart: [255, 255, 255],
  colorEnd: [255, 255, 255],
  sizeStart: 1,
  sizeEnd: 1,
  blendStart: 100,
  blendEnd: 100,
  mode: 'stream',
  loop: true,
  direction: [1, 0, 0],
  angle: 180,
  minSpeed: 1,
  maxSpeed: 1,
  gravity: [0, 0, 0],
  drag: 0,
  numParticles: 1000,
};

/** colorRange / sizeRange / blendRange: `.start` and `.end`. */
export interface Range<T> {
  start: T;
  end: T;
}

/** pr.emitter */
export interface Emitter {
  mode: LSymbol | string;
  loop: boolean | number;
  direction: Vector;
  distribution: LSymbol | string;
  angle: number;
  minSpeed: number;
  maxSpeed: number;
  numParticles: number;
  region: unknown;
  path: unknown;
  pathStrength: number;
}

/**
 * A model resource: from the file (#fromFile), a primitive (#box, #sphere, #plane,
 * #cylinder) or a particle system (#particle). One class carries every type's
 * properties, as Lingo doesn't distinguish them.
 */
export class ModelResource {
  /** Bumped when the geometry or particle setup changes (models rebuild). */
  version = 0;
  private geos: THREE.BufferGeometry[] | null = null;
  // Primitive dimensions (Director's defaults).
  private dims: Record<string, number> = {};
  /** For #plane: which faces show (#front, #back, #both). */
  facing: LSymbol | string = sym('front');
  // Particle state.
  particle: ParticleParams | null = null;
  private _texture: Texture3D | undefined;
  tweenMode: LSymbol | string = sym('velocity');
  distribution = 'linear';
  region: unknown = undefined;
  path: unknown = undefined;
  pathStrength = 0.1;
  private _wind = new Vector(0, 0, 0);
  /** Particle systems drawing this resource, one per model; they follow every change. */
  readonly listeners = new Set<(c: Partial<ParticleParams>) => void>();

  constructor(
    public name: string,
    /** Lowercase type: fromfile, box, sphere, plane, cylinder, particle, mesh. */
    readonly kind: string,
    readonly member: Shockwave3dMember,
    /** File resources: the submesh geometries and their default shader names. */
    private readonly fileGeometry?: THREE.BufferGeometry[],
    readonly fileShaders?: string[],
  ) {
    const type = kind;
    if (type === 'box') this.dims = { width: 50, height: 50, length: 50 };
    else if (type === 'sphere') this.dims = { radius: 25, resolution: 20 };
    else if (type === 'plane') this.dims = { width: 1, length: 1, lengthVertices: 2, widthVertices: 2 };
    else if (type === 'cylinder') this.dims = { topRadius: 25, bottomRadius: 25, height: 50, resolution: 20, numSegments: 2 };
    else if (type === 'particle') this.particle = { ...PARTICLE_DEFAULTS };
    else if (type !== 'fromfile') warnOnce(`newModelResource #${type} isn't supported (no geometry)`);
  }

  /** #fromFile, #box, #particle... */
  get type(): LSymbol {
    return sym(this.kind === 'fromfile' ? 'fromFile' : this.kind);
  }

  /** The submesh geometries (none for #particle). */
  geometries(): THREE.BufferGeometry[] {
    if (this.fileGeometry) return this.fileGeometry;
    if (this.particle) return [];
    return (this.geos ??= [primitive(this.kind, this.dims)].filter((g): g is THREE.BufferGeometry => !!g));
  }

  private dim(k: string) {
    return this.dims[k] ?? 0;
  }
  private setDim(k: string, v: number) {
    this.dims[k] = v;
    this.geos?.forEach((g) => g.dispose());
    this.geos = null;
    this.version++;
  }
  get width() {
    return this.dim('width');
  }
  set width(v) {
    this.setDim('width', v);
  }
  get height() {
    return this.dim('height');
  }
  set height(v) {
    this.setDim('height', v);
  }
  get length() {
    return this.dim('length');
  }
  set length(v) {
    this.setDim('length', v);
  }
  get radius() {
    return this.dim('radius');
  }
  set radius(v) {
    this.setDim('radius', v);
  }
  get resolution() {
    return this.dim('resolution');
  }
  set resolution(v) {
    this.setDim('resolution', v);
  }
  get topRadius() {
    return this.dim('topRadius');
  }
  set topRadius(v) {
    this.setDim('topRadius', v);
  }
  get bottomRadius() {
    return this.dim('bottomRadius');
  }
  set bottomRadius(v) {
    this.setDim('bottomRadius', v);
  }

  // ---- #particle

  private setParticle(c: Partial<ParticleParams>) {
    if (!this.particle) return;
    Object.assign(this.particle, c);
    for (const l of this.listeners) l(c);
  }
  private p(): ParticleParams {
    return this.particle ?? { ...PARTICLE_DEFAULTS };
  }

  get texture(): Texture3D | undefined {
    return this._texture;
  }
  set texture(t: Texture3D | undefined) {
    this._texture = t || undefined;
    this.version++;
  }
  /** Milliseconds. */
  get lifeTime() {
    return this.p().lifeTime;
  }
  set lifeTime(v: number) {
    this.setParticle({ lifeTime: v });
  }
  get drag() {
    return this.p().drag;
  }
  set drag(v: number) {
    this.setParticle({ drag: v });
  }
  get gravity(): Vector {
    const g = this.p().gravity;
    return boundVector(new THREE.Vector3(...g), (v) => (this.gravity = v));
  }
  set gravity(v: Vector) {
    this.setParticle({ gravity: [v.x, v.y, v.z] });
  }
  /** Stored; the simulation has no wind yet (the game only sets it to zero). */
  get wind(): Vector {
    return this._wind.duplicate();
  }
  set wind(v: Vector) {
    this._wind = v.duplicate();
    if (v.x || v.y || v.z) warnOnce('particle wind is not simulated');
  }
  get colorRange(): Range<AnyColor> {
    const self = this;
    return {
      get start() {
        const c = self.p().colorStart;
        return new LColor(c[0], c[1], c[2]);
      },
      set start(c: AnyColor) {
        self.setParticle({ colorStart: rgb255(c) });
      },
      get end() {
        const c = self.p().colorEnd;
        return new LColor(c[0], c[1], c[2]);
      },
      set end(c: AnyColor) {
        self.setParticle({ colorEnd: rgb255(c) });
      },
    };
  }
  get sizeRange(): Range<number> {
    const self = this;
    return {
      get start() {
        return self.p().sizeStart;
      },
      set start(v: number) {
        self.setParticle({ sizeStart: v });
      },
      get end() {
        return self.p().sizeEnd;
      },
      set end(v: number) {
        self.setParticle({ sizeEnd: v });
      },
    };
  }
  get blendRange(): Range<number> {
    const self = this;
    return {
      get start() {
        return self.p().blendStart;
      },
      set start(v: number) {
        self.setParticle({ blendStart: v });
      },
      get end() {
        return self.p().blendEnd;
      },
      set end(v: number) {
        self.setParticle({ blendEnd: v });
      },
    };
  }
  get emitter(): Emitter {
    const self = this;
    return {
      get mode(): LSymbol | string {
        return sym(self.p().mode);
      },
      set mode(m: LSymbol | string) {
        self.setParticle({ mode: symName(m) === 'burst' ? 'burst' : 'stream' });
      },
      get loop() {
        return self.p().loop;
      },
      set loop(v: boolean | number) {
        self.setParticle({ loop: !!v });
      },
      get direction() {
        return boundVector(new THREE.Vector3(...self.p().direction), (v) => (this.direction = v));
      },
      set direction(v: Vector) {
        self.setParticle({ direction: [v.x, v.y, v.z] });
      },
      /** Stored; births are uniform within the cone (#gaussian isn't simulated). */
      get distribution(): LSymbol | string {
        return sym(self.distribution);
      },
      set distribution(d: LSymbol | string) {
        self.distribution = symName(d);
      },
      get angle() {
        return self.p().angle;
      },
      set angle(v: number) {
        self.setParticle({ angle: v });
      },
      get minSpeed() {
        return self.p().minSpeed;
      },
      set minSpeed(v: number) {
        self.setParticle({ minSpeed: v });
      },
      get maxSpeed() {
        return self.p().maxSpeed;
      },
      set maxSpeed(v: number) {
        self.setParticle({ maxSpeed: v });
      },
      get numParticles() {
        return self.p().numParticles;
      },
      set numParticles(v: number) {
        self.setParticle({ numParticles: Math.max(0, Math.trunc(v)) });
      },
      /** Stored; particles are born at the model's position. */
      get region() {
        return self.region;
      },
      set region(v: unknown) {
        self.region = v;
      },
      /** Stored; paths aren't followed. */
      get path() {
        return self.path;
      },
      set path(v: unknown) {
        self.path = v;
      },
      get pathStrength() {
        return self.pathStrength;
      },
      set pathStrength(v: number) {
        self.pathStrength = v;
      },
    };
  }

  /** The vertices of each submesh, in model space (meshDeform's vertexList). */
  vertexLists(): LList[] {
    return this.geometries().map((g) => {
      const pos = g.getAttribute('position');
      const out: Vector[] = [];
      for (let i = 0; i < pos.count; i++) out.push(new Vector(pos.getX(i), pos.getY(i), pos.getZ(i)));
      return new LList(out);
    });
  }

  toString() {
    return `modelResource("${this.name}")`;
  }
}

/** Director's primitives, with texture coordinates in the CLOD convention (minus 0.5). */
function primitive(type: string, d: Record<string, number>): THREE.BufferGeometry | null {
  let g: THREE.BufferGeometry;
  switch (type) {
    case 'box':
      g = new THREE.BoxGeometry(d.width, d.height, d.length);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(d.radius, Math.max(3, d.resolution * 2), Math.max(2, d.resolution));
      break;
    case 'plane':
      g = new THREE.PlaneGeometry(d.width, d.length);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(d.topRadius, d.bottomRadius, d.height, Math.max(3, d.resolution * 2));
      break;
    default:
      return null;
  }
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) - 0.5, uv.getY(i) - 0.5);
  g.computeBoundingSphere();
  return g;
}
