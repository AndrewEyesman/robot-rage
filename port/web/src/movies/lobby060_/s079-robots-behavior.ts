// lobby060_ behavior 79 "robots behavior" (not in the score): the two-robot version
// of behavior 69, both robots (gOpponentProplist and gOpponentProplist2) side by side
// on a podium, turning together.

import { Behavior, G, callGlobal, cursor, member, put, sprite, the } from '../../director';
import { DImage } from '../../director/image';
import { member3d, vector, type Group3D, type Shockwave3dMember } from '../../director/s3d';
import { LPropList, abs, contains, listp, rgb, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { getaPropOf as getaProp } from '../robotwars/util';
import { BuildRobot, CreateShader, UnInstallPart, updateRobotTexture } from '../robotwars/s006-3d-scripts';
import { newCastMember } from '../../director';
import { TAB, item, itemCount, lingoString, setItemDelimiter } from '../../lingo';
import { text2image } from '../robotwars/s007-jump-movie';

/** The part-model member for a chassis (#r1, #r2, #r3). */
function srcFor(ram: LValue): Shockwave3dMember | undefined {
  if (ram === sym('r1')) return member3d('robot1');
  if (ram === sym('r2')) return member3d('robot2');
  if (ram === sym('r3')) return member3d('robot3');
  return undefined;
}

const rd = () => (G.gOpponentProplist as LPropList).getaProp(sym('robotDescription')) as LPropList;
const rd2 = () => (G.gOpponentProplist2 as LPropList).getaProp(sym('robotDescription')) as LPropList;
const first = (l: LValue) => (l as { getAt(i: number): LValue }).getAt(1);

export class RobotsBehavior extends Behavior {
  sp = 0;
  m!: Shockwave3dMember;
  robot: Group3D | undefined;
  counter = 0;
  angle: LValue;
  dangle = 0;
  lastloch = 0;
  state: LSymbol | undefined;
  srcRobot: Shockwave3dMember | undefined;
  srcRobot2: Shockwave3dMember | undefined;
  robots: Group3D | undefined;

  InitRobot() {
    this.m = member3d('robot');
    this.m.resetWorld();
    const s1 = srcFor(first(rd().getaProp(sym('ram'))));
    if (s1) this.srcRobot = s1;
    const s2 = srcFor(first(rd2().getaProp(sym('ram'))));
    if (s2) this.srcRobot2 = s2;
    if (!this.m.group('robot')) {
      this.robot = BuildRobot('robot', rd(), this.m, this.srcRobot);
      this.robot.translate(-120, 0, 0);
      this.robot.scale(0.8);
      const robot2 = BuildRobot('robot2', rd2(), this.m, this.srcRobot2);
      robot2.translate(120, 0, 0);
      robot2.scale(0.8);
      const podium = this.fixpodium();
      this.m.newLight('whitelight', sym('spot'));
      const whitelight = this.m.light('whitelight');
      whitelight.worldPosition = vector(0.0, 500.0, 1600.0);
      whitelight.color = rgb(255, 255, 255);
      whitelight.specular = true;
      this.m.camera[1].translate(0, 220, 180);
      this.m.camera[1].pointAt(vector(0, -1, 0), vector(0, -1, 0));
      this.robot.rotate(0, 180, 0);
      this.robots = this.m.newGroup('robots');
      this.robots.addChild(this.robot);
      this.robots.addChild(robot2);
      this.robots.addChild(podium);
      this.robots.rotate(120, 0, 0);
      put(lingoString(member('map3a').number) + ' finns bilden');
      if (member('map3a').number > 0) {
        // nothing
      } else {
        const newMember1 = newCastMember('bitmap');
        newMember1.name = 'map3a';
        (newMember1 as unknown as { image: DImage }).image = member('map1A').image;
        const newMember2 = newCastMember('bitmap');
        newMember2.name = 'map3b';
        (newMember2 as unknown as { image: DImage }).image = member('map1B').image;
        newMember1.castLib.reindex();
      }
      let tImage = lingoString((G.gOpponentProplist as LPropList).getaProp(sym('map')));
      setItemDelimiter(TAB);
      text2image(member('map3A').image, item(tImage, 1));
      updateRobotTexture(member3d('robot'), this.robot, 'map3A', rd(), 1, 1);
      if (itemCount(tImage) > 1) {
        text2image(member('map3B').image, item(tImage, 2));
        updateRobotTexture(member3d('robot'), this.robot, 'map3B', rd(), 2, 1);
      }
      tImage = lingoString((G.gOpponentProplist2 as LPropList).getaProp(sym('map')));
      setItemDelimiter(TAB);
      text2image(member('map2A').image, item(tImage, 1));
      updateRobotTexture(member3d('robot'), robot2, 'map2A', rd2(), 1, 2);
      if (itemCount(tImage) > 1) {
        text2image(member('map2B').image, item(tImage, 2));
        updateRobotTexture(member3d('robot'), robot2, 'map2B', rd2(), 2, 2);
      }
      G.gPlayer1map = (G.gOpponentProplist as LPropList).getaProp(sym('map'));
      G.gPlayer2map = (G.gOpponentProplist2 as LPropList).getaProp(sym('map'));
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
      if (this.robots !== undefined) {
        const locH = the.mouseH;
        this.dangle = 0.5 * this.dangle + (locH - this.lastloch) / 4.0;
        this.lastloch = locH;
        this.robots.rotate(0, this.dangle, 0);
      }
    } else if (st === sym('idle')) {
      if (this.robots !== undefined) {
        this.counter = this.counter + 1;
        if (this.counter % 2 === 0) this.robots.rotate(0, this.dangle, 0);
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

  fixpodium() {
    const podiumres = this.m.newModelResource('Podium', sym('plane'), sym('front'));
    (podiumres as unknown as { width: number; length: number }).width = 500;
    (podiumres as unknown as { width: number; length: number }).length = 500;
    const podium = this.m.newModel('podium', podiumres);
    (this.m.model('podium') as unknown as { addToWorld(): void }).addToWorld();
    podium.rotate(90, 0, 0);
    podium.translate(0, 0, 0);
    CreateShader('podiumshad', this.m, podium, rgb(50, 50, 50), member('podmap').image);
    return podium;
  }
}
