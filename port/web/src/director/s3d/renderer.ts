// The 3D sprite: draws a Shockwave 3D member's camera view into the sprite's rect.
// Shockwave draws 3D sprites directToStage, on top of everything; here each 3D sprite
// is a WebGL canvas over the 2D stage canvas, drawn at the display's frame rate.
//
// Hooks for the arena (or any movie that wants them):
//   viewRect     where the view goes (widescreen); default the sprite's rect.
//   beforeDraw   called before each draw with the progress between logic ticks.
//   interpolate  draw every node between its pose at the last two frame cycles, so
//                20 fps logic draws smoothly at 60 fps (as the arena demo does).

import * as THREE from 'three';
import { warnOnce, type Player, type SpriteRenderer } from '../player';
import type { Sprite } from '../sprite';
import { num } from '../../lingo';
import { Shockwave3dMember } from './member';
import { rgb255, type Texture3D } from './resources';
import { Camera3D, type Node3D, type Overlay } from './nodes';

/** A rect in CSS pixels, relative to the player's element. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface View {
  canvas: HTMLCanvasElement;
  gl: THREE.WebGLRenderer;
  perspective: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  overlayCam: THREE.OrthographicCamera;
  overlays: THREE.Scene;
  backdrops: THREE.Scene;
  quads: Map<Overlay, THREE.Mesh>;
  size: string;
  /** Node matrices after the last two frame cycles (interpolate). */
  prev: Map<Node3D, THREE.Matrix4>;
  cur: Map<Node3D, THREE.Matrix4>;
  cycle: number;
}

const quad = (() => {
  // A unit square from (0,0) to (1,1), y down, sampling the image's first row at the top.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
})();

export class Shockwave3dRenderer implements SpriteRenderer {
  viewRect: ((s: Sprite, p: Player) => ViewRect) | null = null;
  beforeDraw: ((s: Sprite, member: Shockwave3dMember, camera: Camera3D, progress: number) => void) | null = null;
  interpolate = false;
  private readonly views = new Map<Sprite, View>();
  private readonly drawn = new Set<Sprite>();

  /** The sprite's view rect: its stage rect on the page. */
  rectOf(s: Sprite, p: Player): ViewRect {
    if (this.viewRect) return this.viewRect(s, p);
    const b = s.bounds;
    return { x: p.left + b.left * p.scale, y: p.top + b.top * p.scale, w: (b.right - b.left) * p.scale, h: (b.bottom - b.top) * p.scale };
  }

  draw(s: Sprite, p: Player) {
    const member = s.memberRef;
    if (!(member instanceof Shockwave3dMember) || !member.state) return;
    const r = this.rectOf(s, p);
    if (r.w < 1 || r.h < 1) return;
    const v = this.view(s, p);
    this.drawn.add(s);
    const size = `${Math.round(r.w)}x${Math.round(r.h)}@${devicePixelRatio}`;
    if (v.size !== size) {
      v.size = size;
      v.gl.setPixelRatio(devicePixelRatio || 1);
      v.gl.setSize(Math.round(r.w), Math.round(r.h));
    }
    Object.assign(v.canvas.style, { left: `${r.x}px`, top: `${r.y}px`, display: 'block' });

    member.advance(performance.now());
    const camera = spriteCamera(s);
    if (!camera) return;
    const progress = p.frameProgress;
    this.beforeDraw?.(s, member, camera, progress);
    member.prepare();

    // Draw nodes between their last two frame-cycle poses, then put them back.
    const restore: [Node3D, THREE.Matrix4][] = [];
    if (this.interpolate) {
      if (v.cycle !== p.frameCycles) {
        v.cycle = p.frameCycles;
        v.prev = v.cur;
        v.cur = new Map(member.allNodes().map((n) => [n, n.obj.matrix.clone()]));
      }
      for (const [n, cur] of v.cur) {
        const prev = v.prev.get(n);
        if (!prev || n.deleted || prev.equals(cur) || !n.obj.matrix.equals(cur)) continue;
        restore.push([n, n.obj.matrix.clone()]);
        n.obj.matrix.copy(lerpMatrix(prev, cur, progress));
      }
      if (restore.length) member.world.obj.updateMatrixWorld(true);
    }

    const cam = this.threeCamera(v, camera, r.w / r.h);
    const [cr, cg, cb] = rgb255(camera.colorBuffer.clearValue);
    v.gl.setClearColor(new THREE.Color(cr / 255, cg / 255, cb / 255), 1);
    v.gl.autoClear = false;
    v.gl.clear();
    const spriteW = s.bounds.right - s.bounds.left;
    const spriteH = s.bounds.bottom - s.bounds.top;
    if (camera.backdrops.length) this.drawOverlays(v, v.backdrops, camera.backdrops, spriteW, spriteH, r, member);
    if (camera.rootNode && camera.rootNode !== member.world) warnOnce('camera.rootNode other than the world is drawn as the whole world');
    v.gl.render(member.scene, cam);
    if (camera.overlays.length) this.drawOverlays(v, v.overlays, camera.overlays, spriteW, spriteH, r, member);

    for (const [n, m] of restore) n.obj.matrix.copy(m);
    if (restore.length) member.world.obj.updateMatrixWorld(true);
  }

