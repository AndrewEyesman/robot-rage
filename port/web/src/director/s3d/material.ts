// A material that shades like Shockwave 3D's #standard shader: per-vertex lighting
// (emissive + ambient + diffuse from each light, clamped), then up to three texture
// layers combined with the shader's blend functions. Colours are used as stored, with
// no colour management, the way Director's renderer did.

import * as THREE from 'three';

export const MAX_LIGHTS = 4;
export const MAX_LAYERS = 3;

// Light types, as in the uniforms.
export const AMBIENT = 0;
export const DIRECTIONAL = 1;
export const POINT = 2;

/** The scene's lights, shared by every material (uniform objects are shared). */
export class LightRig {
  readonly uniforms = {
    uNumLights: { value: 0 },
    uLightType: { value: new Int32Array(MAX_LIGHTS) },
    uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
    uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
    uLightDir: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, 0, -1)) },
    uLightAtt: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(1, 0, 0)) },
    uAmbientLight: { value: new THREE.Vector3() },
  };

  set(lights: { type: number; color: number[]; pos?: THREE.Vector3; dir?: THREE.Vector3; att?: number[] }[]) {
    const u = this.uniforms;
    u.uAmbientLight.value.set(0, 0, 0);
    let n = 0;
    for (const l of lights) {
      if (l.type === AMBIENT) {
        u.uAmbientLight.value.add(new THREE.Vector3(l.color[0], l.color[1], l.color[2]));
        continue;
      }
      if (n >= MAX_LIGHTS) continue;
      u.uLightType.value[n] = l.type;
      u.uLightColor.value[n].set(l.color[0], l.color[1], l.color[2]);
      if (l.pos) u.uLightPos.value[n].copy(l.pos);
      if (l.dir) u.uLightDir.value[n].copy(l.dir).normalize();
      const a = l.att ?? [1, 0, 0];
      u.uLightAtt.value[n].set(a[0], a[1], a[2]);
      n++;
    }
    u.uNumLights.value = n;
  }
}

export interface Layer {
  texture: THREE.Texture;
  /** File encoding: 0 #replace, 1 #add, 2 #multiply, 3 #blend. */
  blendFunc: number;
  /** 0 #alpha, 1 #constant. */
  blendSrc: number;
  blendConst: number;
  /** 0 #none (mesh UVs), 4 #reflection; others are treated as #none. */
  mode: number;
  /** UV set to read (falls back to set 0). */
  uvSet: number;
  transform: THREE.Matrix4;
}

export interface DirectorMaterialParams {
  diffuse: number[];
  ambient: number[];
  emissive: number[];
  specular?: number[];
  /** 0 draws no highlight. */
  shininess?: number;
  opacity: number;
  layers: Layer[];
  side: THREE.Side;
  /** Director lights textured surfaces with white unless useDiffuseWithTexture. */
  useDiffuseWithTexture?: boolean;
}

const vertexShader = /* glsl */ `
uniform int uNumLights;
uniform int uLightType[${MAX_LIGHTS}];
uniform vec3 uLightColor[${MAX_LIGHTS}];
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightDir[${MAX_LIGHTS}];
uniform vec3 uLightAtt[${MAX_LIGHTS}];
uniform vec3 uAmbientLight;
uniform vec3 uEmissive;
uniform vec3 uAmbient;
uniform vec3 uDiffuse;
uniform vec3 uSpecular;
uniform float uShininess;
uniform mat4 uTexTransform[${MAX_LAYERS}];
uniform int uMode[${MAX_LAYERS}];
uniform int uUvSet[${MAX_LAYERS}];
#ifdef HAS_UV1
attribute vec2 uv1;
#endif
varying vec3 vColor;
varying vec3 vSpecular;
varying vec3 vBackColor;
varying vec3 vBackSpecular;
varying vec2 vUv[${MAX_LAYERS}];

// Fixed-function lighting for one side of the surface (normal n).
void light(vec3 wp, vec3 n, out vec3 color, out vec3 spec) {
  vec3 d = vec3(0.0);
  vec3 sp = vec3(0.0);
  vec3 V = normalize(cameraPosition - wp);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec3 L;
    float att = 1.0;
    if (uLightType[i] == ${DIRECTIONAL}) {
      L = -uLightDir[i];
    } else {
      vec3 v = uLightPos[i] - wp;
      float dist = length(v);
      L = v / max(dist, 1e-6);
      att = 1.0 / max(uLightAtt[i].x + uLightAtt[i].y * dist + uLightAtt[i].z * dist * dist, 1e-6);
    }
    float ndl = dot(n, L);
    d += uLightColor[i] * max(ndl, 0.0) * att;
    if (uShininess > 0.0 && ndl > 0.0) sp += uLightColor[i] * pow(max(dot(n, normalize(L + V)), 0.0), uShininess) * att;
  }
  color = clamp(uEmissive + uAmbientLight * uAmbient + d * uDiffuse, 0.0, 1.0);
  spec = clamp(sp * uSpecular, 0.0, 1.0);
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  // Two-sided lighting: light both sides per vertex and let each pixel take the side
  // it shows (gl_FrontFacing). The normals are rebuilt from each face's winding (the
  // decoder can't read the stored ones), and winding doesn't say which side the
  // files' authored normals face: the arena floor is wound facing down yet lit from
  // above. Flipping the normal per vertex toward the camera instead made lighting
  // pop on smoothed models as the camera moved. Known miss: a model drawn inside
  // out (the arena's barrel, #back) gets lit where Adobe's player leaves it dark.
  light(wp.xyz, n, vColor, vSpecular);
  light(wp.xyz, -n, vBackColor, vBackSpecular);

  vec3 vn = normalize(normalMatrix * normal);
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    vec2 t = uv;
#ifdef HAS_UV1
    if (uUvSet[i] == 1) t = uv1;
#endif
    if (uMode[i] == 4) {
      vUv[i] = vn.xy * 0.5 + 0.5;
      continue;
    }
    // CLOD meshes store Director's UVs minus 0.5. The texture matrix works in
    // Director's UV space; V then flips, as the image's first row is v = 1.
    vec2 dv = (uTexTransform[i] * vec4(t + 0.5, 0.0, 1.0)).xy;
    vUv[i] = vec2(dv.x, 1.0 - dv.y);
  }
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
uniform int uNumLayers;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform int uBlendFunc[${MAX_LAYERS}];
uniform int uBlendSrc[${MAX_LAYERS}];
uniform float uBlendConst[${MAX_LAYERS}];
varying vec3 vColor;
varying vec3 vSpecular;
varying vec3 vBackColor;
varying vec3 vBackSpecular;
varying vec2 vUv[${MAX_LAYERS}];

vec4 combine(vec4 col, vec4 t, int i) {
  int f = uBlendFunc[i];
  if (f == 0) return vec4(t.rgb, col.a * t.a);
  if (f == 1) return vec4(col.rgb + t.rgb * (uBlendSrc[i] == 0 ? t.a : 1.0), col.a);
  if (f == 2) return vec4(col.rgb * t.rgb, col.a * t.a);
  float k = uBlendSrc[i] == 0 ? t.a : uBlendConst[i];
  return vec4(mix(col.rgb, t.rgb, k), col.a);
}

void main() {
  vec4 col = vec4(gl_FrontFacing ? vColor : vBackColor, uOpacity);
  if (uNumLayers > 0) col = combine(col, texture2D(uTex0, vUv[0]), 0);
  if (uNumLayers > 1) col = combine(col, texture2D(uTex1, vUv[1]), 1);
  if (uNumLayers > 2) col = combine(col, texture2D(uTex2, vUv[2]), 2);
  if (col.a < 0.004) discard;
  // Fixed-function specular is added after texturing.
  gl_FragColor = vec4(clamp(col.rgb + (gl_FrontFacing ? vSpecular : vBackSpecular), 0.0, 1.0), col.a);
}
`;

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

