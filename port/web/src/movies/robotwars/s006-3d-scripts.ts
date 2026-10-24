// robotwars movie script 6 "3D scripts": the shared 3D code. Building a robot's 3D
// model from its parts (BuildRobot, InstallByggPart), the robot paint-map shaders
// (updateRobotTexture, CreateShader), the follow camera's spring (SpringDamp) and a
// few model helpers. Called from the garage, the lobby and the arena.

import { G, member, put, the } from '../../director';
import { DImage, rectOf } from '../../director/image';
import { toDColor } from '../../director/sprite';
import { member3d, vector, type Group3D, type Model, type Node3D, type Shockwave3dMember } from '../../director/s3d';
import { LColor, LList, LPropList, LVector, add, contains, div, listp, mul, rgb, sub, sym, symbol, voidp, type LValue } from '../../lingo';
import { callMovie, eq, getaPropOf } from './util';

// global gUserData, gopponentdata, world, gRobot1, gRobot2, gPlayerNumber

const prop = (l: LValue, name: string): LValue => (l instanceof LPropList ? l.getaProp(sym(name)) : (l as Record<string, LValue> | undefined)?.[name]);
const list = (v: LValue): LList => (v instanceof LList ? v : new LList());

export function CreateShader(name: string, world: Shockwave3dMember, m: Model, c: LColor, pImage?: DImage | 0) {
  const tshader = world.shader(name);
  if (!tshader) {
    const tnewshader = world.newShader(name, sym('standard'));
    tnewshader.ambient = c;
    tnewshader.diffuse = rgb(100, 50, 0);
    tnewshader.renderStyle = sym('fill');
    tnewshader.specular = rgb(150, 100, 0);
    m.shaderList[1] = tnewshader;
  } else {
    m.shaderList[1] = tshader;
  }
  if (voidp(pImage)) {
    pImage = new DImage(4, 4, 32);
    pImage.fill(rectOf(0, 0, 4, 4), toDColor(c));
  }
  const ttexturename = 'tTexture' + name;
  let ttexture = world.texture(ttexturename);
  if (!ttexture) {
    ttexture = world.newTexture(ttexturename, sym('fromImageObject'), pImage as DImage);
    m.shaderList[1].texture = ttexture;
    m.shaderList[1].textureMode = sym('none');
    m.shaderList[1].textureMode = sym('wrapPlanar');
  } else {
    m.shaderList[1].texture = ttexture;
  }
  pImage = 0;
}

export function SpringDamp(currPos: LVector, trgPos: LVector, prevTrgPos: LVector, deltaTime: number, springConst: number, dampConst: number, springLen: number): LVector {
  let Disp = sub(currPos, trgPos) as LVector;
  const velocity = mul(sub(prevTrgPos, trgPos), deltaTime) as LVector;
  let forceMag: number;
  if (Disp.length() === 0) {
    forceMag = 10000.0;
  } else {
    forceMag = springConst * (springLen - Disp.length()) + dampConst * (Disp.dot(velocity) / Disp.length());
  }
  Disp.normalize();
  Disp = mul(Disp, forceMag * deltaTime) as LVector;
  return add(currPos, Disp) as LVector;
}

export function monteringsplats(rd: LPropList, e: LValue): LValue {
  let plats = 0;
  plats = list(prop(rd, 'vapen')).getOne(e);
  return list(prop(rd, 'wpnPos')).getAt(plats);
}

export function resetrwcast() {
  // rgb("0x888888") is hex grey: Director reads the 0x form like "#".
  member('map1a').image.fill(member('map1a').image.rect, toDColor(rgb('0x888888')));
  member('map1b').image.fill(member('map1b').image.rect, toDColor(rgb('0x888888')));
  member('map2a').image.fill(member('map2a').image.rect, toDColor(rgb('0x888888')));
  member('map2b').image.fill(member('map2b').image.rect, toDColor(rgb('0x888888')));
  member3d('robot1', 2).resetWorld();
  member3d('robot2', 2).resetWorld();
  member3d('robot3', 2).resetWorld();
}

