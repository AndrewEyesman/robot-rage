// Loads a Shockwave 3D member exported by port/extract and builds Three.js objects
// from its scene graph. Names are matched case-insensitively, as Director does.

import * as THREE from 'three';
import { LightRig, makeDirectorMaterial, type Layer } from './director-material';

type Range = [number, number];

interface NodeDoc {
  name: string;
  parent: string;
  type: 'group' | 'model' | 'light' | 'view';
  resource: string;
  modelResource: string;
  shader: string;
  visibility: number;
  transform: number[];
  near: number;
  far: number;
  fov: number;
}

interface LayerDoc {
  texture: string;
  intensity: number;
  blendFunc: number;
  blendSrc: number;
  blendConst: number;
  mode: number;
  texTransform: number[];
}

interface ShaderDoc {
  name: string;
  material: string;
  layers: LayerDoc[];
}

interface MaterialDoc {
  name: string;
  ambient: number[];
  diffuse: number[];
  specular: number[];
  emissive: number[];
  opacity: number;
  shininess: number;
}

interface MeshDoc {
  shader: string | null;
  positions: Range;
  normals: Range;
  uvs: Range[];
  faces: Range;
}

interface ResourceDoc {
  meshes: MeshDoc[];
  bindings?: { name: string; meshes: string[] }[];
}

export interface LightDoc {
  name: string;
  type: 'ambient' | 'directional' | 'point' | 'spot';
  color: number[];
  attenuation: number[];
}

interface W3dDoc {
  bin: string;
  nodes: NodeDoc[];
  shaders: ShaderDoc[];
  materials: MaterialDoc[];
  lights: LightDoc[];
  textures: Record<string, { file: string; alpha: boolean }>;
  resources: Record<string, ResourceDoc>;
}

const lc = (s: string) => s.toLowerCase();

export class W3dMember {
  private readonly nodes = new Map<string, NodeDoc>();
  private readonly shaders = new Map<string, ShaderDoc>();
  private readonly materials = new Map<string, MaterialDoc>();
  private readonly resources = new Map<string, ResourceDoc>();
  private readonly geometries = new Map<string, THREE.BufferGeometry[]>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly shaderMaterials = new Map<string, THREE.ShaderMaterial>();

  private constructor(
    readonly doc: W3dDoc,
    private readonly bin: ArrayBuffer,
    private readonly dir: string,
    private readonly rig: LightRig,
  ) {
    for (const n of doc.nodes) this.nodes.set(lc(n.name), n);
    for (const s of doc.shaders) this.shaders.set(lc(s.name), s);
    for (const m of doc.materials) this.materials.set(lc(m.name), m);
    for (const [k, r] of Object.entries(doc.resources)) this.resources.set(lc(k), r);
  }

  /** Load `<dir>/<name>.json` and its binary. */
  static async load(dir: string, name: string, rig: LightRig): Promise<W3dMember> {
    const doc: W3dDoc = await (await fetch(`${dir}/${name}.json`)).json();
    const bin = await (await fetch(`${dir}/${doc.bin}`)).arrayBuffer();
    const m = new W3dMember(doc, bin, dir, rig);
    await m.loadTextures();
    return m;
  }

