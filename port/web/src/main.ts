// Robot Rage arena, Training mode: one robot on the rooftop.
//
// The game logic ticks at the original's 20 fps tempo; drawing runs at the display's
// rate and places the robot and camera between the last two ticks.
//
// Keys: arrows drive, 1/2/3 pick the camera, L switches between the original 4:3
// layout and widescreen, R restarts.

import * as THREE from 'three';
import { loadArena } from './arena';
import { FollowCamera } from './camera';
import { loadMatte, MapSprite, intersects } from './collision';
import { LightRig } from './director-material';
import { Hud } from './hud';
import { applyPaintMap, buildRobot, placeRobot, RobotBehavior, Wheels, type Pose, type RobotDescription } from './robot';
import { parts } from './parts';
import { firePit } from './firepit';
import { Sound } from './sound';
import { W3dMember } from './w3d';

const ASSETS = '/assets';
const TICK_MS = 50;
const STAGE = { w: 800, h: 600 };
/** The 3D sprite's rect on the original stage (loc 402,233, 750x449, centred). */
const VIEW = { x: 27, y: 9, w: 750, h: 449 };

// The robot, from the URL (?parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher) or
// "Crusher", the test account's robot: small chassis, four small wheels, small engine, plow.
const query = new URLSearchParams(location.search);
const robotDescription = describe(query.get('parts') ?? 'r1,h2,ma1,b1,v6', query.get('pos') ?? 'f');
const ROBOT_NAME = query.get('name') ?? 'Crusher';
const PANSAR = Number(query.get('pansar') ?? 50);

function describe(ids: string, positions: string): RobotDescription {
  const rd: RobotDescription = { ram: [], torn: [], hjul: [], motor: [], batteri: [], vapen: [], wpnPos: [], special: [], ammunition: [] };
  const lists: Record<string, string[]> = rd as unknown as Record<string, string[]>;
  for (const id of ids.split(',').filter(Boolean)) {
    const typ = parts[id]?.typ;
    if (typ && lists[typ]) lists[typ].push(id);
  }
  rd.wpnPos = positions.split(',').slice(0, rd.vapen.length);
  return rd;
}

THREE.ColorManagement.enabled = false;