/** `case rd.ram[1] of #r1: member("robot1")...`: VOID when no case matches. */
function chassisMember(rd: LValue): Shockwave3dMember | undefined {
  const ram = list(prop(rd, 'ram')).getAt(1);
  if (eq(ram, sym('r1'))) return member3d('robot1');
  if (eq(ram, sym('r2'))) return member3d('robot2');
  if (eq(ram, sym('r3'))) return member3d('robot3');
  return undefined;
}

// srcMember is unused: the chassis member comes from the robot's frame.
export function BuildRobot(groupName: string, robotlist: LPropList, dstMember: Shockwave3dMember, srcMember?: Shockwave3dMember): Group3D {
  void srcMember;
  // global gPartDescription, gUserData
  let suffix: string;
  if (eq(groupName, 'robot2')) {
    suffix = '2';
  } else {
    suffix = '1';
  }
  put('Build Robot' + suffix);
  let botGroup!: Group3D;
  if (!voidp(groupName)) {
    botGroup = dstMember.newGroup(groupName);
  }
  // `if not voidp("rotGRP" & suffix)`: always true.
  const rotgroup = dstMember.newGroup('rotGRP' + suffix);
  const dumrsrc = dstMember.newModelResource('dumbox' + suffix, sym('box'));
  const dummy = dstMember.newModel('dummy' + suffix, dumrsrc);
  dummy.parent = botGroup;
  dummy.transform.scale = vector(5.5, 1.8, 6);
  dummy.transform.position = vector(0, 60, 0);
  dummy.visibility = sym('none');
  let srcRobot: Shockwave3dMember | undefined;
  for (const p of robotlist) {
    // Quirk: skips any entry equal to the wpnPos list (an empty wpnPos also skips
    // the other empty lists, which have nothing to install anyway).
    if (eq(prop(robotlist, 'wpnPos'), p)) {
      continue;
    }
    srcRobot = chassisMember(robotlist) ?? srcRobot;
    const rd = robotlist;
    if (listp(p)) {
      for (const e of p as LList) {
        put(e);
        const part = (G.gPartDescription as LPropList).getProp(e);
        const plats = list(prop(rd, 'vapen')).getOne(e);
        if (plats > 0) {
          InstallByggPart(botGroup, srcRobot!, dstMember, part, suffix, list(prop(rd, 'wpnPos')).getAt(plats));
          continue;
        }
        InstallByggPart(botGroup, srcRobot!, dstMember, part, suffix);
      }
      continue;
    }
    const part = (G.gPartDescription as LPropList).getProp(p);
    const plats = list(prop(rd, 'vapen')).getOne(p);
    if (plats > 0) {
      InstallByggPart(botGroup, srcRobot!, dstMember, part, suffix, list(prop(rd, 'wpnPos')).getAt(plats));
      continue;
    }
    InstallByggPart(botGroup, srcRobot!, dstMember, part, suffix);
  }
  rotgroup.addChild(dstMember.group(groupName), sym('preserveParent'));
  for (let i = dstMember.model.count; i >= 1; i--) {
    if (dstMember.model(i).parent === undefined) {
      dstMember.deleteModel(i);
    }
  }
  return botGroup;
}

