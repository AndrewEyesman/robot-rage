// arena104 behavior 238 "disc behavior": one razor disc (vapen v26). It flies along
// the launcher's heading on the hidden map, bouncing off walls and fences (sparks) and
// off ploughs in gPlog, until it hits a robot (damage; a copy stays stuck in the
// robot), stops moving, or leaves the arena.

import { G, dot, intersects, member, sendSprite, sprite, the } from '../../director';
import { vector, type Group3D, type Model, type ModelResource } from '../../director/s3d';
import { LList, add, div, mul, num, point, random, rgb, sym, type LSymbol, type LValue, type LVector } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { GetDistance } from '../robotwars/s004-new-init';
import { GetAngle } from '../robotwars/s007-jump-movie';
import { PointToVector, VectorToPoint } from './s006-arena-3d';
import { DEG, sp, world } from './weapon-util';

// global world, gPlog, gPartDescription, gPlayerNumber

export class DiscBehavior {
  sp: number;
  m: Model | undefined;
  robotSprite: number;
  V: LValue = undefined;
  x!: number;
  y!: number;
  z: number;
  dx: number;
  dy: number;
  dz: LValue = undefined;
  lastx: number = 0;
  lasty: number = 0;
  robot2Sp: number;
  robotSp: number;
  pstartTime: number;
  state: LSymbol;
  pCounter: number = 0;
  pr: ModelResource;
  m2: Model;
  m3: Model;
  m4: Model;
  g: Group3D;
  pSTill: LValue = undefined;
  height: LValue = undefined;
  suffix: string;

  constructor(sp0: number, _name: string, _v0: LVector, rsp: number) {
    this.sp = sp0;
    this.pstartTime = the.milliSeconds;
    this.robotSp = rsp;
    if (rsp === 10) {
      this.robot2Sp = 20;
      this.suffix = '1';
    } else {
      this.robot2Sp = 10;
      this.suffix = '2';
    }
    if (G.gPlayerNumber === 2) {
      if (rsp === 10) {
        this.suffix = '2';
      } else {
        this.suffix = '1';
      }
    }
    this.g = world().newGroup('discGRP' + this.sp);
    const m = (this.m = world().model('disc' + this.suffix).clone('disc' + this.sp) as Model);
    this.m2 = world().model('flame' + this.suffix).clone('flame' + this.sp) as Model;
    this.m3 = world().model('glow' + this.suffix).clone('glow' + this.sp) as Model;
    this.m4 = world().newModel('spark' + this.sp);
    const pr = (this.pr = world().newModelResource('discspark' + this.sp, sym('particle')));
    this.m4.resource = pr;
    const ttexture = world().texture('gnist1');
    if (!ttexture) {
      pr.texture = world().newTexture('gnist1', sym('fromImageObject'), member('span').image);
    } else {
      pr.texture = world().texture('gnist1');
      pr.texture.renderFormat = sym('rgba8888');
    }
    this.m4.worldPosition.y = -10000;
    this.g.addChild(m, sym('preserveWorld'));
    this.g.addChild(this.m2, sym('preserveWorld'));
    this.g.addChild(this.m3, sym('preserveWorld'));
    m.transform.position = vector(0, 0, 0);
    this.m2.transform.position = vector(0, 0, 0);
    this.m3.transform.position = vector(0, 0, 0);
    // The flame clone wears the glow's shader and the glow the flame's, as written.
    this.m2.shader = world().model('glow' + this.suffix).shader;
    this.m3.shader = world().model('flame' + this.suffix).shader;
    m.shader.blend = 100;
    m.shader.emissive = rgb(0, 0, 0);
    this.m2.shader.texture!.renderFormat = sym('rgba8888');
    this.m3.shader.texture!.renderFormat = sym('rgba8888');
    m.scale(1.6);
    this.m2.scale(1.6);
    this.m3.scale(1.6);
    this.z = -530;
    this.dx = 0;
    this.dy = 0;
    this.robotSprite = this.robotSp;
    this.state = sym('fire');
  }

