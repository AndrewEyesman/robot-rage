// Shockwave 3D #particle resources, as the arena builds them (InitFirePit): a
// stream or burst of textured billboards whose colour, size and opacity tween from
// start to end over each particle's life. The simulation follows dirplayer's model
// of Director's particle systems, which is written from the Director 11.5
// Scripting Dictionary (emitter cone angle, speed band, loop, gravity, drag).

import * as THREE from 'three';

export interface ParticleParams {
  /** Milliseconds. */
  lifeTime: number;
  colorStart: [number, number, number];
  colorEnd: [number, number, number];
  sizeStart: number;
  sizeEnd: number;
  /** Opacity percent (0-100). */
  blendStart: number;
  blendEnd: number;
  mode: 'stream' | 'burst';
  loop: boolean;
  direction: [number, number, number];
  /** Cone half-angle in degrees. */
  angle: number;
  minSpeed: number;
  maxSpeed: number;
  gravity: [number, number, number];
  /** Percent of velocity lost per simulation step. */
  drag: number;
  numParticles: number;
}

const vertexShader = /* glsl */ `
attribute vec3 offset;
attribute float life; // 0 at birth, 1 at death; < 0 when dead
uniform vec3 uColorStart;
uniform vec3 uColorEnd;
uniform float uSizeStart;
uniform float uSizeEnd;
uniform float uBlendStart;
uniform float uBlendEnd;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  if (life < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float size = mix(uSizeStart, uSizeEnd, life);
  vec4 center = viewMatrix * vec4(offset, 1.0);
  // A camera-facing square of side \`size\` world units.
  center.xy += position.xy * size;
  gl_Position = projectionMatrix * center;
  vUv = position.xy + 0.5;
  vColor = vec4(mix(uColorStart, uColorEnd, life), mix(uBlendStart, uBlendEnd, life) / 100.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uTexture, vec2(vUv.x, 1.0 - vUv.y));
  gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** The most particles one system draws (the game asks for at most a few hundred). */
const MAX_PARTICLES = 2000;

export class ParticleSystem {
  /** Whether numParticles may raise the capacity (the Lingo API's systems; the demo keeps 128). */
  growable = false;
  readonly mesh: THREE.Mesh;
  private offsets!: THREE.InstancedBufferAttribute;
  private lives!: THREE.InstancedBufferAttribute;
  private readonly quad: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private pos: Float32Array = new Float32Array(0);
  private vel: Float32Array = new Float32Array(0);
  private age: Float32Array = new Float32Array(0);
  private alive: Uint8Array = new Uint8Array(0);
  private emitted: Uint8Array = new Uint8Array(0);
  private count = 0;

  constructor(
    private p: ParticleParams,
    texture: THREE.Texture,
    readonly emitter: THREE.Vector3,
    private capacity = 128,
  ) {
    const quad = (this.quad = new THREE.InstancedBufferGeometry());
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.allocate(capacity);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uColorStart: { value: new THREE.Vector3() },
        uColorEnd: { value: new THREE.Vector3() },
        uSizeStart: { value: 0 },
        uSizeEnd: { value: 0 },
        uBlendStart: { value: 0 },
        uBlendEnd: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(quad, this.material);
    // Particles are drawn but never hit by modelsUnderRay.
    this.mesh.raycast = () => {};
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.set({});
  }

  /** GPU buffers for `capacity` particles. */
  private allocate(capacity: number) {
    this.capacity = capacity;
    this.offsets = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.lives = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(-1), 1);
    this.offsets.setUsage(THREE.DynamicDrawUsage);
    this.lives.setUsage(THREE.DynamicDrawUsage);
    this.quad.setAttribute('offset', this.offsets);
    this.quad.setAttribute('life', this.lives);
    this.quad.instanceCount = capacity;
  }

  get params(): Readonly<ParticleParams> {
    return this.p;
  }

  set texture(t: THREE.Texture) {
    this.material.uniforms.uTexture.value = t;
  }

  /** Change properties, as Lingo does (`emitter.loop = 1`, `numParticles = 50`...). */
  set(changes: Partial<ParticleParams>) {
    // Setting numParticles on a burst fires it again, even with the same count (the
    // arena's explosions and the weapons' sparks are triggered this way).
    const resize = changes.numParticles !== undefined && (changes.numParticles !== this.p.numParticles || (changes.mode ?? this.p.mode) === 'burst');
    if (resize && changes.numParticles! > this.capacity && this.growable) {
      this.quad.dispose();
      this.allocate(Math.min(MAX_PARTICLES, changes.numParticles!));
    }
    this.p = { ...this.p, ...changes };
    const u = this.material.uniforms;
    u.uColorStart.value.set(...this.p.colorStart.map((c) => c / 255));
    u.uColorEnd.value.set(...this.p.colorEnd.map((c) => c / 255));
    u.uSizeStart.value = this.p.sizeStart;
    u.uSizeEnd.value = this.p.sizeEnd;
    u.uBlendStart.value = this.p.blendStart;
    u.uBlendEnd.value = this.p.blendEnd;
    if (resize || this.count === 0) this.initialize(Math.min(this.capacity, this.p.numParticles));
  }

  private initialize(count: number) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.age = new Float32Array(count);
    this.alive = new Uint8Array(count);
    this.emitted = new Uint8Array(count);
    const life = this.p.lifeTime / 1000;
    for (let i = 0; i < count; i++) {
      if (this.p.mode === 'stream') {
        // A stream is continuous: start with particles at every age.
        this.age[i] = Math.random() * life;
        this.alive[i] = 1;
        this.emitted[i] = 1;
        this.respawn(i);
        for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * this.age[i];
      } else {
        // A burst emits every particle at once, on the next update.
        this.age[i] = life;
      }
    }
  }

  /** A fresh particle at the emitter, heading into the cone around `direction`. */
  private respawn(i: number) {
    const d = new THREE.Vector3(...this.p.direction);
    const full = d.lengthSq() < 1e-12;
    const axis = full ? new THREE.Vector3(0, 0, 1) : d.normalize();
    const thetaMax = full ? Math.PI : Math.min(Math.PI, (this.p.angle * Math.PI) / 180);
    const seed = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(axis, seed).normalize();
    const t2 = new THREE.Vector3().crossVectors(axis, t1);
    const theta = Math.random() * thetaMax;
    const phi = Math.random() * Math.PI * 2;
    const dir = axis
      .clone()
      .multiplyScalar(Math.cos(theta))
      .addScaledVector(t1, Math.sin(theta) * Math.cos(phi))
      .addScaledVector(t2, Math.sin(theta) * Math.sin(phi));
    const speed = this.p.minSpeed + Math.random() * (this.p.maxSpeed - this.p.minSpeed);
    this.pos.set([this.emitter.x, this.emitter.y, this.emitter.z], i * 3);
    this.vel.set([dir.x * speed, dir.y * speed, dir.z * speed], i * 3);
  }

  /** One simulation step of `dt` seconds. */
  update(dt: number) {
    const life = this.p.lifeTime / 1000;
    const drag = this.p.drag / 100;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      let step = dt;
      if (this.age[i] >= life) {
        // Without loop, a particle that has been emitted dies at the end of its life.
        if (!this.p.loop && this.emitted[i]) {
          this.alive[i] = 0;
          this.age[i] = life;
          continue;
        }
        this.emitted[i] = 1;
        this.age[i] -= life;
        this.alive[i] = 1;
        this.respawn(i);
        step = this.age[i];
      }
      if (!this.alive[i]) continue;
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        this.vel[j] += this.p.gravity[k] * step;
        if (drag > 0) this.vel[j] *= 1 - drag;
        this.pos[j] += this.vel[j] * step;
      }
    }
    for (let i = 0; i < this.capacity; i++) {
      const on = i < this.count && this.alive[i];
      this.lives.setX(i, on ? Math.min(1, this.age[i] / life) : -1);
      if (on) this.offsets.setXYZ(i, this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    }
    this.offsets.needsUpdate = true;
    this.lives.needsUpdate = true;
  }
}