export function BuildRobots() {
  // global gPlog
  G.gPlog = new LList();
  const rd1 = prop(prop(G.gUserData, 'propertyList'), 'robotDescription') as LPropList;
  let srcRobot = chassisMember(rd1);
  G.gRobot1 = BuildRobot('robot1', rd1, G.world, srcRobot);
  (G.gRobot1 as Group3D).scale(2.0);
  if (eq(G.gPlayerNumber, 1)) {
    callMovie('initWeapons', G.gRobot1, rd1, 1, 10);
    callMovie('initWheels', G.gRobot1, rd1, 1, 10);
  } else {
    callMovie('initWeapons', G.gRobot1, rd1, 1, 20);
    callMovie('initWheels', G.gRobot1, rd1, 1, 20);
  }
  put('done with robot 1');
  const rd2 = prop(prop(G.gopponentdata, 'propertyList'), 'robotDescription') as LPropList;
  srcRobot = chassisMember(rd2);
  G.gRobot2 = BuildRobot('robot2', rd2, G.world, srcRobot);
  (G.gRobot2 as Group3D).scale(2.0);
  if (eq(G.gPlayerNumber, 1)) {
    callMovie('initWeapons', G.gRobot2, rd2, 2, 20);
    callMovie('initWheels', G.gRobot2, rd2, 2, 20);
  } else {
    callMovie('initWeapons', G.gRobot2, rd2, 2, 10);
    callMovie('initWheels', G.gRobot2, rd2, 2, 10);
  }
  put('done building');
}

export function updateRobotTexture(m: Shockwave3dMember, robot: Node3D, name: string, rd: LPropList, n: number, rnum: number, im?: DImage) {
  // global gUserData, gPartDescription
  if (eq(prop(rd, 'ram'), new LList())) {
    return;
  }
  let tshader = m.shader(name);
  if (!tshader) {
    tshader = m.newShader(name, sym('standard'));
    tshader.ambient = rgb(0, 0, 0);
    tshader.diffuse = rgb(100, 50, 0);
    tshader.renderStyle = sym('fill');
    tshader.specular = rgb(150, 100, 0);
  }
  let modelpartname = '';
  switch (n) {
    case 1: {
      const ramName = list(prop(rd, 'ram')).getAt(1);
      modelpartname = String(list(prop((G.gPartDescription as LPropList).getProp(symbol(ramName)), 'model')).getAt(1));
      break;
    }
    case 2: {
      if (eq(getaPropOf(rd, sym('torn')), new LList())) {
        return;
      }
      const tornName = list(prop(rd, 'torn')).getAt(1);
      modelpartname = String(list(prop((G.gPartDescription as LPropList).getProp(symbol(tornName)), 'model')).getAt(1));
      break;
    }
  }
  let modelpart: Model;
  if (contains(the.movieName, 'arena') || contains(the.movieName, 'lobby')) {
    if (rnum === 2) {
      modelpartname = modelpartname + '2';
    }
    if (rnum === 1) {
      modelpartname = modelpartname + '1';
    }
    modelpart = robot.child(modelpartname) as Model;
  } else {
    modelpart = member3d('robot').model(modelpartname + '1');
  }
  modelpart.shaderList = tshader;
  let ttexture = m.texture(name);
  if (ttexture !== undefined) {
    m.deleteTexture(name);
  }
  if (im === undefined) {
    im = member(name).image as DImage;
  }
  ttexture = m.newTexture(name, sym('fromImageObject'), im);
  modelpart.shaderList[1].texture = ttexture;
  modelpart.shaderList[1].textureMode = sym('none');
}

