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
varying vec2 vUv[${MAX_LAYERS}];

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  // Light the side facing the viewer: the files' normals face either way (every
  // model sits under a mirroring scene root), and dirplayer's match to Adobe's
  // player does the same.
  if (dot(n, cameraPosition - wp.xyz) < 0.0) n = -n;
  vec3 d = vec3(0.0);
  vec3 sp = vec3(0.0);
  vec3 V = normalize(cameraPosition - wp.xyz);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uNumLights) break;
    vec3 L;
    float att = 1.0;
    if (uLightType[i] == ${DIRECTIONAL}) {
      L = -uLightDir[i];
    } else {
      vec3 v = uLightPos[i] - wp.xyz;
      float dist = length(v);
      L = v / max(dist, 1e-6);
      att = 1.0 / max(uLightAtt[i].x + uLightAtt[i].y * dist + uLightAtt[i].z * dist * dist, 1e-6);
    }
    float ndl = dot(n, L);
    d += uLightColor[i] * max(ndl, 0.0) * att;
    if (uShininess > 0.0 && ndl > 0.0) sp += uLightColor[i] * pow(max(dot(n, normalize(L + V)), 0.0), uShininess) * att;
  }
  vColor = clamp(uEmissive + uAmbientLight * uAmbient + d * uDiffuse, 0.0, 1.0);
  vSpecular = clamp(sp * uSpecular, 0.0, 1.0);

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
  vec4 col = vec4(vColor, uOpacity);
  if (uNumLayers > 0) col = combine(col, texture2D(uTex0, vUv[0]), 0);
  if (uNumLayers > 1) col = combine(col, texture2D(uTex1, vUv[1]), 1);
  if (uNumLayers > 2) col = combine(col, texture2D(uTex2, vUv[2]), 2);
  if (col.a < 0.004) discard;
  // Fixed-function specular is added after texturing.
  gl_FragColor = vec4(clamp(col.rgb + vSpecular, 0.0, 1.0), col.a);
}
`;

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

export function makeDirectorMaterial(rig: LightRig, p: DirectorMaterialParams, hasUv1 = false): THREE.ShaderMaterial {
  const layers = p.layers.slice(0, MAX_LAYERS);
  const textured = layers.length > 0;
  const diffuse = textured && !p.useDiffuseWithTexture ? [1, 1, 1] : p.diffuse;
  const tex = (i: number) => layers[i]?.texture ?? white;
  const transparent = p.opacity < 1 || layers.some((l) => (l.texture.userData.hasAlpha as boolean) && l.blendFunc !== 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: hasUv1 ? { HAS_UV1: '' } : {},
    uniforms: {
      ...rig.uniforms,
      uEmissive: { value: new THREE.Vector3(p.emissive[0], p.emissive[1], p.emissive[2]) },
      uAmbient: { value: new THREE.Vector3(p.ambient[0], p.ambient[1], p.ambient[2]) },
      uDiffuse: { value: new THREE.Vector3(diffuse[0], diffuse[1], diffuse[2]) },
      uSpecular: { value: new THREE.Vector3(...((p.specular ?? [0, 0, 0]).slice(0, 3) as [number, number, number])) },
      uShininess: { value: p.shininess ?? 0 },
      uOpacity: { value: p.opacity },
      uNumLayers: { value: layers.length },
      uTex0: { value: tex(0) },
      uTex1: { value: tex(1) },
      uTex2: { value: tex(2) },
      uBlendFunc: { value: new Int32Array([0, 1, 2].map((i) => layers[i]?.blendFunc ?? 2)) },
      uBlendSrc: { value: new Int32Array([0, 1, 2].map((i) => layers[i]?.blendSrc ?? 1)) },
      uBlendConst: { value: [0, 1, 2].map((i) => layers[i]?.blendConst ?? 0.5) },
      uMode: { value: new Int32Array([0, 1, 2].map((i) => layers[i]?.mode ?? 0)) },
      uUvSet: { value: new Int32Array([0, 1, 2].map((i) => layers[i]?.uvSet ?? 0)) },
      uTexTransform: { value: [0, 1, 2].map((i) => layers[i]?.transform ?? new THREE.Matrix4()) },
    },
    side: p.side,
    transparent,
    depthWrite: p.opacity >= 1,
  });
  return mat;
}
