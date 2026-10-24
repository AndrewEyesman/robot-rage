// lobby060_ behavior 69 "robot behavior" (sprite 26, the 3D view on a robot's card):
// builds the robot you clicked (gOpponentProplist) in member "robot" from the part
// models in "robot1"-"robot3", paints it with its maps, and turns it slowly; dragging
// spins it.

import { Behavior, G, callGlobal, cursor, member, put, sprite, the } from '../../director';
import { DImage, rectOf } from '../../director/image';
import { member3d, vector, type Group3D, type Shockwave3dMember } from '../../director/s3d';
import { LPropList, abs, contains, listp, rgb, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { getaPropOf as getaProp } from '../robotwars/util';
import { BuildRobot, UnInstallPart, updateRobotTexture } from '../robotwars/s006-3d-scripts';

/** The part-model member for a chassis (#r1, #r2, #r3). */
function srcFor(ram: LValue): Shockwave3dMember | undefined {
  if (ram === sym('r1')) return member3d('robot1');
  if (ram === sym('r2')) return member3d('robot2');
  if (ram === sym('r3')) return member3d('robot3');
  return undefined;
}

const rd = () => (G.gOpponentProplist as LPropList).getaProp(sym('robotDescription')) as LPropList;
const first = (l: LValue) => (l as { getAt(i: number): LValue }).getAt(1);

export class RobotBehavior extends Behavior {
  sp = 0;
  m!: Shockwave3dMember;
  robot: Group3D | undefined;
  counter = 0;
  angle: LValue;
  dangle = 0;
  lastloch = 0;
  state: LSymbol | undefined;
  srcRobot: Shockwave3dMember | undefined;

  InitRobot() {
    this.m = member3d('robot');
    this.m.resetWorld();
    const s = srcFor(first(rd().getaProp(sym('ram'))));
    if (s) this.srcRobot = s;
    if (!this.m.group('robot')) {
      this.robot = BuildRobot('robot', rd(), this.m, this.srcRobot);
      updateRobotTexture(this.m, this.robot, 'map1A', rd(), 1, 1);
      updateRobotTexture(this.m, this.robot, 'map1B', rd(), 2, 1);
      this.m.newLight('whitelight', sym('spot'));
      const whitelight = this.m.light('whitelight');
      whitelight.worldPosition = vector(0.0, 500.0, 1600.0);
      whitelight.color = rgb(255, 255, 255);
      whitelight.specular = false;
      this.m.camera[1].translate(0, 200, 250);
      this.m.camera[1].pointAt(vector(0, -50, 0), vector(0, -1, 0));
      this.robot.rotate(120, 0, 0);
      this.robot.rotate(0, 180, 0);
    } else {
      this.robot = this.m.group('robot');
    }
    this.dangle = 1.0;
    this.setZoom(0);
  }

  setZoom(V: number) {
    this.m.camera[1].fieldOfView = 50 - V / 3;
  }

  add3DPart(p: LValue) {
    put(p);
    if (listp(p)) {
      for (const e of p as Iterable<LValue>) callGlobal('InstallPart', this.robot, this.srcRobot, this.m, (G.gPartDescription as LPropList).getProp(e));
    } else {
      const s = srcFor(p);
      if (s) this.srcRobot = s;
      callGlobal('InstallPart', this.robot, this.srcRobot, this.m, (G.gPartDescription as LPropList).getProp(p));
    }
  }

  remove3DPart(p: LValue) {
    if (listp(p)) {
      for (const e of p as Iterable<LValue>) UnInstallPart(this.m, (G.gPartDescription as LPropList).getProp(e));
    } else {
      UnInstallPart(this.m, (G.gPartDescription as LPropList).getProp(p));
    }
  }

  findTornModelNumber() {
    for (let i = 1; i <= this.robot!.child.count; i++) if (contains(this.robot!.child[i].name, 'torn')) return i;
    return undefined;
  }

  updateTexture(name: string, n: number) {
    if (this.state === sym('wait')) return;
    if (n === 1) updateRobotTexture(this.m, this.robot!, 'map2A', rd(), 1, 1);
    else if (n === 2) updateRobotTexture(this.m, this.robot!, 'map2B', rd(), 2, 1);
    let tshader = this.m.shader(name);
    if (!tshader) {
      tshader = this.m.newShader(name, sym('standard'));
      tshader.ambient = rgb(0, 0, 0);
      tshader.diffuse = rgb(100, 50, 0);
      tshader.renderStyle = sym('fill');
      tshader.specular = rgb(150, 100, 0);
    }
    let modelpartname = '';
    if (n === 1) {
      const ramName = first(rd().getaProp(sym('ram')));
      modelpartname = String(first(getaProp((G.gPartDescription as LPropList).getProp(symbol(ramName)), sym('model')))) + '1';
    } else if (n === 2) {
      const tornName = first(rd().getaProp(sym('torn')));
      modelpartname = String(first(getaProp((G.gPartDescription as LPropList).getProp(symbol(tornName)), sym('model')))) + '1';
    }
    const modelpart = this.robot!.child(modelpartname) as unknown as { shaderList: { [i: number]: typeof tshader } };
    modelpart.shaderList[1] = tshader;
    if (this.m.texture(name) !== undefined) this.m.deleteTexture(name);
    const w = member(name).width;
    const h = member(name).height;
    const im = new DImage(w, h, 24);
    im.copyPixels(member(name).image, rectOf(0, 0, w, h), member(name).rect);
    const ttexture = this.m.newTexture(name, sym('fromImageObject'), im);
    modelpart.shaderList[1].texture = ttexture;
    modelpart.shaderList[1].textureMode = sym('none');
    tshader.wrapTransform.rotate(180, 0, 180);
  }

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('preload');
    this.hide3DRobot();
  }

  mouseDown() {
    if (this.robot !== undefined) {
      this.lastloch = the.mouseH;
      cursor(290);
      this.state = sym('drag');
    }
  }

  mouseWithin() {
    if (!the.stillDown) cursor(260);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    if (this.robot !== undefined) this.state = sym('idle');
  }

  mouseUpOutSide() {
    if (this.robot !== undefined) this.state = sym('idle');
  }

  prepareFrame() {
    const st = this.state;
    if (st === sym('preload')) {
      // preloadMember: every 3D member is loaded with its cast.
      put('preloading robots');
      this.state = sym('wait');
    } else if (st === sym('wait')) {
      if ([member3d('robot'), member3d('robot1'), member3d('robot2'), member3d('robot3')].every((x) => x?.state === 4)) this.state = sym('init');
    } else if (st === sym('init')) {
      put('init robot');
      this.state = sym('nada');
    } else if (st === sym('drag')) {
      if (this.robot !== undefined) {
        const locH = the.mouseH;
        this.dangle = 0.5 * this.dangle + (locH - this.lastloch) / 4.0;
        this.lastloch = locH;
        this.robot.rotate(0, this.dangle, 0);
      }
    } else if (st === sym('idle')) {
      if (this.robot !== undefined) {
        this.counter = this.counter + 1;
        if (this.counter % 2 === 0) this.robot.rotate(0, this.dangle, 0);
        if (this.dangle > 2) this.dangle = this.dangle - 0.02;
        if (this.dangle < -2) this.dangle = this.dangle + 0.02;
        if (Number(abs(this.dangle)) < 0.01) this.dangle = 0.0;
      }
    }
  }

  Show3DRobot() {
    sprite(this.spriteNum).visible = true;
    sprite(this.spriteNum - 1).visible = true;
    this.InitRobot();
  }

  hide3DRobot() {
    this.robot = undefined;
    sprite(this.spriteNum).visible = false;
    sprite(this.spriteNum - 1).visible = false;
  }
}
