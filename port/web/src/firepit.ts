// The fire pit (the grate): InitFirePit's smoke and flame particle systems, and the
// fire behavior's initFire / stopFire, which swap smoke for flames while a robot is
// on the grate.

import * as THREE from 'three';
import { ParticleSystem } from './particles';

async function texture(url: string): Promise<THREE.Texture> {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  return t;
}

export async function firePit(assets: string) {
  const at = new THREE.Vector3(-4800, -900, 4800);
  const [smokeTex, fireTex] = await Promise.all([
    texture(`${assets}/arena104/bitmaps/1-77.png`), // member "smoke"
    texture(`${assets}/arena104/bitmaps/1-75.png`), // member "fire"
  ]);
  const smoke = new ParticleSystem(
    {
      lifeTime: 2000,
      colorStart: [100, 100, 100],
      colorEnd: [0, 0, 0],
      sizeStart: 200,
      sizeEnd: 400,
      blendStart: 60,
      blendEnd: 0,
      mode: 'stream',
      loop: true,
      direction: [0, 1, 0],
      angle: 30,
      minSpeed: 200,
      maxSpeed: 400,
      gravity: [0, 0, 0],
      drag: 0,
      numParticles: 50,
    },
    smokeTex,
    at,
  );
  const fire = new ParticleSystem(
    {
      lifeTime: 1500,
      colorStart: [255, 255, 100],
      colorEnd: [170, 100, 0],
      sizeStart: 600,
      sizeEnd: 400,
      blendStart: 0,
      blendEnd: 0,
      mode: 'stream',
      loop: false,
      direction: [0, 1, 0],
      angle: 20,
      minSpeed: 800,
      maxSpeed: 1600,
      gravity: [0, -6, 0],
      drag: 0,
      numParticles: 1,
    },
    fireTex,
    at,
  );
  let burning = false;
  return {
    smoke,
    fire,
    initFire() {
      if (burning) return;
      burning = true;
      fire.set({ loop: true, blendStart: 100, numParticles: 50 });
      smoke.set({ loop: false });
    },
    stopFire() {
      if (!burning) return;
      burning = false;
      smoke.set({ loop: true, numParticles: 50 });
      fire.set({ loop: false });
    },
    update(dt: number) {
      smoke.update(dt);
      fire.update(dt);
    },
  };
}