export function makeDirectorMaterial(rig: LightRig, p: DirectorMaterialParams, hasUv1 = false): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: hasUv1 ? { HAS_UV1: '' } : {},
    uniforms: {
      ...rig.uniforms,
      uEmissive: { value: new THREE.Vector3() },
      uAmbient: { value: new THREE.Vector3() },
      uDiffuse: { value: new THREE.Vector3() },
      uSpecular: { value: new THREE.Vector3() },
      uShininess: { value: 0 },
      uOpacity: { value: 1 },
      uNumLayers: { value: 0 },
      uTex0: { value: white },
      uTex1: { value: white },
      uTex2: { value: white },
      uBlendFunc: { value: new Int32Array(MAX_LAYERS) },
      uBlendSrc: { value: new Int32Array(MAX_LAYERS) },
      uBlendConst: { value: [0, 0, 0] },
      uMode: { value: new Int32Array(MAX_LAYERS) },
      uUvSet: { value: new Int32Array(MAX_LAYERS) },
      uTexTransform: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
    },
  });
  updateDirectorMaterial(mat, p);
  return mat;
}

/** Apply (changed) shader parameters to a material made by makeDirectorMaterial. */
export function updateDirectorMaterial(mat: THREE.ShaderMaterial, p: DirectorMaterialParams) {
  const layers = p.layers.slice(0, MAX_LAYERS);
  const textured = layers.length > 0;
  const diffuse = textured && !p.useDiffuseWithTexture ? [1, 1, 1] : p.diffuse;
  const transparent = p.opacity < 1 || layers.some((l) => (l.texture.userData.hasAlpha as boolean) && l.blendFunc !== 1);
  const u = mat.uniforms;
  u.uEmissive.value.set(p.emissive[0], p.emissive[1], p.emissive[2]);
  u.uAmbient.value.set(p.ambient[0], p.ambient[1], p.ambient[2]);
  u.uDiffuse.value.set(diffuse[0], diffuse[1], diffuse[2]);
  const sp = p.specular ?? [0, 0, 0];
  u.uSpecular.value.set(sp[0], sp[1], sp[2]);
  u.uShininess.value = p.shininess ?? 0;
  u.uOpacity.value = p.opacity;
  u.uNumLayers.value = layers.length;
  u.uTex0.value = layers[0]?.texture ?? white;
  u.uTex1.value = layers[1]?.texture ?? white;
  u.uTex2.value = layers[2]?.texture ?? white;
  for (let i = 0; i < MAX_LAYERS; i++) {
    u.uBlendFunc.value[i] = layers[i]?.blendFunc ?? 2;
    u.uBlendSrc.value[i] = layers[i]?.blendSrc ?? 1;
    u.uBlendConst.value[i] = layers[i]?.blendConst ?? 0.5;
    u.uMode.value[i] = layers[i]?.mode ?? 0;
    u.uUvSet.value[i] = layers[i]?.uvSet ?? 0;
    u.uTexTransform.value[i] = layers[i]?.transform ?? identity;
  }
  if (mat.side !== p.side || mat.transparent !== transparent) mat.needsUpdate = true;
  mat.side = p.side;
  mat.transparent = transparent;
  mat.depthWrite = p.opacity >= 1;
}

const identity = new THREE.Matrix4();
