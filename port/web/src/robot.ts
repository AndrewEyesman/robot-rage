// A robot: its 3D model, assembled from parts as the shared cast's BuildRobot does,
// and its driving, translated from the arena's "robot behavior". The behavior runs
// once per 20 fps game tick, exactly as the original's prepareFrame did.

import * as THREE from 'three';
import { intersects, MapSprite } from './collision';
import { LightRig, makeDirectorMaterial } from './director/s3d/material';
import { parts } from './parts';
import type { W3dMember } from './director/s3d/w3d';

/** A robot's parts, as in the game's robotDescription property list. */
export interface RobotDescription {
  ram: string[];
  torn: string[];
  hjul: string[];
  motor: string[];
  batteri: string[];
  vapen: string[];
  wpnPos: string[];
  special: string[];
  ammunition: string[];
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Director's transform.rotation = vector(rx, ry, rz): R = Rz * Ry * Rx, in degrees. */
export function directorEuler(rx: number, ry: number, rz: number): THREE.Euler {
  return new THREE.Euler(rad(rx), rad(ry), rad(rz), 'ZYX');
}

export interface RobotModel {
  /** "rotGRP": placed in the world and turned to the robot's heading. */
  rotGroup: THREE.Group;
  /** "robot1": the parts, scaled 2x, tilted when the robot jumps or tips. */
  botGroup: THREE.Group;
  /** Installed models by lower-case name with the robot's suffix ("litethjulhf1"). */
  models: Map<string, THREE.Group>;
}

/** BuildRobot: clone each part's models from the chassis member into a group. */
export function buildRobot(src: W3dMember, rd: RobotDescription, suffix: string): RobotModel {
  const botGroup = new THREE.Group();
  botGroup.name = `robot${suffix}`;
  const rotGroup = new THREE.Group();
  rotGroup.name = `rotGRP${suffix}`;
  rotGroup.add(botGroup);
  const models = new Map<string, THREE.Group>();

  const install = (partId: string, u?: string) => {
    const part = parts[partId];
    for (const name of part?.model ?? []) {
      const node = src.node(name);
      if (!node || models.has(`${name}${suffix}`.toLowerCase())) continue;
      const g = src.build(node.name);
      g.name = `${node.name}${suffix}`;
      const m = src.worldMatrix(node.name);
      // Weapons mounted at the back are turned round in the parent's space.
      if (u === 'b') m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
      m.decompose(g.position, g.quaternion, g.scale);
      if (part.namn === 'mini-gun') {
        for (const c of g.children) if (c.name.toLowerCase().includes('flame')) c.visible = false;
      }
      botGroup.add(g);
      models.set(g.name.toLowerCase(), g);
    }
  };

  for (const [key, list] of Object.entries(rd) as [keyof RobotDescription, string[]][]) {
    if (key === 'wpnPos') continue;
    for (const e of list) {
      const plats = rd.vapen.indexOf(e);
      install(e, plats >= 0 ? rd.wpnPos[plats] : undefined);
    }
  }
  botGroup.scale.setScalar(2);
  return { rotGroup, botGroup, models };
}

/** The wheel behaviors ("wheel h1".."wheel h5"): grip, turning, and which models spin. */
export class Wheels {
  readonly turnRadius: number;
  readonly slip: number;
  private readonly spin: THREE.Group[] = [];

  constructor(rd: RobotDescription, model: RobotModel, suffix: string) {
    const id = rd.hjul[0];
    const table: Record<string, [number, number, number]> = {
      // turnRadius, slip, models spun
      h1: [5.8, 0.95, 0], // h1 spins its wheels only on frame 10 (matches), never in Training
      h2: [2.5, 0.9, 4],
      h3: [1.5, 0.5, 6],
      h4: [3.6, 0.93, 4],
      h5: [3.4, 0.8, 6],
    };
    const [turnRadius, slip, n] = table[id] ?? [2.5, 0.9, 0];
    this.turnRadius = turnRadius;
    this.slip = slip;
    const list = (parts[id]?.model ?? [])
      .map((m) => model.models.get(`${m}${suffix}`.toLowerCase()))
      .filter((g): g is THREE.Group => !!g);
    this.spin = list.slice(0, n);
  }