  private threeCamera(v: View, c: Camera3D, aspect: number): THREE.Camera {
    // The camera's world placement without scale (a mirrored parent, like the files'
    // "Scene Root", must not mirror the view).
    const w = c.worldMatrix();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    w.decompose(pos, q, new THREE.Vector3());
    let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (c.isOrthographic) {
      const o = v.ortho;
      const h = c.orthoHeight / 2;
      Object.assign(o, { left: -h * aspect, right: h * aspect, top: h, bottom: -h, near: c.hither, far: c.yon });
      cam = o;
    } else {
      const pc = v.perspective;
      Object.assign(pc, { fov: c.fieldOfView, aspect, near: c.hither, far: c.yon });
      cam = pc;
    }
    cam.matrix.compose(pos, q, new THREE.Vector3(1, 1, 1));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
  }

  /** Overlays are placed in the sprite's own pixels; a wider view keeps them centred at the same height. */
  private drawOverlays(v: View, scene: THREE.Scene, list: Overlay[], spriteW: number, spriteH: number, r: ViewRect, member: Shockwave3dMember) {
    const k = r.h / Math.max(1, spriteH);
    const w = r.w / k;
    const oc = v.overlayCam;
    Object.assign(oc, { left: -(w - spriteW) / 2, right: -(w - spriteW) / 2 + w, top: 0, bottom: spriteH, near: -1, far: 1 });
    oc.updateProjectionMatrix();
    const live = new Set(list);
    for (const [o, mesh] of v.quads) {
      if (!live.has(o) && mesh.parent === scene) {
        scene.remove(mesh);
        v.quads.delete(o);
        (mesh.material as THREE.Material).dispose();
      }
    }
    list.forEach((o, i) => {
      let mesh = v.quads.get(o);
      if (!mesh) {
        mesh = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
        mesh.matrixAutoUpdate = false;
        v.quads.set(o, mesh);
        scene.add(mesh);
      }
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const source = liveSource(member, o);
      if (mat.map !== source.three) {
        mat.map = source.three;
        mat.needsUpdate = true;
      }
      mat.opacity = Math.max(0, Math.min(100, o.blend)) / 100;
      mesh.visible = mat.opacity > 0;
      mesh.renderOrder = i;
      const tw = source.width * o.scale;
      const th = source.height * o.scale;
      const rad = (o.rotation * Math.PI) / 180;
      mesh.matrix
        .makeTranslation(num(o.loc.locH), num(o.loc.locV), 0)
        .multiply(new THREE.Matrix4().makeRotationZ(rad))
        .multiply(new THREE.Matrix4().makeScale(o.scale, o.scale, 1))
        .multiply(new THREE.Matrix4().makeTranslation(-num(o.regPoint.locH), -num(o.regPoint.locV), 0))
        .multiply(new THREE.Matrix4().makeScale(tw / (o.scale || 1), th / (o.scale || 1), 1));
    });
    v.gl.render(scene, oc);
  }

  private view(s: Sprite, p: Player): View {
    let v = this.views.get(s);
    if (v) return v;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', pointerEvents: 'none', display: 'block' });
    canvas.dataset.sprite = String(s.spriteNum);
    p.el.append(canvas);
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    v = {
      canvas,
      gl,
      perspective: new THREE.PerspectiveCamera(),
      ortho: new THREE.OrthographicCamera(),
      overlayCam: new THREE.OrthographicCamera(),
      overlays: new THREE.Scene(),
      backdrops: new THREE.Scene(),
      quads: new Map(),
      size: '',
      prev: new Map(),
      cur: new Map(),
      cycle: -1,
    };
    // Placed by matrix (threeCamera); three.js then derives matrixWorld from it.
    for (const c of [v.perspective, v.ortho, v.overlayCam]) c.matrixAutoUpdate = false;
    this.views.set(s, v);
    return v;
  }

  remove(s: Sprite) {
    const v = this.views.get(s);
    if (!v) return;
    v.gl.dispose();
    v.canvas.remove();
    this.views.delete(s);
  }

  endFrame() {
    for (const [s, v] of this.views) if (!this.drawn.has(s)) v.canvas.style.display = 'none';
    this.drawn.clear();
  }

  /** The canvas drawing a sprite (checks, screenshots). */
  canvasOf(s: Sprite): HTMLCanvasElement | undefined {
    return this.views.get(s)?.canvas;
  }
}

/**
 * The texture an overlay shows. An overlay whose texture was deleted shows the
 * member's texture of that name if one was made since (Adobe's player, checked: the
 * arena's chat deletes and remakes "Chat" for every line while its overlay stays).
 */
function liveSource(member: Shockwave3dMember, o: Overlay): Texture3D {
  if (member.textures.includes(o.source)) return o.source;
  return member.texture(o.source.name) ?? o.source;
}

function lerpMatrix(a: THREE.Matrix4, b: THREE.Matrix4, t: number): THREE.Matrix4 {
  const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3();
  const pb = new THREE.Vector3(), qb = new THREE.Quaternion(), sb = new THREE.Vector3();
  a.decompose(pa, qa, sa);
  b.decompose(pb, qb, sb);
  return new THREE.Matrix4().compose(pa.lerp(pb, t), qa.slerp(qb, t), sa.lerp(sb, t));
}

// ---------------------------------------------------------------- sprite(n).camera

/** sprite(n).camera: the camera a 3D sprite shows (the member's first camera unless set). */
export function spriteCamera(s: Sprite): Camera3D | undefined {
  const own = s.userData.camera3d as Camera3D | undefined;
  if (own && !own.deleted) return own;
  const m = s.memberRef;
  return m instanceof Shockwave3dMember ? m.cameras[0] : undefined;
}

export function setSpriteCamera(s: Sprite, c: Camera3D | undefined) {
  s.userData.camera3d = c;
}
