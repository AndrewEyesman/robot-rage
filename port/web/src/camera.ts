// The arena's "camera script": a camera that follows behind the robot on a spring.
// Views 1-3 are the near, middle and far follow cameras.

import * as THREE from 'three';

/** SpringDamp from the shared cast's 3D scripts. */
function springDamp(
  curr: THREE.Vector3,
  trg: THREE.Vector3,
  prevTrg: THREE.Vector3,
  deltaTime: number,
  springConst: number,
  dampConst: number,
  springLen: number,
): THREE.Vector3 {
  const disp = curr.clone().sub(trg);
  const velocity = prevTrg.clone().sub(trg).multiplyScalar(deltaTime);
  const len = disp.length();
  const forceMag = len === 0 ? 10000.0 : springConst * (springLen - len) + dampConst * (disp.dot(velocity) / len);
  disp.normalize().multiplyScalar(forceMag * deltaTime);
  return curr.clone().add(disp);
}

const VIEWS: Record<number, { camheight: number; camdist: number; pointheight: number }> = {
  1: { camheight: 200, camdist: 500, pointheight: 400 },
  2: { camheight: 300, camdist: 1000, pointheight: 300 },
  3: { camheight: 400, camdist: 1500, pointheight: 200 },
};

export class FollowCamera {
  fov = 60;
  camdist = 500;
  camheight = 200;
  pointheight = 400;
  private readonly z = 0;
  /** Camera group position after the last tick, and the one before (for drawing between ticks). */
  pos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  target = new THREE.Vector3();
  prevTarget = new THREE.Vector3();
  private prevTrgPos: THREE.Vector3 | null = null;
  private lastCam = 1;
  private nowCam = 1;

  /** stepFrame: chase the point behind the robot, then look at it. */
  step(robotPos: THREE.Vector3, robotAngle: number) {
    this.prevPos.copy(this.pos);
    this.prevTarget.copy(this.target);
    const alpha = ((180 + robotAngle) * Math.PI) / 180;
    const trgPos = robotPos
      .clone()
      .add(new THREE.Vector3(this.camdist * Math.cos(alpha), this.z + this.camheight, this.camdist * Math.sin(alpha)));
    if (trgPos.y < this.z) trgPos.y = this.z;
    if (this.prevTrgPos === null) this.pos.copy(trgPos);
    else this.pos.copy(springDamp(this.pos, trgPos, this.prevTrgPos, 1.0, 0.15, 0.15, 1.1));
    this.target.copy(robotPos).add(new THREE.Vector3(0, this.pointheight, 0));
    this.prevTrgPos = trgPos.clone();
  }

  /** Snap without easing (the first frame). */
  snap() {
    this.prevPos.copy(this.pos);
    this.prevTarget.copy(this.target);
  }

  /** SetView for the follow cameras: pressing the current view's key again goes back. */
  setView(n: number) {
    if (n === this.nowCam) n = this.lastCam;
    else if (n >= 1 && n <= 3) this.lastCam = n;
    this.nowCam = n;
    const v = VIEWS[n];
    if (!v) return;
    this.fov = 60;
    Object.assign(this, v);
    this.prevTrgPos = null;
  }

  /** Place a Three.js camera between the last two ticks. */
  apply(camera: THREE.PerspectiveCamera, t: number) {
    camera.position.lerpVectors(this.prevPos, this.pos, t);
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3().lerpVectors(this.prevTarget, this.target, t));
    if (camera.fov !== this.fov) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}