  /** exitFrame: roll the wheels by the robot's speed. */
  exitFrame(speed: number, dx: number, dy: number) {
    const k = 2 * speed + 0.5 * Math.abs(dx) + 0.5 * Math.abs(dy);
    for (const g of this.spin) g.rotateX(rad(k));
  }
}

export interface MapSprites {
  robot: MapSprite;
  /** Collision maps, one per direction: 15 (-x), 16 (+x), 17 (-y), 18 (+y). */
  walls: [MapSprite, MapSprite, MapSprite, MapSprite];
  /** Fence lines 25 (-x) and 26 (+x). */
  fences: [MapSprite, MapSprite];
  firepit: MapSprite;
  pit: MapSprite;
}

export type RobotState = 'init' | 'move' | 'battery' | 'broken' | 'stop' | 'tip' | 'fall';

export interface RobotEvents {
  sound(name: string, volume: number): void;
  fire(on: boolean): void;
  gameOver(): void;
}

/** A pose snapshot for drawing between ticks. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  angle: number;
  anglex: number;
  anglez: number;
}

/** The arena's "robot behavior", for the player's robot in Training (sprite 10). */
export class RobotBehavior {
  state: RobotState = 'init';
  x = 0;
  y = 0;
  z = 0;
  dx = 0;
  dy = 0;
  dz = 0;
  dt = 2;
  speed = 0;
  angle = 0;
  anglex = 0;
  anglez = 0;
  dangle = 0;
  torque = 0;
  fart = 0;
  grav = 0.5;
  dir = 1;
  lastx = 0;
  lasty = 0;
  lastangle = 0;
  acceleration = 0.6;
  slip = 0.9;
  friction = 0.95;
  turnRadius = 2.5;
  battkonst = 1;
  motorkonst = 0;
  vikt = 0;
  energy = 100;
  pansar = 0;
  maxPansar = 0;
  keymap = '00000000';
  lastKeymap = '00000000';
  private keyQueue: { keymap: string; time: number }[] = [];
  private pFireTime = 0;
  private pFire = 0;
  counter = 0;

  constructor(
    readonly rd: RobotDescription,
    pansar: number,
    readonly sprites: MapSprites,
    readonly wheels: Wheels,
    readonly events: RobotEvents,
    readonly now: () => number,
  ) {
    this.pansar = pansar;
    this.maxPansar = pansar;
  }

  pose(): Pose {
    return { x: this.x, y: this.y, z: this.z, angle: this.angle, anglex: this.anglex, anglez: this.anglez };
  }

  initRobot() {
    this.z = -530;
    this.dx = this.dy = this.dz = 0;
    this.dt = 2;
    this.speed = 0;
    this.fart = 0;
    this.anglex = 0;
    this.anglez = 0;
    this.acceleration = 0.6;
    this.slip = this.wheels.slip;
    this.friction = 0.95;
    this.turnRadius = this.wheels.turnRadius;
    this.dangle = 0;
    this.torque = 0;
    this.counter = 0;
    this.pFireTime = this.now();
    this.keymap = '00000000';
    this.lastKeymap = this.keymap;
    // Sprite 10 is robot 1, starting in the +x/+y corner facing -y.
    this.x = 1200;
    this.y = 1200;
    this.angle = 270;
    this.energy = 100;
    this.vikt = usedWeight(this.rd, this.maxPansar);
    const kw = maxSpeed(this.vikt, this.rd.motor[0]);
    this.friction = (0.935 + 0.09 * kw) * this.friction;
    let battpart = 0;
    for (const b of this.rd.batteri) battpart += b === 'b1' ? 2 : b === 'b2' ? 4 : b === 'b3' ? 8 : 0;
    this.battkonst = 5.0 / battpart;
    const ram = this.rd.ram[0];
    this.battkonst *= ram === 'r1' ? 0.7 : ram === 'r2' ? 1.2 : ram === 'r3' ? 1.7 : 1;
    this.motorkonst = 0.001 * (parts[this.rd.motor[0]]?.kwh ?? 0);
    this.keyQueue = [];
    this.state = 'move';
  }

  spendEnergy(amount: number) {
    this.energy -= amount * this.battkonst;
    if (this.energy < 0) {
      this.energy = 0;
      this.state = 'battery';
    }
  }

  /** The frame script hands over the keys whenever they change. */
  keyPressed(map: string, tdelay = 0) {
    if (this.state === 'move' || this.state === 'battery') {
      this.keyQueue.push({ keymap: map, time: this.now() + tdelay });
    }
  }

  private checkKeyQueue() {
    if (this.keyQueue.length > 0 && this.now() > this.keyQueue[0].time) {
      const q = this.keyQueue.shift()!;
      this.lastKeymap = this.keymap;
      this.keymap = q.keymap;
    }
  }

