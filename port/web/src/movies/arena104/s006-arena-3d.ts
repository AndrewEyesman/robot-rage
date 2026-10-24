// arena104 movie script 6 "Arena 3D": setting up the arena's 3D world (BuildWorld,
// InitFirePit), the robots' weapon and wheel behaviors (initWeapons, initWheels), the
// 2D map <-> 3D coordinate conversions, and the HUD bars' blinking.

import { G, member, pass, put, script, sendSprite, sprite, the, warnOnce } from '../../director';
import { member3d, vector, type Group3D, type Model, type Shockwave3dMember } from '../../director/s3d';
import { LList, LPropList, LVector, TAB, abs, add, contains, div, lingoEquals, lingoString, mul, point, rgb, sub, sym, voidp, type LNum, type LPoint, type LValue } from '../../lingo';

// global world, gRobot1, gRobot2, gCamera, gUserData, gPartDescription, gopponentdata, gPlayerNumber, gArenaStartTime

const eq = (a: LValue, b: LValue) => lingoEquals(a, b);
const getaProp = (l: LValue, k: LValue): LValue => (l instanceof LPropList ? l.getaProp(k) : undefined);
const world = (): Shockwave3dMember => G.world;

export function VectorToPoint(V: LVector): LPoint {
  return point(add(1200, mul(0.25, V.x)) as LNum, add(200, mul(0.25, V.z)) as LNum);
}

export function PointToVector(pt: LPoint, y: LValue): LVector {
  return vector(mul(4, sub(pt.locH, 1200)) as number, y as number, mul(4, sub(pt.locV, 200)) as number);
}

export function theOVerlay(namn: string): number | undefined {
  for (let i = 1; i <= world().camera(1).overlay.count; i++) {
    const textur = world().camera(1).overlay(i).source;
    if (contains(textur.name, namn)) {
      return i;
    }
  }
  return undefined;
}

export function BuildWorld() {
  G.world = member3d('arena');
  const t0 = the.milliSeconds;
  void t0;
  world().model('Gallerplan').visibility = sym('none');
  world().model('Barrel').visibility = sym('back');
  world().model('Plane.1.1').visibility = sym('both');
  world().camera('DefaultView').yon = 1000000;
  world().camera('DefaultView').hither = 10;
  member3d(1, 1).model('Plane').transform.position = vector(-24000, 6000, -27000);
  member3d(1, 1).model('Plane.1').transform.position = vector(-23400, 6000, -16000);
  member3d(1, 1).model('Plane.2').transform.position = vector(-45000, 6000, -9800);
  member3d(1, 1).model('Plane.4').transform.position = vector(-33500, 6000, -9800);
  for (const q of ['olja', 'pang', 'laserray', 'lim', 'granat', 'spik']) {
    const tmodel = world().model(q);
    if (!voidp(tmodel)) {
      world().model(q).worldPosition.y = -10000;
    }
  }
  world().deleteLight('UIambient');
  InitFirePit();
  world().deleteModel('raket');
  sendSprite(211, sym('initChatLine'));
  for (let i = 1; i <= world().texture.count; i++) {
    world().texture(i).renderFormat = sym('rgba8888');
    world().texture(i).quality = sym('medium');
  }
  if (world().model('mina') !== undefined) {
    world().model('mina').transform.position.y = -10000;
  }
  world().model('staden').transform.scale.x = 0.97;
  world().model('staden').transform.position.y = -72475;
}

