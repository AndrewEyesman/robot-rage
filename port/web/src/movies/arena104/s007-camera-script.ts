// arena104 parent script 7 "camera script": the arena camera, made by the frame
// scripts (new(script("camera script"))) and stepped through the actorList. Views 1-3
// follow behind the player's robot on a spring (SpringDamp), 4 stands still, "v" is the
// spy camera from above (v37), "b" looks backwards from the robot (v23), "mini" rides
// the mini car.

import { G, keyPressed, member, sendAllSprites } from '../../director';
import { transform, vector, type Camera3D, type Group3D, type Node3D, type Vector } from '../../director/s3d';
import { PI, add, duplicate, point, rgb, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { SpringDamp } from '../robotwars/s006-3d-scripts';
import { theOVerlay } from './s006-arena-3d';
import { eq, member3dOf, n, sp, world } from './util';

// global world, gRobot1, gRobot2, gPlayerNumber, gGamePlace, pLastcam, pNowCam

const s = (name: string) => sym(name);

export class CameraScript {
  camera: Camera3D;
  state: LSymbol;
  camdist: number;
  camheight: number;
  pointheight: number;
  currPos: LValue = undefined;
  trgPos: Vector;
  prevTrgPos: Vector | undefined = undefined;
  fow: number = undefined as unknown as number;
  z: number;
  camgrp: Group3D;
  pHigh: number;
  pmove: number;
  pready: number;

  constructor() {
    this.camera = world().camera(1);
    this.camera.fieldOfView = 60;
    this.camera.colorBuffer.clearValue = rgb(0, 0, 0);
    this.camera.projection = s('perspective');
    this.state = s('init');
    this.z = 0;
    this.camgrp = world().newGroup('camgrp');
    this.camera.parent = this.camgrp;
    const TRN = transform();
    this.camera.transform = TRN;
    this.camdist = 500;
    this.camheight = 200;
    this.pointheight = 400;
    const alpha = ((180 + n(sp(n(G.gPlayerNumber) * 10, 'angle'))) * PI) / 180;
    this.trgPos = add((G.gRobot1 as Group3D).worldPosition, vector(this.camdist * Math.cos(alpha), this.z + this.camheight, this.camdist * Math.sin(alpha))) as Vector;
    if (this.trgPos.y < this.z) {
      this.trgPos.y = this.z;
    }
    if (this.prevTrgPos === undefined) {
      this.camgrp.worldPosition = this.trgPos;
    } else {
      this.camgrp.worldPosition = SpringDamp(this.camgrp.worldPosition, this.trgPos, this.prevTrgPos, 1.0, 0.15, 0.15, 1.1);
    }
    this.camgrp.pointAt(add((G.gRobot1 as Group3D).worldPosition, vector(0, this.pointheight, 0)) as Vector, vector(0, 1, 0));
    this.prevTrgPos = duplicate(this.trgPos);
    this.state = s('follow');
    this.pHigh = 60;
    this.pmove = 0;
    this.pready = 1;
    let theTexture = member3dOf(1, 1).texture('spycam');
    if (theTexture === undefined) {
      theTexture = member3dOf(1, 1).newTexture('spycam', s('fromCastMember'), memberNamed('spycam'));
      theTexture.renderFormat = s('rgba8888');
      this.camera.addOverlay(theTexture, pt(0, 0), 0);
      this.camera.overlay(theOVerlay('spycam')!).blend = 0.0;
    }
    theTexture = member3dOf(1, 1).texture('BACKCAM');
    if (theTexture === undefined) {
      theTexture = member3dOf(1, 1).newTexture('BACKCAM', s('fromCastMember'), memberNamed('BACKCAM'));
      theTexture.renderFormat = s('rgba8888');
      this.camera.addOverlay(theTexture, pt(0, 0), 0);
      this.camera.overlay(theOVerlay('BACKCAM')!).blend = 0.0;
    }
    G.pLastcam = 1;
    G.pNowCam = 1;
  }

  SetView(nv: LValue, par?: Node3D) {
    if (this.state === s('init')) {
      return;
    }
    if (this.state === s('back')) {
      this.camera.transform.rotation = vector(0, 0, 0);
      const OV = 'back';
      // theOVerlay("back") finds the BACKCAM overlay (names are matched by `contains`).
      this.camera.overlay(theOVerlay(OV)!).blend = 0;
      world().group('camgrp').transform.position = vector(0, 150, -200);
      world().group('camgrp').transform.rotation = vector(0, 0, 0);
      world().group('world').addChild(world().group('camgrp'), s('preserveWorld'));
      world().group('camgrp').transform.scale = vector(1, 1, 1);
      sendAllSprites('gofront');
    } else {
      if (this.state === s('top')) {
        this.camera.overlay(theOVerlay('spycam')!).blend = 0;
      }
    }
    if (this.state === s('mini')) {
      if (eq(nv, 'minioff')) {
        this.camera.overlay(theOVerlay('mini')!).blend = 0;
        nv = G.pLastcam;
      } else {
        return;
      }
    }
    if (eq(nv, G.pNowCam)) {
      nv = G.pLastcam;
    } else {
      if (eq(nv, 1) || eq(nv, 2) || eq(nv, 3)) {
        G.pLastcam = nv;
      }
    }
    G.pNowCam = nv;
    if (eq(nv, 1)) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.camheight = 200;
      this.camdist = 500;
      this.pointheight = 400;
      this.prevTrgPos = undefined;
      this.state = s('follow');
      this.camera.transform.rotation = vector(0, 0, 0);
    } else if (eq(nv, 2)) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.camheight = 300;
      this.camdist = 1000;
      this.pointheight = 300;
      this.prevTrgPos = undefined;
      this.state = s('follow');
    } else if (eq(nv, 3)) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.camheight = 400;
      this.camdist = 1500;
      this.pointheight = 200;
      this.prevTrgPos = undefined;
      this.state = s('follow');
    } else if (eq(nv, 4)) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.prevTrgPos = undefined;
      this.state = s('still');
    } else if (eq(nv, 'v')) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.prevTrgPos = undefined;
      this.state = s('top');
      this.camera.overlay(theOVerlay('spycam')!).blend = 100;
      world().group('camgrp').parent = world().group('world');
      world().group('camgrp').transform.position = (G.gRobot1 as Group3D).worldPosition;
      world().group('camgrp').transform.rotation = vector(-90, 0, 0);
      world().group('camgrp').transform.scale = vector(1, 1, 1);
    } else if (eq(nv, 'b')) {
      this.fow = 80.0;
      this.camera.fieldOfView = this.fow;
      this.prevTrgPos = undefined;
      this.state = s('back');
      this.camera.transform.rotation = vector(0, 180, 0);
      this.camera.overlay(theOVerlay('back')!).blend = 100;
      world().group('camgrp').parent = G.gRobot1;
      world().group('camgrp').transform.position = vector(0, 150, 0);
      world().group('camgrp').transform.rotation = vector(0, 180, 0);
      world().group('camgrp').transform.scale = vector(1, 1, 1);
    } else if (eq(nv, 'front')) {
      this.fow = 60.0;
      this.camera.fieldOfView = this.fow;
      this.camheight = 200;
      this.camdist = 500;
      this.pointheight = 400;
      this.prevTrgPos = undefined;
      this.state = s('follow');
    } else if (eq(nv, 'mini')) {
      this.fow = 90.0;
      this.camera.fieldOfView = this.fow;
      this.prevTrgPos = undefined;
      this.state = s('mini');
      this.camera.transform.rotation = vector(0, 0, 0);
      const nr = theOVerlay('mini');
      void nr;
      this.camera.overlay(theOVerlay('mini')!).blend = 100;
      world().group('camgrp').parent = par;
      world().group('camgrp').transform.position = vector(0, 0, 10);
      world().group('camgrp').transform.rotation = vector(0, 0, 0);
      world().group('camgrp').transform.scale = vector(1, 1, 1);
    }
  }

  /** Follow the player's robot: the camera group springs towards a point behind it and looks at it. */
  private follow() {
    const alpha = ((180 + n(sp(n(G.gPlayerNumber) * 10, 'angle'))) * PI) / 180;
    this.trgPos = add((G.gRobot1 as Group3D).worldPosition, vector(this.camdist * Math.cos(alpha), this.z + this.camheight, this.camdist * Math.sin(alpha))) as Vector;
    if (this.trgPos.y < this.z) {
      this.trgPos.y = this.z;
    }
    if (this.prevTrgPos === undefined) {
      this.camgrp.worldPosition = this.trgPos;
    } else {
      this.camgrp.worldPosition = SpringDamp(this.camgrp.worldPosition, this.trgPos, this.prevTrgPos, 1.0, 0.15, 0.15, 1.1);
    }
    this.camgrp.pointAt(add((G.gRobot1 as Group3D).worldPosition, vector(0, this.pointheight, 0)) as Vector, vector(0, 1, 0));
    this.prevTrgPos = duplicate(this.trgPos);
  }

  stepFrame() {
    // The #init case of the first `case` repeats #follow's code, for a state the
    // camera only has inside new().
    if (this.state === s('init')) {
      this.follow();
    }
    if (this.state === s('follow')) {
      this.follow();
    } else if (this.state === s('top')) {
      this.trgPos = (G.gRobot1 as Group3D).worldPosition;
      this.trgPos.y = 10000;
      let tSound: number;
      if (keyPressed('n')) {
        this.pmove = this.pmove - 0.1;
        tSound = 1;
      } else {
        if (keyPressed('m')) {
          this.pmove = this.pmove + 0.1;
          tSound = 2;
        } else {
          tSound = 0;
          this.pready = 1;
        }
      }
      if (tSound > 0 && this.pready === 1) {
        playsound('zoom' + tSound, 255);
        this.pready = 0;
      }
      if (this.pmove > 2) {
        this.pmove = 2;
      }
      if (this.pmove < -2) {
        this.pmove = -2;
      }
      this.pHigh = this.pHigh + this.pmove;
      this.pmove = this.pmove * 0.9;
      if (this.pHigh > 100) {
        this.pHigh = 100;
        this.pmove = 0;
      }
      if (this.pHigh < 10) {
        this.pHigh = 10;
        this.pmove = 0;
      }
      this.camera.fieldOfView = this.pHigh;
      this.camgrp.worldPosition = this.trgPos;
    } else if (this.state === s('back')) {
      // nothing
    }
  }
}

// ---------------------------------------------------------------- helpers

const pt = (h: number, v: number) => point(h, v);
const memberNamed = (name: string) => member(name);