  private async loadTextures() {
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(this.doc.textures).map(async ([name, t]) => {
        const tex = await loader.loadAsync(`${this.dir}/${t.file}`);
        tex.flipY = false;
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearMipmapNearestFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.userData.hasAlpha = t.alpha;
        tex.name = name;
        this.textures.set(lc(name), tex);
      }),
    );
  }

  node(name: string): NodeDoc | undefined {
    return this.nodes.get(lc(name));
  }

  get lights(): LightDoc[] {
    return this.doc.lights;
  }

  /** A node's local transform. */
  localMatrix(name: string): THREE.Matrix4 {
    const n = this.node(name);
    return n ? new THREE.Matrix4().fromArray(n.transform) : new THREE.Matrix4();
  }

  /** A node's transform relative to the world (Director's getWorldTransform()). */
  worldMatrix(name: string): THREE.Matrix4 {
    const n = this.node(name);
    if (!n) return new THREE.Matrix4();
    const m = this.localMatrix(name);
    if (n.parent && this.node(n.parent)) return this.worldMatrix(n.parent).multiply(m);
    return m;
  }

  childrenOf(name: string): NodeDoc[] {
    return this.doc.nodes.filter((n) => lc(n.parent) === lc(name));
  }

  texture(name: string): THREE.Texture | undefined {
    return this.textures.get(lc(name));
  }

  private geometry(resName: string): THREE.BufferGeometry[] {
    const key = lc(resName);
    const cached = this.geometries.get(key);
    if (cached) return cached;
    const res = this.resources.get(key);
    const f32 = (r: Range) => new Float32Array(this.bin, r[0], r[1]);
    const u32 = (r: Range) => new Uint32Array(this.bin, r[0], r[1]);
    const list = (res?.meshes ?? []).map((m) => {
      const g = new THREE.BufferGeometry();
      const pos = f32(m.positions);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const nrm = f32(m.normals);
      if (nrm.length === pos.length) g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      m.uvs.forEach((r, i) => {
        const uv = f32(r);
        if (uv.length * 3 === pos.length * 2 && i < 2) g.setAttribute(i === 0 ? 'uv' : 'uv1', new THREE.BufferAttribute(uv, 2));
      });
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.setIndex(new THREE.BufferAttribute(u32(m.faces), 1));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      g.computeBoundingSphere();
      return g;
    });
    this.geometries.set(key, list);
    return list;
  }

  /** The shader a resource's submesh is bound to: the first specific binding wins. */
  private submeshShader(resName: string, i: number, nodeShader: string): string {
    const res = this.resources.get(lc(resName));
    const isDefault = (s: string) => !s || lc(s) === 'defaultshader';
    for (const b of res?.bindings ?? []) {
      const s = b.meshes[i];
      if (lc(b.name) !== 'default' && s && !isDefault(s)) return s;
    }
    if (nodeShader && !isDefault(nodeShader)) return nodeShader;
    return 'DefaultShader';
  }

  /** A material for one of this member's shaders (cached per shader and side). */
  material(shaderName: string, side: THREE.Side, hasUv1: boolean): THREE.ShaderMaterial {
    const key = `${lc(shaderName)}|${side}|${hasUv1}`;
    const cached = this.shaderMaterials.get(key);
    if (cached) return cached;
    const sh = this.shaders.get(lc(shaderName));
    const mat = sh ? this.materials.get(lc(sh.material)) : undefined;
    const layers: Layer[] = [];
    for (const l of sh?.layers ?? []) {
      const texture = this.texture(l.texture);
      if (!texture) continue;
      layers.push({
        texture,
        blendFunc: l.blendFunc,
        blendSrc: l.blendSrc,
        blendConst: l.blendConst,
        mode: l.mode,
        uvSet: 0,
        transform: new THREE.Matrix4().fromArray(l.texTransform),
      });
    }
    const m = makeDirectorMaterial(
      this.rig,
      {
        // Director's DefaultShader material: white diffuse, 63/255 ambient.
        diffuse: mat?.diffuse ?? [1, 1, 1],
        ambient: mat?.ambient ?? [63 / 255, 63 / 255, 63 / 255],
        emissive: mat?.emissive ?? [0, 0, 0],
        specular: mat?.specular,
        shininess: mat?.shininess ?? 0,
        opacity: mat?.opacity ?? 1,
        layers,
        side,
      },
      hasUv1,
    );
    m.name = shaderName;
    this.shaderMaterials.set(key, m);
    return m;
  }

  /**
   * Build a node (and, unless `deep` is false, its descendants) as Three.js objects.
   * Model nodes become a Group holding one Mesh per submesh, so child nodes can hang
   * off the group without inheriting mesh state.
   */
  build(name: string, deep = true): THREE.Group {
    const n = this.node(name)!;
    const g = new THREE.Group();
    g.name = n.name;
    new THREE.Matrix4().fromArray(n.transform).decompose(g.position, g.quaternion, g.scale);
    if (n.type === 'model') {
      const resName = n.modelResource || n.resource;
      const side = n.visibility === 2 ? THREE.BackSide : n.visibility === 3 ? THREE.DoubleSide : THREE.FrontSide;
      this.geometry(resName).forEach((geo, i) => {
        const shader = this.submeshShader(resName, i, n.shader);
        const mesh = new THREE.Mesh(geo, this.material(shader, side, !!geo.getAttribute('uv1')));
        mesh.name = `${n.name}#${i}`;
        mesh.userData.submesh = i;
        mesh.visible = n.visibility !== 0;
        g.add(mesh);
      });
      g.userData.isModel = true;
    }
    if (deep) for (const c of this.childrenOf(n.name)) g.add(this.build(c.name));
    return g;
  }

  /** Every node under the world, keyed by lower-case name. */
  buildWorld(): { root: THREE.Group; byName: Map<string, THREE.Group> } {
    const root = new THREE.Group();
    root.name = 'world';
    for (const n of this.doc.nodes) {
      if (!n.parent || lc(n.parent) === 'world') root.add(this.build(n.name));
    }
    const byName = new Map<string, THREE.Group>();
    root.traverse((o) => {
      if (o instanceof THREE.Group) byName.set(lc(o.name), o);
    });
    return { root, byName };
  }
}

/** Show or hide a model's own meshes (Director's model.visibility = #none). */
export function setModelVisible(g: THREE.Object3D, visible: boolean) {
  for (const c of g.children) if (c instanceof THREE.Mesh) c.visible = visible;
}

/** Set which faces a model draws (Director's #front / #back / #both). */
export function setModelSide(g: THREE.Object3D, side: THREE.Side, rig: LightRig) {
  for (const c of g.children) {
    if (c instanceof THREE.Mesh) {
      c.material = cloneMaterial(c.material as THREE.ShaderMaterial, rig);
      c.material.side = side;
      c.visible = true;
    }
  }
}

/** Clone a Director material, keeping it on the shared light uniforms. */
export function cloneMaterial(m: THREE.ShaderMaterial, rig: LightRig): THREE.ShaderMaterial {
  const c = m.clone();
  Object.assign(c.uniforms, rig.uniforms);
  return c;
}