export function initWeapons(robot: Group3D, rd: LPropList, robotNumber: number, robotSprite: number) {
  put('initweapons: ' + lingoString(robot as never), rd, robotNumber, robotSprite);
  const knappar = new LList(['Z', 'X', 'C']);
  sprite(40 + robotNumber * 10).visible = false;
  sprite(41 + robotNumber * 10).visible = false;
  sprite(42 + robotNumber * 10).visible = false;
  let place = 0;
  const vapen = rd.getaProp(sym('vapen')) as LList;
  for (let i = 1; i <= vapen.count; i++) {
    const q = vapen.getAt(i);
    if (!(eq(q, sym('v37')) || eq(q, sym('v23')))) {
      place = place + 1;
      if (getaProp(getaProp(G.gPartDescription, q), sym('model')) !== undefined) {
        sprite(39 + place + robotNumber * 10).visible = true;
        sprite(robotSprite + 1 + place).puppet = true;
        const Weapon = script('vapen ' + lingoString(q))!;
        sprite(robotSprite + 1 + place).scriptInstanceList = [new Weapon(robotSprite + 1 + place, robotNumber, robotSprite, place)];
        const namn = getaProp(getaProp(G.gPartDescription, q), sym('namn'));
        if (robotNumber === 1) {
          sprite(39 + robotNumber * 10 + place).visible = true;
          if (eq(q, sym('v6')) || eq(q, sym('v7'))) {
            member('weapon' + place + ' text').text = TAB + lingoString(namn);
          } else {
            member('weapon' + place + ' text').text = '(' + lingoString(knappar.getAt(place)) + ')' + TAB + lingoString(namn);
          }
          if (['v3', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12'].some((v) => eq(q, sym(v)))) {
            sprite(39 + robotNumber * 10 + place).visible = false;
            sprite(42 + robotNumber * 10 + place).visible = false;
          }
        } else {
          sprite(39 + robotNumber * 10 + place).visible = true;
          member('oweapon' + place + ' text').text = TAB + lingoString(namn);
          if (['v13', 'v14', 'v15', 'v1', 'v21', 'v22', 'v23', 'v25', 'v31', 'v32', 'v33', 'v34', 'v36'].some((v) => eq(q, sym(v)))) {
            sprite(36 + robotNumber * 10 + place).visible = false;
          }
          sprite(39 + robotNumber * 10 + place).visible = false;
          sprite(42 + robotNumber * 10 + place).visible = false;
        }
        continue;
      }
      put('no model for this weapon: ' + lingoString(q));
    }
  }
  put('done initweapons');
}

export function rankatspel(): number {
  // global gLobbydata
  if (!voidp(G.gLobbydata)) {
    if (eq(getaProp(G.gLobbydata, sym('rankgame')), 1)) {
      return 1;
    }
  }
  return 0;
}

export function initWheels(robot: Group3D, rd: LPropList, robotNumber: number, robotSprite: number) {
  const q = (rd.getaProp(sym('hjul')) as LList).getAt(1);
  const modelList = getaProp(getaProp(G.gPartDescription, q), sym('model'));
  if (modelList !== undefined) {
    sprite(robotSprite + 1).puppet = true;
    const Wheel = script('wheel ' + lingoString(q))!;
    sprite(robotSprite + 1).scriptInstanceList = [new Wheel(robot, robotSprite, modelList, robotNumber)];
  }
}

export function Copy3DMemberToWorld(dstname: string, dstGroup: Group3D, srcMember: Shockwave3dMember) {
  const t0 = the.milliSeconds;
  void t0;
  for (let i = 3; i <= srcMember.model.count; i++) {
    const name = srcMember.model(i).name;
    if ((!contains(name, 'AAA') || (i >= 17 && i <= 22)) && i !== 13 && i !== 14 && i !== 27) {
      const newName = dstname + i;
      world().cloneModelFromCastmember(newName, name, srcMember);
      world().model(newName).transform = srcMember.model(i).getWorldTransform();
      dstGroup.addChild(world().model(newName), sym('preserveParent'));
    }
  }
}

export function prepareMovie() {
  // global muInstance, gTimeDiff, gPlayerNumber, gOpponent
  G.gTimeDiff = undefined;
  the.actorList = [];
  G.gArenaStartTime = the.milliSeconds;
  G.gCamera = undefined;
  return pass();
}

export function InitFirePit() {
  let m: Model = world().model('pitsmoke');
  if (m === undefined) {
    m = world().newModel('pitsmoke');
    m.parent = world().group('world');
    m.worldPosition = vector(-4800, -900, 4800);
    let pr = world().newModelResource('pitsmoke', sym('particle'));
    let ttexture = world().texture('smoke1');
    if (!ttexture) {
      pr.texture = world().newTexture('smoke1', sym('fromImageObject'), member('smoke').image);
    } else {
      pr.texture = world().texture('smoke1');
    }
    pr.texture!.renderFormat = sym('rgba8888');
    m.resource = pr;
    pr.lifeTime = 2000;
    pr.colorRange.start = rgb(100, 100, 100);
    pr.colorRange.end = rgb(0, 0, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 200;
    pr.sizeRange.end = 400.0;
    pr.blendRange.start = 60;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 1;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.angle = 30.0;
    pr.emitter.minSpeed = 200.0;
    pr.emitter.maxSpeed = 400.0;
    pr.drag = 0.0;
    pr.wind = vector(0.0, 0.0, 0.0);
    pr.emitter.numParticles = 50;
    m = world().newModel('pitfire');
    m.parent = world().group('world');
    m.worldPosition = vector(-4800, -900, 4800);
    pr = world().newModelResource('pitfire', sym('particle'));
    ttexture = world().texture('fire');
    if (!ttexture) {
      pr.texture = world().newTexture('fire', sym('fromImageObject'), member('fire').image);
    } else {
      pr.texture = world().texture('fire');
    }
    pr.texture!.renderFormat = sym('rgba8888');
    m.resource = pr;
    pr.lifeTime = 1500;
    pr.colorRange.start = rgb(255, 255, 100);
    pr.colorRange.end = rgb(170, 100, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 600;
    pr.sizeRange.end = 400.0;
    pr.blendRange.start = 0;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('stream');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.region = new LList([vector(0.0, 0.0, 0.0)]);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.angle = 20.0;
    pr.emitter.path = new LList([vector(0, 0, 0), vector(0, 0, 112)]);
    pr.emitter.pathStrength = 0.0;
    pr.emitter.minSpeed = 800.0;
    pr.emitter.maxSpeed = 1600.0;
    pr.drag = 0.0;
    pr.gravity = vector(0.0, -6, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    pr.emitter.numParticles = 1;
    m = world().newModel('explosion');
    m.parent = world().group('world');
    m.worldPosition = vector(-4800, -10000, 4800);
    pr = world().newModelResource('explosion', sym('particle'));
    ttexture = world().texture('fire');
    if (!ttexture) {
      pr.texture = world().newTexture('fire', sym('fromImageObject'), member('fire').image);
    } else {
      pr.texture = world().texture('fire');
    }
    pr.texture!.renderFormat = sym('rgba8888');
    m.resource = pr;
    pr.lifeTime = 3000;
    pr.colorRange.start = rgb(255, 255, 100);
    pr.colorRange.end = rgb(170, 100, 0);
    pr.tweenMode = sym('age');
    pr.sizeRange.start = 600;
    pr.sizeRange.end = 0;
    pr.blendRange.start = 100.0;
    pr.blendRange.end = 0.0;
    pr.emitter.mode = sym('burst');
    pr.emitter.loop = 0;
    pr.emitter.direction = vector(0.0, 1.0, 0.0);
    pr.emitter.region = new LList([vector(0.0, 0.0, 0.0)]);
    pr.emitter.distribution = sym('gaussian');
    pr.emitter.angle = 45.0;
    pr.emitter.path = new LList([vector(0, 0, 0), vector(0, 0, 112)]);
    pr.emitter.pathStrength = 0.0;
    pr.emitter.minSpeed = 1000.0;
    pr.emitter.maxSpeed = 3000.0;
    pr.drag = 0.0;
    pr.gravity = vector(0.0, -75, 0.0);
    pr.wind = vector(0.0, 0.0, 0.0);
    pr.emitter.numParticles = 1;
  }
}

export function getOrtoDist(p1: LPoint, P2: LPoint): LValue {
  return add(abs(sub(p1.locH, P2.locH)), abs(sub(p1.locV, P2.locV)));
}

export function UpdateBatteryHeight(sp: number, h: number) {
  if (h < 10) {
    if (sprite(sp).blend === 50) {
      sprite(sp).blend = 0;
    } else {
      sprite(sp).blend = 50;
    }
  } else {
    sprite(sp).blend = 100;
  }
}

export function UpdatePansarWidth(sp: number, w: number) {
  if (w < 28) {
    if (sprite(sp).blend === 50) {
      sprite(sp).blend = 0;
    } else {
      sprite(sp).blend = 50;
    }
  } else {
    sprite(sp).blend = 100;
  }
}

/** Never called by the game: a test of looping the motor sound between its cue points. */
export function testmotorsound() {
  // motorsound = member("motor1"); sound(1).queue([#member: motorsound, #loopStartTime:
  // cuePointTimes[1], #loopEndTime: cuePointTimes[2], #loopCount: 9999]); sound(1).play()
  warnOnce('testmotorsound: sound queues and cue points are not in the runtime');
}

export function FindLineIntersection(ax: LValue, ay: LValue, Bx: LValue, By: LValue, cx: LValue, cy: LValue, dx: LValue, dy: LValue): LValue {
  const d = sub(mul(sub(Bx, ax), sub(dy, cy)), mul(sub(By, ay), sub(dx, cx)));
  let t: LValue;
  if (!eq(d, 0)) {
    t = div(sub(mul(sub(cx, ax), sub(dy, cy)), mul(sub(cy, ay), sub(dx, cx))), d);
  } else {
    return 0;
  }
  return t;
}

export function uncloak(mdl: string) {
  member3d(1, 1).model(mdl).shaderList.blend = 100;
  member3d(1, 1).model(mdl).shaderList.emissive = rgb(0, 0, 0);
  for (let j = 1; j <= member3d(1, 1).model(mdl).child.count; j++) {
    (member3d(1, 1).model(mdl).child(j) as Model).shaderList.blend = 100;
    (member3d(1, 1).model(mdl).child(j) as Model).shaderList.emissive = rgb(0, 0, 0);
  }
}