  private bounce(axis: 'x' | 'y', sign: number, k: number, speedK: number, other: number) {
    // Back to the last position, bounce off, and pick up a spin from the speed.
    if (axis === 'x') this.dx = sign * 0.8 * Math.abs(this.dx);
    else this.dy = sign * 0.8 * Math.abs(this.dy);
    this.x = this.lastx;
    this.y = this.lasty;
    this.angle = this.lastangle;
    this.torque = 0.1 * Math.abs(this.speed) * (2 - 4 * other);
    this.speed = speedK * this.speed;
    return k;
  }

  handleMove() {
    const sp = this.sprites.robot;
    const ht = 1;
    let krock = 0;
    if (this.state !== 'fall' && this.state !== 'stop') {
      if (sp.locH < 820 || sp.locH > 1580 || sp.locV < -200 || sp.locV > 600) this.fall();
    }
    const [w15, w16, w17, w18] = this.sprites.walls;
    const [f25, f26] = this.sprites.fences;
    if (intersects(sp, f25) && this.dx < 0) krock = this.bounce('x', 1, 2, -0.5, +(this.dy > 0));
    if (intersects(sp, f26) && this.dx > 0) krock = this.bounce('x', -1, 2, -0.5, +(this.dy < 0));
    if (intersects(sp, w15) && this.dx < 0) krock = this.bounce('x', 1, 1, -0.6, +(this.dy > 0));
    if (intersects(sp, w16) && this.dx > 0) krock = this.bounce('x', -1, 1, -0.6, +(this.dy < 0));
    if (intersects(sp, w17) && this.dy < 0) krock = this.bounce('y', 1, 1, -0.6, +(this.dx < 0));
    if (intersects(sp, w18) && this.dy > 0) krock = this.bounce('y', -1, 1, -0.6, +(this.dx > 0));
    if (krock === 1) this.events.sound('regular_krock', 255);
    if (krock === 2) this.events.sound('fence_krock', 255);

    this.x += this.dx;
    this.y += this.dy;
    this.z += this.dz;
    if (this.z < -530) {
      this.z = -530;
      this.dz = 0;
    }
    if (this.state !== 'battery') {
      const k = this.keymap;
      if (k[0] === '1') {
        this.dangle -= (this.turnRadius * this.dt) / 6;
        if (this.dangle < -this.turnRadius * this.dt) this.dangle = -this.turnRadius * this.dt;
        this.angle += ht * this.dangle * (1.0 + Math.abs(this.speed) / 20);
        this.speed = 0.96 * (this.speed + 0.2);
      }
      if (k[1] === '1') {
        this.dangle += (this.turnRadius * this.dt) / 6;
        if (this.dangle > this.turnRadius * this.dt) this.dangle = this.turnRadius * this.dt;
        this.angle += ht * this.dangle * (1.0 + Math.abs(this.speed) / 20);
        this.speed = 0.96 * (this.speed + 0.2);
      }
      this.dangle *= 0.7;
      this.angle += this.torque;
      this.torque *= 0.94;
      if (k[2] === '1') {
        this.speed += this.acceleration * this.dt;
        this.spendEnergy(this.motorkonst * this.battkonst);
      }
      if (k[3] === '1') {
        this.speed -= this.acceleration * this.dt;
        this.spendEnergy(this.motorkonst * this.battkonst);
      }
    }
    if (this.angle < 0) this.angle += 360;
    if (this.angle > 360) this.angle -= 360;
    this.dx = this.slip * this.dx + (1 - this.slip) * this.speed * Math.cos(rad(this.angle));
    this.dy = this.slip * this.dy + (1 - this.slip) * this.speed * Math.sin(rad(this.angle));
    this.fart = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    this.speed *= this.friction;
    // VectorToPoint: the hidden map is a quarter of the world's scale.
    sp.setLoc(1200 + 0.25 * this.x, 200 + 0.25 * this.y);
    sp.rotation = this.angle;

    const pit = this.sprites.firepit;
    if (intersects(sp, pit)) {
      if (this.now() > this.pFireTime + 550) {
        this.pFire = 1;
        this.events.sound('flamethrow', 50 + 1 + Math.floor(Math.random() * 155));
        this.events.fire(true);
        if (Math.abs(sp.locH - pit.locH) + Math.abs(sp.locV - pit.locV) < 40) this.damage(7);
        this.pFireTime = this.now();
      }
    } else if (this.pFire === 1) {
      this.events.fire(false);
      this.pFire = 0;
    }
    if (this.anglex !== 0) this.anglex = 0;
    if (this.anglez !== 0) this.anglez = 0;
  }

  damage(amount: number) {
    this.pansar = Math.max(0, this.pansar - amount);
    if (this.pansar <= 0) {
      this.makeLoser();
      this.state = 'broken';
    }
  }