  prepareFrame() {
    const m = this.m!;
    switch (this.state) {
      case sym('fire'): {
        const t = the.milliSeconds - this.pstartTime;
        void t;
        const angle = sprite(this.robotSprite).rotation;
        void angle;
        const TRN = world().model('spinndisc' + this.suffix).getWorldTransform();
        this.dx = -10 * TRN.zAxis.x;
        this.dy = -10 * TRN.zAxis.z;
        this.state = sym('move');
        this.g.worldPosition = world().model('spinndisc' + this.suffix).child(3).worldPosition;
        this.x = num(VectorToPoint(div(this.g.worldPosition, 5) as LVector).locH);
        this.y = num(VectorToPoint(div(this.g.worldPosition, 5) as LVector).locV);
        this.m2.transform.rotation = add(TRN.rotation, vector(0, 180, 0)) as LVector;
        this.pCounter = 0;
        this.lastx = this.x;
        this.lasty = this.y;
        break;
      }
      case sym('move'): {
        this.pCounter = this.pCounter + 1;
        let skala = num(GetDistance(point(this.x, this.y), point(this.lastx, this.lasty))) * 0.1;
        if (skala === 0) {
          if (this.pCounter > 10) {
            // pSTill starts VOID; VOID + 1 is 1.
            this.pSTill = add(this.pSTill, 1);
            if (num(this.pSTill) > 1) {
              this.state = sym('explode');
              const c = m.clone('stuckdisc' + this.suffix + this.sp);
              void c;
            }
          } else {
            skala = 0.001;
          }
        }
        if (skala > 0) {
          this.pSTill = 0;
          this.m2.transform.scale.z = skala;
        }
        this.lastx = this.x;
        this.lasty = this.y;
        this.x = this.x + this.dx;
        this.y = this.y + this.dy;
        m.rotate(0, -20, 0);
        this.m3.rotate(0, 20, 0);
        this.g.worldPosition = mul(5, PointToVector(point(this.x, this.y), -100)) as LVector;
        sprite(this.sp).loc = point(this.x, this.y);
        if (this.pCounter > 2) {
          // The thrower's own robot can be hit too (once the disc is two ticks out).
          if (intersects(this.sp, this.robotSp)) {
            playsound('hit_33', 255);
            sendSprite(this.robotSp, 'damage', dot(G.gPartDescription, 'v26', 'skada'), sym('splitter'));
            this.pstartTime = the.milliSeconds;
            this.DoSpark();
            sp(this.robotSp, 'pRobot').addChild(m, sym('preserveWorld'));
            const c = m.clone('stuckdisc' + this.suffix + this.sp) as Model;
            c.rotate(random(20), 0, random(20));
            c.translate(0, random(40), 0);
            c.shader = world().model('discC1').shader;
            this.state = sym('explode');
          }
          if (intersects(this.sp, this.robot2Sp)) {
            playsound('hit_33', 255);
            sendSprite(this.robot2Sp, 'damage', dot(G.gPartDescription, 'v26', 'skada'), sym('splitter'));
            this.pstartTime = the.milliSeconds;
            this.DoSpark();
            sp(this.robot2Sp, 'pRobot').addChild(m, sym('preserveWorld'));
            const c = m.clone('stuckdisc' + this.suffix + this.sp) as Model;
            c.rotate(random(20), 0, random(20));
            c.translate(0, random(40), 0);
            c.shader = world().model('discC2').shader;
            this.state = sym('explode');
          }
        }
        if (intersects(this.sp, 25) || intersects(this.sp, 26) || intersects(this.sp, 15) || intersects(this.sp, 16)) {
          this.x = this.lastx;
          this.y = this.lasty;
          this.dx = -this.dx;
          this.m2.transform.rotation = vector(0, 270 - num(GetAngle(this.dx, this.dy)), 0);
          this.pCounter = 11;
          this.DoSpark();
        }
        if (intersects(this.sp, 17) || intersects(this.sp, 18)) {
          this.x = this.lastx;
          this.y = this.lasty;
          this.dy = -this.dy;
          this.m2.transform.rotation = vector(0, 270 - num(GetAngle(this.dx, this.dy)), 0);
          this.pCounter = 11;
          this.DoSpark();
        }
        if (num(GetDistance(sprite(this.sp).loc, point(1200, 400))) > 1000) {
          world().deleteModel(m.name);
          world().deleteModel(this.m2.name);
          world().deleteModel(this.m3.name);
          this.state = sym('Remove');
        }
        for (const q of (G.gPlog as LList).items) {
          const qsp = num(dot(q, 'sp'));
          if (intersects(qsp, this.sp)) {
            const norm = sprite(qsp).rotation + 360;
            const vink = num(GetAngle(this.dx, this.dy));
            const diff = norm - vink;
            const nyvink = norm + diff;
            this.dx = 10 * Math.cos(nyvink * DEG);
            this.dy = 10 * Math.sin(nyvink * DEG);
            this.m2.transform.rotation = vector(0, 270 - num(GetAngle(this.dx, this.dy)), 0);
            playsound('hitsmall', 255);
            this.DoSpark();
            // `exit`: ends prepareFrame, not just the loop.
            return;
          }
        }
        break;
      }
      case sym('explode'):
        world().deleteModel(m.name);
        world().deleteModel(this.m2.name);
        world().deleteModel(this.m3.name);
        this.state = sym('explode2');
        break;
      case sym('explode2'):
        if (the.milliSeconds > this.pstartTime + 5000) {
          this.state = sym('Remove');
        }
        break;
      case sym('Remove'):
        world().deleteModelResource(this.pr.name);
        world().deleteModel(this.m4.name);
        world().deleteGroup(this.g.name);
        this.state = sym('done');
        sendSprite(0, 'removeSprite', this.sp);
        break;
    }
  }

  endSprite() {
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      // "explosion" & sp: a resource this script never made.
      world().deleteModel(this.m.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
    }
  }

  doneSprite() {
    this.state = sym('nada');
    if (this.m === undefined) {
      return;
    }
    if (world().model(this.m.name) !== undefined) {
      world().deleteModel(this.m.name);
      world().deleteModelResource('explosion' + this.sp);
      this.m = undefined;
    }
  }

  DoSpark() {
    const pr = this.pr;
    this.m4.worldPosition = this.g.worldPosition;
    pr.emitter.numParticles = 50;
    pr.lifeTime = 1000;
    pr.colorRange.start = rgb(170, 212, 153);
    pr.colorRange.end = rgb(0, 0, 0);
    pr.tweenMode = sym('velocity');
    pr.sizeRange.start = 20;
    pr.sizeRange.end = 1;
    pr.blendRange.start = 100;
    pr.blendRange.end = 100;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.angle = 180;
    pr.emitter.minSpeed = 400.0;
    pr.emitter.maxSpeed = 800.0;
    pr.emitter.direction = vector(0, 1, 0);
    pr.emitter.distribution = sym('gaussian');
    pr.drag = 0.0;
    pr.gravity = vector(0.0, -100, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
  }
}