async function main() {
  let wide = query.get('layout') !== 'original';
  const info = document.getElementById('info')!;
  const stageEl = document.getElementById('stage')!;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000);
  const hud = await Hud.load(ASSETS);
  stageEl.append(hud.canvas, renderer.domElement);

  const rig = new LightRig();
  const arena = await loadArena(rig, ASSETS);
  const scene = new THREE.Scene();
  scene.add(arena.root);

  const chassis = { r1: 'robot1', r2: 'robot2', r3: 'robot3' }[robotDescription.ram[0]] ?? 'robot1';
  const robotMember = await W3dMember.load(`${ASSETS}/robotwars/w3d`, chassis, rig);
  const model = buildRobot(robotMember, robotDescription, '1');
  scene.add(model.rotGroup);
  // The paint maps (the cast's defaults until the server's saved maps are loaded).
  const paint = async (n: number) => {
    const t = await new THREE.TextureLoader().loadAsync(`${ASSETS}/robotwars/bitmaps/1-${n}.png`);
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.userData.hasAlpha = false;
    return t;
  };
  applyPaintMap(model, robotDescription, 1, '1', await paint(187), rig);
  if (robotDescription.torn.length) applyPaintMap(model, robotDescription, 2, '1', await paint(188), rig);

  // The hidden 2D map (sprite channels and rects from the Training frame of the score).
  const bm = (n: number) => `${ASSETS}/arena104/bitmaps/1-${n}.png`;
  const mapRect: [number, number] = [760, 758];
  const [rob, m15, m16, m17, m18, firepitM, pitM] = await Promise.all([
    loadMatte(bm(52), false),
    loadMatte(bm(197), true),
    loadMatte(bm(198), true),
    loadMatte(bm(199), true),
    loadMatte(bm(200), true),
    loadMatte(bm(58), false),
    loadMatte(bm(54), false),
  ]);
  const wall = (m: typeof m15) => new MapSprite(m, 488, 487, [0, 0], mapRect[0], mapRect[1], [822, -180]);
  const sprites = {
    // The robot and fire pit sprites aren't stretched: they draw at the member's size.
    robot: new MapSprite(rob, 33, 26, [17, 13], 33, 26, [1131, 203]),
    walls: [wall(m15), wall(m16), wall(m17), wall(m18)] as [MapSprite, MapSprite, MapSprite, MapSprite],
    fences: [
      new MapSprite(null, 21, 130, [2, 63], 1, 169, [1390, 381]),
      new MapSprite(null, 21, 130, [2, 63], 1, 169, [1382, 381]),
    ] as [MapSprite, MapSprite],
    firepit: new MapSprite(firepitM, 78, 72, [39, 36], 78, 72, [960, 439]),
    pit: new MapSprite(pitM, 29, 29, [14, 14], 44, 92, [1200, 91]),
  };

  const sound = await Sound.load(ASSETS, ['arena104', 'robotwars']);
  sound.preload(['regular_krock', 'fence_krock', 'flamethrow', 'krasch11']);
  const pit = await firePit(ASSETS);
  scene.add(pit.smoke.mesh, pit.fire.mesh);

  const wheels = new Wheels(robotDescription, model, '1');
  let gameOverAt = 0;
  // The game's clock (the milliSeconds) advances one tempo step per tick, so timing
  // inside the logic doesn't depend on when the browser runs the ticks.
  let gameTime = 0;
  const now = () => gameTime;
  const robot = new RobotBehavior(
    robotDescription,
    PANSAR,
    sprites,
    wheels,
    {
      sound: (name, volume) => sound.playsound(name, volume),
      fire: (on) => (on ? pit.initFire() : pit.stopFire()),
      gameOver: () => {
        if (!gameOverAt) gameOverAt = now();
      },
    },
    now,
  );

  const camera3d = new THREE.PerspectiveCamera(60, VIEW.w / VIEW.h, 10, 1000000);
  const follow = new FollowCamera();

  // Keys, as the frame script reads them: left, right, up, down, z, x, c.
  const down = new Set<string>();
  addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (e.key === '1' || e.key === '2' || e.key === '3') follow.setView(Number(e.key));
    if (e.key === 'l' || e.key === 'L') {
      wide = !wide;
      layout();
    }
    if (e.key === 'r' || e.key === 'R') restart();
  });
  addEventListener('blur', () => down.clear());
  const keyMap = () =>
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX', 'KeyC'].map((k) => (down.has(k) ? '1' : '0')).join('') + '0';
  let lastMap = '00000000';

  let prevPose: Pose;
  let pose: Pose;
  let counter = 0;
  const robotPos = (p: Pose) => new THREE.Vector3(p.x * 5, p.z, p.y * 5);

  function restart() {
    gameOverAt = 0;
    robot.state = 'init';
    robot.pansar = PANSAR;
    robot.prepareFrame();
    sprites.robot.setLoc(1200 + 0.25 * robot.x, 200 + 0.25 * robot.y);
    sprites.robot.rotation = robot.angle;
    pose = prevPose = robot.pose();
    follow.setView(1);
    follow.setView(1);
    follow.step(robotPos(pose), robot.angle);
    follow.snap();
    lastMap = '00000000';
    // The frame script's #init state: count from zero and show the readings.
    counter = 0;
    hud.update(robot.energy, robot.pansar);
  }
  restart();

  function tick() {
    // stepFrame (actorList), then prepareFrame (the robot, then the frame script).
    gameTime += TICK_MS;
    prevPose = pose;
    follow.step(robotPos(pose), robot.angle);
    robot.prepareFrame();
    const map = keyMap();
    if (map !== lastMap) {
      robot.keyPressed(map, 0);
      lastMap = map;
    }
    if (intersects(sprites.robot, sprites.pit) && robot.state === 'move') robot.tip();
    wheels.exitFrame(robot.speed, robot.dx, robot.dy);
    pose = robot.pose();
    counter++;
    if (counter % 16 === 0) hud.update(robot.energy, robot.pansar);
    if (gameOverAt && now() - gameOverAt > 3000) restart();
  }

  function lerpPose(a: Pose, b: Pose, t: number): Pose {
    let da = b.angle - a.angle;
    if (da > 180) da -= 360;
    if (da < -180) da += 360;
    const l = (u: number, v: number) => u + (v - u) * t;
    return { x: l(a.x, b.x), y: l(a.y, b.y), z: l(a.z, b.z), angle: a.angle + da * t, anglex: l(a.anglex, b.anglex), anglez: l(a.anglez, b.anglez) };
  }

  let view = { x: 0, y: 0, w: 0, h: 0 };
  function layout() {
    const dpr = devicePixelRatio || 1;
    const W = innerWidth;
    const H = innerHeight;
    if (!wide) {
      // The original stage, scaled to fit.
      const s = Math.min(W / STAGE.w, H / STAGE.h);
      const left = (W - STAGE.w * s) / 2;
      const top = (H - STAGE.h * s) / 2;
      hud.layout(left, top, s, false, W);
      view = { x: left + VIEW.x * s, y: top + VIEW.y * s, w: VIEW.w * s, h: VIEW.h * s };
    } else {
      // Widescreen: the 3D view spans the window above the original's control panel.
      const s = H / STAGE.h;
      const panelTop = H - (STAGE.h - 457) * s;
      hud.layout((W - STAGE.w * s) / 2, H - STAGE.h * s, s, true, W);
      view = { x: 0, y: 0, w: W, h: panelTop };
    }
    renderer.setPixelRatio(dpr);
    renderer.setSize(Math.round(view.w), Math.round(view.h));
    Object.assign(renderer.domElement.style, { left: `${view.x}px`, top: `${view.y}px` });
    camera3d.aspect = view.w / view.h;
    camera3d.updateProjectionMatrix();
  }
  addEventListener('resize', layout);
  layout();

  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fpsTime = last;
  function frame(t: number) {
    // Particles are only for looks, so they move at the display's rate.
    pit.update(Math.min(0.1, (t - last) / 1000));
    acc += t - last;
    last = t;
    if (acc > 250) acc = 250;
    while (acc >= TICK_MS) {
      tick();
      acc -= TICK_MS;
    }
    const k = acc / TICK_MS;
    placeRobot(model, lerpPose(prevPose, pose, k));
    follow.apply(camera3d, k);
    renderer.render(scene, camera3d);
    hud.draw(ROBOT_NAME);
    frames++;
    if (t - fpsTime > 1000) {
      info.textContent = `${Math.round((frames * 1000) / (t - fpsTime))} fps · ${wide ? 'widescreen' : '4:3'} (L) · camera 1/2/3 · R restart`;
      frames = 0;
      fpsTime = t;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // For automated checks.
  Object.assign(window, { __port: { robot, follow, sprites, scene, camera3d, renderer, tick, pit, sound } });
}

main().catch((e) => {
  document.getElementById('info')!.textContent = String(e);
  console.error(e);
});