  tip() {
    const pit = this.sprites.pit;
    this.dx = 0.45 * (pit.locH - this.sprites.robot.locH);
    this.dy = 0.45 * (pit.locV - this.sprites.robot.locV);
    this.dz = 0;
    this.state = 'tip';
  }

  fall() {
    this.state = 'fall';
    this.grav = 0.5;
    this.dir = this.dx > 0 ? 1 : -1;
    this.sprites.robot.locV = -1000;
  }

  private handleTip() {
    this.x += this.dx * this.dt;
    this.y += this.dy * this.dt;
    this.dx *= 0.8;
    this.dy *= 0.8;
    this.z += this.dz * this.dt;
    this.anglex += 5.0;
    this.dz -= 1.5;
    if (this.dz < -30) {
      this.dz = 0;
      this.makeLoser();
      this.state = 'stop';
    }
  }

  private handleFall() {
    this.x += this.dx * this.dt;
    this.y += this.dy * this.dt;
    this.dx *= 0.95;
    this.dy *= 0.95;
    this.dx += this.dir / 10.0;
    this.z += this.dz * this.dt;
    this.anglex += 5.0;
    this.grav *= 1.02;
    this.dz -= this.grav;
    this.sprites.robot.locV = -1000;
    if (this.z < -70000) {
      this.makeLoser();
      this.events.sound('krasch11', 255);
      this.state = 'stop';
    }
  }

  private makeLoser() {
    this.events.gameOver();
  }

  /** prepareFrame: one game tick. */
  prepareFrame() {
    this.counter++;
    this.lastx = this.x;
    this.lasty = this.y;
    this.lastangle = this.angle;
    switch (this.state) {
      case 'init':
        this.initRobot();
        break;
      case 'move':
      case 'battery':
        this.checkKeyQueue();
        this.handleMove();
        break;
      case 'broken':
        this.checkKeyQueue();
        this.keymap = '00000000';
        this.handleMove();
        break;
      case 'tip':
        this.handleTip();
        break;
      case 'fall':
        this.handleFall();
        break;
      case 'stop':
        break;
    }
  }
}

/** calculateUsedWeight2: every part's weight plus the armour. */
export function usedWeight(rd: RobotDescription, pansar: number): number {
  let w = 0;
  for (const [key, list] of Object.entries(rd)) {
    if (key === 'wpnPos') continue;
    for (const p of list as string[]) w += parts[p]?.vikt ?? 0;
  }
  return w + pansar / 1.5;
}

/** calculateMaxSpeed: how much of its top speed the engine keeps at this weight. */
export function maxSpeed(vikt: number, motor: string): number {
  const k = { ma1: 1.5, ma2: 1.0, ma3: 0.5, mb1: 0.25, mb2: 0.2, mb3: 0.1 }[motor] ?? 1;
  return Math.min(1, Math.max(0, 1.0 - (k * vikt) / 150.0));
}

/** UpdateRobot: place the 3D model from a pose. */
export function placeRobot(model: RobotModel, p: Pose) {
  model.rotGroup.position.set(p.x * 5, p.z, p.y * 5);
  model.botGroup.rotation.copy(directorEuler(p.anglex, 0, p.anglez));
  model.rotGroup.rotation.copy(directorEuler(0, -p.angle + 90, 0));
}

/**
 * updateRobotTexture: give the chassis (n = 1, map A) or tower (n = 2, map B) a new
 * shader carrying the robot's paint map. The shader is #standard with ambient black,
 * diffuse rgb(100, 50, 0), specular rgb(150, 100, 0) and Director's default
 * shininess of 30; the texture uses the mesh's own UVs.
 */
export function applyPaintMap(model: RobotModel, rd: RobotDescription, n: 1 | 2, suffix: string, map: THREE.Texture, rig: LightRig) {
  const partId = n === 1 ? rd.ram[0] : rd.torn[0];
  const modelName = parts[partId]?.model?.[0];
  const g = modelName && model.models.get(`${modelName}${suffix}`.toLowerCase());
  if (!g) return;
  const material = makeDirectorMaterial(rig, {
    diffuse: [100 / 255, 50 / 255, 0],
    ambient: [0, 0, 0],
    emissive: [0, 0, 0],
    specular: [150 / 255, 100 / 255, 0],
    shininess: 30,
    opacity: 1,
    layers: [{ texture: map, blendFunc: 2, blendSrc: 1, blendConst: 0.5, mode: 0, uvSet: 0, transform: new THREE.Matrix4() }],
    side: THREE.FrontSide,
  });
  for (const c of g.children) if (c instanceof THREE.Mesh) c.material = material;
}