export function InstallByggPart(botGroup: Group3D, srcMember: Shockwave3dMember, dstMember: Shockwave3dMember, part: LValue, suffix?: string | number, u?: LValue) {
  if (eq(suffix, '') || suffix === undefined) {
    suffix = 1;
  }
  if (getaPropOf(part, sym('model')) === undefined) {
    // no models
  } else {
    for (const v of list(prop(part, 'model'))) {
      const name = String(v);
      if (srcMember.model(name) === undefined) {
        put('No model or group for this part: ' + name);
        continue;
      }
      if (dstMember.model(name + suffix) !== undefined) {
        put('Model name exists already: ' + name + suffix);
        continue;
      }
      if (eq(u, sym('b'))) {
        if (dstMember.model(name) === undefined) {
          dstMember.cloneModelFromCastmember(name, name, srcMember);
        }
        dstMember.model(name).cloneDeep(name + suffix);
        dstMember.deleteModel(name);
        dstMember.model(name + suffix).transform = srcMember.model(name).getWorldTransform();
        dstMember.model(name + suffix).worldPosition = srcMember.model(name).worldPosition;
        dstMember.model(name + suffix).rotate(vector(0, 180, 0), sym('parent'));
        if (eq(prop(part, 'namn'), 'mini-gun')) {
          for (let i = 1; i <= dstMember.model(name + suffix).child.count; i++) {
            if (contains(dstMember.model(name + suffix).child(i).name, 'flame')) {
              (dstMember.model(name + suffix).child(i) as Model).visibility = sym('none');
            }
          }
        }
        botGroup.addChild(dstMember.model(name + suffix), sym('preserveParent'));
      } else {
        if (dstMember.model(name) === undefined) {
          dstMember.cloneModelFromCastmember(name, name, srcMember);
        }
        dstMember.model(name).cloneDeep(name + suffix);
        dstMember.deleteModel(name);
        dstMember.model(name + suffix).transform = srcMember.model(name).getWorldTransform();
        dstMember.model(name + suffix).worldPosition = srcMember.model(name).worldPosition;
        dstMember.model(name + suffix).rotate(vector(0, 0, 0), sym('parent'));
        if (contains(name, 'hjul')) {
          dstMember.model(name + suffix).shaderList.specular = rgb(0, 0, 0);
        }
        if (eq(prop(part, 'namn'), 'mini-gun')) {
          for (let i = 1; i <= dstMember.model(name + suffix).child.count; i++) {
            if (contains(dstMember.model(name + suffix).child(i).name, 'flame')) {
              (dstMember.model(name + suffix).child(i) as Model).visibility = sym('none');
            }
          }
        }
        if (contains(the.movieName, 'arena')) {
          if (contains(name, 'torn')) {
            const dumrsrc = dstMember.newModelResource('tornbox' + suffix, sym('box'));
            const dummy = dstMember.newModel('tornbox' + suffix, dumrsrc);
            dummy.parent = botGroup;
            dummy.transform.scale = vector(3, 3, 3);
            dummy.transform.position = vector(0, 90, -30);
            dummy.visibility = sym('none');
          }
          if (contains(name, 'laserkanon')) {
            const ray = dstMember.model('laserray').cloneDeep('laserray' + suffix) as Model;
            ray.shader.texture!.renderFormat = sym('rgba8888');
            ray.parent = dstMember.model(name + suffix);
            ray.transform.rotation = vector(0, -90, 0);
            ray.transform.position = vector(-200, 0, 0);
            ray.transform.scale.x = 10;
            ray.transform.scale.y = 10;
          }
        }
        botGroup.addChild(dstMember.model(name + suffix), sym('preserveParent'));
      }
    }
  }
}

export function UnInstallPart(dstMember: Shockwave3dMember, part: LValue) {
  if (getaPropOf(part, sym('model')) === undefined) {
    return;
  }
  for (const name of list(prop(part, 'model'))) {
    dstMember.deleteModel(String(name) + '1');
  }
}

export function showRobotInfo(bot: string) {
  for (let i = 1; i <= member3d(bot).model.count; i++) {
    put(member3d(bot).model(i).name);
  }
}

export function showRobotGroupInfo(bot: string) {
  put(member3d(bot).group.count);
  for (let i = 1; i <= member3d(bot).group.count; i++) {
    put(member3d(bot).group(i).name);
  }
}

export function GetMassPoint(m: Model): LVector {
  m.addModifier(sym('meshDeform'));
  let V = vector(0, 0, 0);
  let n = 0;
  const meshes = m.meshDeform!.mesh;
  for (let k = 1; k <= meshes.count; k++) {
    for (let i = 1; i <= meshes(k).vertexList.count; i++) {
      V = add(V, meshes(k).vertexList.getAt(i)) as LVector;
      n = n + 1;
    }
  }
  m.removeModifier(sym('meshDeform'));
  if (n === 0) {
    return V;
  }
  return div(V, n) as LVector;
}

export function GetMiddlePoint(m: Model): LVector {
  return m.boundingSphere.getAt(1) as LVector;
}
