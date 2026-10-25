// Check two robots meeting (rams, pushes, melee weapons, shots, mines) against the game's
// own Lingo, tick by tick.
//
//   node port/tools/robots-trace.mjs [scenario ...] [--server=8091] [--app=http://127.0.0.1:8092] [--ticks=N]
//        [--verbose] [--print] [--adobe] [--dump=/tmp/prefix] [--reuse=/tmp/prefix]
//
// physics-trace drives one robot and weapon-trace replays one robot under the weapons;
// neither has a second robot, so neither reaches the robot behavior's `hit` (the bump),
// the frame script's checkCollision, or a weapon or shot meeting the other robot. Here
// both robots are real. Training has no opponent (sprites 20-24 are empty), so each side
// adds one as the match frames place it (score frames 9-10: rob2 on sprite 20, the
// robot behavior, robot 2's wheels and weapons on 21-24 from BuildRobots' initWheels
// and initWeapons):
//
// 1. dirplayer (the test server, never 8090) runs the original: log in, enter Training,
//    pause, give gUserData and gopponentdata the scenario's robots, rebuild the world and
//    robot 1 (the frame script's beginSprite), build robot 2, put fresh robot behaviors
//    on 10 and 20 (InitRobot), place both, and then per 20 fps tick: queue each robot's
//    keys, one sendAllSprites(#prepareFrame) (robots, wheels, weapons and shots in channel
//    order), then the frame script's checkCollision and RecycleSprites (sprites before
//    the frame script, as Director and the port's player run prepareFrame). After each
//    tick it reads both robots, their weapons' and shots' sprites and properties, and
//    their 3D models.
// 2. The port does the same with its translations, on the arena movie, with `the
//    milliSeconds` pinned on both sides to the same 20 fps timeline.
// 3. The values are compared tick by tick (to 1e-3). Robot 2 in Training is like the
//    opponent in a match: its damage isn't counted on this side (the robot behavior only
//    takes armour off robot 1), so scenarios have robot 2 attack too, to check what the
//    weapons take off robot 1.
//
// Where dirplayer and Adobe's player differ (sprite positions truncated or rounded,
// sqrt of an integer), the port takes dirplayer's way for the comparison
// (Sprite.truncate, lingoCompat.floatSqrt).
//
// --print shows the original's robots tick by tick (position, velocity, speed, turn):
// the numbers to judge the original's feel by. --adobe (with --reuse) runs the port as it
// plays instead, with Adobe's rounding of sprite positions where dirplayer truncates, and
// prints it the same way (nothing to compare it with). Exits non-zero on a mismatch.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const SERVER = opt('server', '8091');
if (SERVER === '8090') throw new Error('never 8090 (the shared server)');
const APP = opt('app', 'http://127.0.0.1:8092');
const VERBOSE = args.includes('--verbose');
const PRINT = args.includes('--print');
const ADOBE = args.includes('--adobe');

const run = (map, n) => Array(n).fill(map);
/** A keymap (left, right, up, down, z, x, c, unused) from its pressed keys: 'U', 'UL', 'Z'... */
const keys = (s) => ['L', 'R', 'U', 'D', 'Z', 'X', 'C', '-'].map((k) => (s.includes(k) ? '1' : '0')).join('');
/** A schedule from [keys, ticks] pairs. */
const sched = (...parts) => parts.flatMap(([k, n]) => run(keys(k), n));
const robot = ({ ram = 'r1', torn = [], hjul = 'h2', motor = 'ma1', batteri = 'b3', vapen = [], pos = [] }) =>
  `[#ram: [#${ram}], #torn: [${torn.map((t) => '#' + t).join(', ')}], #hjul: [#${hjul}], #motor: [#${motor}], #batteri: [#${batteri}], #vapen: [${vapen.map((v) => '#' + v).join(', ')}], #wpnPos: [${pos.map((p) => '#' + p).join(', ')}], #special: [], #ammunition: []]`;

// Places on the arena's hidden map: x and y are the robot behavior's (the map loc is
// 1200 + x/4, 200 + y/4), clear of the pit (map 1179-1223, 47-139), the fire pit and the
// fences. Angle 0 drives +x, 90 drives +y.
const LIGHT = { ram: 'r1', hjul: 'h2', batteri: 'b3' };
const HEAVY = { ram: 'r3', torn: ['t3'], hjul: 'h5', motor: 'ma1', batteri: 'b3' };
export const SCENARIOS = {
  // Both drive at each other along the x axis: the bump, light against heavy.
  head_on: {
    r1: robot({ ...LIGHT }), pansar1: 60, r2: robot({ ...HEAVY }), pansar2: 120,
    p1: [450, 150, 180], p2: [-450, 150, 0],
    s1: sched(['', 4], ['U', 60], ['', 40]), s2: sched(['', 4], ['U', 60], ['', 40]),
  },
  // Robot 1 rams robot 2's side while it stands, then keeps pushing and turning (the
  // repeated bump, every fifth one pushing them apart, and the turn it gives).
  side_push: {
    r1: robot({ ...HEAVY }), pansar1: 120, r2: robot({ ...LIGHT }), pansar2: 60,
    p1: [0, 350, 270], p2: [0, 0, 0],
    s1: sched(['', 4], ['U', 50], ['UL', 30], ['U', 30], ['D', 20], ['', 20]), s2: sched(['', 100], ['UR', 30], ['', 24]),
  },
  // Both keep driving into each other nose to nose: bump after bump, every fifth one
  // pushing them apart from their centres.
  shove: {
    r1: robot({ ...HEAVY }), pansar1: 120, r2: robot({ ...LIGHT, hjul: 'h4' }), pansar2: 60,
    p1: [120, 150, 180], p2: [-60, 150, 0],
    s1: sched(['', 4], ['U', 130], ['UL', 20], ['', 10]), s2: sched(['', 4], ['U', 120], ['UR', 30], ['', 10]),
  },
  // Glancing blows at an angle while both turn.
  glancing: {
    r1: robot({ ...LIGHT, hjul: 'h3' }), pansar1: 60, r2: robot({ ...LIGHT, hjul: 'h4' }), pansar2: 60,
    p1: [400, 350, 200], p2: [-400, 0, 20],
    s1: sched(['', 4], ['U', 40], ['UR', 30], ['U', 40], ['', 20]), s2: sched(['', 4], ['U', 30], ['UL', 40], ['U', 30], ['', 30]),
  },
  // Robot 2's spike (v7, passive, front) rammed into robot 1: the bump and the spike's
  // damage. (Robot 1's weapons run first each tick and share the hit timer, and robot 2's
  // armour isn't counted in Training, so robot 2 attacks where the damage is checked.)
  spike: {
    r1: robot({ ...LIGHT, vapen: ['v6'], pos: ['b'] }), pansar1: 60,
    r2: robot({ ...HEAVY, vapen: ['v7'], pos: ['f'] }), pansar2: 120,
    p1: [450, 150, 180], p2: [-450, 150, 0],
    s1: sched(['', 30], ['', 50], ['U', 30], ['', 30]), s2: sched(['', 4], ['U', 40], ['D', 20], ['U', 40], ['', 30]),
  },
  // The drill (robot 1) and the saw (robot 2) spun up and driven into each other.
  drill_saw: {
    r1: robot({ ...LIGHT, vapen: ['v10'], pos: ['f'] }), pansar1: 60,
    r2: robot({ ...HEAVY, vapen: ['v11'], pos: ['f'] }), pansar2: 120,
    p1: [450, 150, 180], p2: [-450, 150, 0],
    s1: sched(['', 12], ['UZ', 60], ['Z', 30], ['', 30]), s2: sched(['', 12], ['UZ', 40], ['Z', 40], ['UZ', 20], ['', 20]),
  },
  // Robot 2's spiked roller (v12), spun up, into robot 1's side.
  roller: {
    r1: robot({ ...HEAVY }), pansar1: 120,
    r2: robot({ ...LIGHT, vapen: ['v12'], pos: ['f'] }), pansar2: 60,
    p1: [0, 0, 0], p2: [0, 350, 270],
    s1: sched(['', 124]), s2: sched(['', 12], ['Z', 20], ['UZ', 50], ['Z', 20], ['', 22]),
  },
  // Spears (v24) both ways, a grenade (v4), rockets (v16) and homing rockets (v17): the
  // shooter's recoil (rekyl), spear hits on robot 1 (damage), and the grenade's and rockets'
  // blast on the shooter itself when close. Back to back: with the port mirroring weapon
  // models as dirplayer does (?s3d=dirplayer) the spears fly out of the back. The blasts'
  // hits on the other robot only happen in a match (gGamePlace), not traceable here
  // (dirplayer's Multiuser Xtra throws without a connection, cutting the handler short).
  shots: {
    r1: robot({ ...LIGHT, vapen: ['v24', 'v4', 'v16'], pos: ['f', 't', 'b'] }), pansar1: 60,
    r2: robot({ ...HEAVY, vapen: ['v17', 'v24'], pos: ['t', 'f'] }), pansar2: 120,
    p1: [200, 150, 0], p2: [-200, 150, 180],
    s1: sched(['', 12], ['Z', 2], ['', 20], ['X', 2], ['', 40], ['L', 18], ['C', 2], ['', 40]),
    s2: sched(['', 14], ['X', 2], ['', 30], ['X', 2], ['', 30], ['Z', 2], ['', 54]),
  },
  // Robot 2's hammer (v8) on robot 1, robot 1's minigun (v35) on robot 2, and the EMP
  // (v36) going off (stunning the other robot only happens in a match: gGamePlace).
  hammer_gun_emp: {
    r1: robot({ ...HEAVY, vapen: ['v8', 'v35', 'v36'], pos: ['f', 't', 'b'] }), pansar1: 120,
    r2: robot({ ...LIGHT, vapen: ['v8'], pos: ['f'] }), pansar2: 60,
    p1: [200, 150, 180], p2: [-150, 150, 0],
    s1: sched(['', 12], ['U', 8], ['Z', 2], ['', 20], ['X', 30], ['', 10], ['C', 2], ['', 60]),
    s2: sched(['', 14], ['U', 6], ['Z', 2], ['', 30], ['Z', 2], ['', 40], ['UZ', 6], ['', 40]),
  },
  // The claw (v9) closing and opening against the other robot (catching it only happens
  // in a match: gGamePlace).
  claw: {
    r1: robot({ ...HEAVY, vapen: ['v9'], pos: ['f'] }), pansar1: 120,
    r2: robot({ ...LIGHT }), pansar2: 60,
    p1: [250, 150, 180], p2: [-150, 150, 0],
    s1: sched(['', 12], ['U', 12], ['Z', 30], ['RZ', 20], ['Z', 10], ['', 30]), s2: sched(['', 30], ['U', 30], ['D', 20], ['', 26]),
  },
  // Robot 1 drops a mine, nails, glue and oil (v1, v13, v14, v15 at the back) as it drives
  // off; robot 2 drives over them.
  droppers: {
    r1: robot({ ...LIGHT, vapen: ['v1', 'v13', 'v14'], pos: ['b', 'b', 'b'] }), pansar1: 60,
    r2: robot({ ...HEAVY, vapen: ['v15'], pos: ['b'] }), pansar2: 120,
    p1: [-100, 150, 0], p2: [-600, 150, 0],
    s1: sched(['', 12], ['UZ', 2], ['U', 8], ['UX', 2], ['U', 8], ['UC', 2], ['U', 30], ['', 84]),
    s2: sched(['', 30], ['U', 40], ['', 10], ['L', 8], ['Z', 2], ['', 50]),
  },
  // The flame thrower (v2), the laser (v3) and razor discs (v26) at the other robot.
  flame_laser_disc: {
    r1: robot({ ...HEAVY, vapen: ['v2', 'v3', 'v26'], pos: ['f', 't', 'b'] }), pansar1: 120,
    r2: robot({ ...LIGHT, vapen: ['v2'], pos: ['f'] }), pansar2: 60,
    p1: [250, 150, 180], p2: [-250, 150, 0],
    s1: sched(['', 12], ['Z', 2], ['', 20], ['X', 2], ['', 30], ['R', 16], ['C', 2], ['', 50]),
    s2: sched(['', 14], ['Z', 2], ['', 30], ['Z', 2], ['', 82]),
  },
};

const PROPS = ['state', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'angle', 'dangle', 'counter', 'speed', 'pHit', 'radie', 'gnista'];
const ROBOT_PROPS = ['x', 'y', 'z', 'angle', 'anglex', 'anglez', 'speed', 'dx', 'dy', 'dz', 'torque', 'dangle', 'state', 'krockNum', 'slip', 'hoppmove', 'keymap', 'damageStatus'];
const WEAPON_SPRITES = [11, 12, 13, 14, 21, 22, 23, 24];
const POOL = Array.from({ length: 31 }, (_, i) => 100 + i);
const CHANNELS = Array.from({ length: 300 }, (_, i) => i + 1);
const COUNTS = `string([${CHANNELS.map((n) => `sprite(${n}).scriptInstanceList.count`).join(', ')}])`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

/** The Lingo that reads one robot: its behavior's properties, its map sprite and its 3D model. */
const robotExpr = (n) =>
  `string([${ROBOT_PROPS.map((k) => `sprite(${n}).${k}`).join(', ')}, sprite(${n}).locH, sprite(${n}).locV, sprite(${n}).rotation, sprite(${n}).member.name, sprite(${n}).pRobot.parent.worldPosition, sprite(${n}).pRobot.transform.rotation, sprite(${n}).pRobot.parent.transform.rotation])`;

// ------------------------------------------------------------------ the original

async function original(browser, sc) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const lingo = (code) =>
    page
      .evaluate(async (c) => {
        const r = JSON.parse(String(await window.__vm.mcp_eval_lingo(c)));
        return r.success ? String(r.result_value) : 'ERR ' + r.error;
      }, code)
      .then((v) => v.replace(/^"(.*)"$/s, '$1'));
  await page.goto(`http://127.0.0.1:${SERVER}/`);
  await sleep(2000);
  const canvas = page.locator('canvas').first();
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(15000);
  box = await canvas.boundingBox();
  const click = async (x, y) => {
    await page.mouse.move(box.x + (x * box.width) / 800, box.y + (y * box.height) / 600);
    await sleep(100);
    await page.mouse.down();
    await sleep(120);
    await page.mouse.up();
    await sleep(300);
  };
  const type = (t) => page.keyboard.type(t, { delay: 30 });
  await click(480, 222);
  await type('tester@home.lan');
  await click(400, 260);
  await type('rage2005');
  await click(475, 309);
  await sleep(6000);
  await click(395, 235);
  await sleep(1500);
  await click(480, 375);
  await sleep(15000);
  if (VERBOSE) console.log('original: entering Training');
  await click(731, 501);
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if ((await lingo('string(sprite(10).state)')) === 'move') break;
  }
  await page.evaluate(() => window.__vm.stop());
  await sleep(300);
  const q = (s) => `value("${s.replace(/"/g, '" & QUOTE & "')}")`;
  const chassis = (rd) => rd.match(/#ram: \[#r(\d)\]/)[1];
  const setup = [
    `gUserData.propertyList.robotDescription = ${q(sc.r1)}`,
    `gUserData.propertyList.pansar = ${sc.pansar1}`,
    'sendSprite(1, #makedoktor)',
    `gopponentdata = [#robotid: 2, #robotname: "two", #score: 0, #propertyList: [#robotDescription: ${q(sc.r2)}, #pansar: ${sc.pansar2}]]`,
    // Both robots' channels empty, as Training starts (puppets left from the first build go).
    ...[10, 11, 12, 13, 14, 20, 21, 22, 23, 24].flatMap((n) => [`sprite(${n}).scriptInstanceList = []`, ...(n === 10 ? [] : [`sprite(${n}).loc = point(0, 0)`, `sprite(${n}).rotation = 0`, `sprite(${n}).member = member(0, 0)`, `puppetSprite(${n}, 0)`])]),
    ...[1, 2, 3].map((k) => `member("weapon${k} num").text = ""`),
    'world.resetWorld()',
    'sendSprite(0, #beginSprite)',
    // Robot 2 as BuildRobots builds the opponent for player 1.
    `gRobot2 = BuildRobot("robot2", gopponentdata.propertyList.robotDescription, world, member("robot${chassis(sc.r2)}"))`,
    'gRobot2.scale(2.0)',
    'initWeapons(gRobot2, gopponentdata.propertyList.robotDescription, 2, 20)',
    'initWheels(gRobot2, gopponentdata.propertyList.robotDescription, 2, 20)',
    'puppetSprite(20, 1)',
    'sprite(20).member = member("rob2")',
    'sprite(20).ink = 8',
    // Fresh robot behaviors (their beginSprite: sp, grav, state, speed, bomb, gBatt, gShield).
    ...[10, 20].flatMap((n) => [
      `sprite(${n}).scriptInstanceList = [new(script "robot behavior")]`,
      ...[['sp', n], ['grav', 0.5], ['state', '#init'], ['speed', 0], ['bomb', 0]].map(([k, v]) => `sprite(${n}).scriptInstanceList[1].${k} = ${v}`),
    ]),
    'gBatt = 0',
    'gShield = 0',
    'sendSprite(10, #InitRobot)',
    'sendSprite(20, #InitRobot)',
    ...[[10, sc.p1], [20, sc.p2]].flatMap(([n, [x, y, a]]) => [
      `sprite(${n}).x = ${x}`, `sprite(${n}).y = ${y}`, `sprite(${n}).angle = ${a}`,
      `sprite(${n}).loc = VectorToPoint(vector(${x}, 0, ${y}))`, `sprite(${n}).rotation = ${a}`,
    ]),
  ];
  for (const c of setup) {
    if (VERBOSE) console.log('original:', c.slice(0, 100));
    const r = await lingo(c);
    if (r.startsWith('ERR')) throw new Error(`${c}: ${r}`);
  }
  const env = {
    // The clock when the weapons were built (their reload timers start there).
    setupMs: Number(await lingo('string(the milliSeconds)')),
    userData: await lingo('string(gUserData)'),
    opponentData: await lingo('string(gopponentdata)'),
    partDescription: await lingo('string(gPartDescription)'),
    gamePlace: await lingo('string([gGamePlace])'),
    playerNumber: await lingo('string([gPlayerNumber])'),
  };
  if (!env.userData.includes(sc.r1.match(/#vapen: \[[^\]]*\]/)[0])) throw new Error(`robot 1 didn't take: ${env.userData}`);
  const robots0 = [await lingo(robotExpr(10)), await lingo(robotExpr(20))];
  const ticks = [];
  const last = ['00000000', '00000000'];
  const n = Number(opt('ticks', Math.max(sc.s1.length, sc.s2.length)));
  // dirplayer's clock is the page's `new Date()`: pinned per tick to a 20 fps timeline,
  // creeping 1 ms every 100000 reads (a stopped clock hangs its VM's waits).
  const t0 = await page.evaluate(() => (window.__RealDate ??= Date).now());
  const pin = (t) =>
    page.evaluate((t) => {
      const R = window.__RealDate;
      if (t === null) {
        window.Date = R;
        return;
      }
      let n = 0;
      window.Date = class extends R {
        constructor(...a) {
          if (a.length) super(...a);
          else super(t + Math.floor(n++ / 100000));
        }
      };
    }, t);
  for (let i = 0; i < n; i++) {
    const maps = [sc.s1[i] ?? '00000000', sc.s2[i] ?? '00000000'];
    if (VERBOSE) process.stdout.write(`\roriginal tick ${i}   `);
    await pin(t0 + 50 * (i + 1));
    for (const r of [0, 1]) {
      if (maps[r] !== last[r]) {
        await lingo(`sendSprite(${r ? 20 : 10}, #keyPressed, "${maps[r]}", -100000)`);
        last[r] = maps[r];
      }
    }
    const ms = Number(await lingo('string(the milliSeconds)'));
    const errors = [];
    // prepareFrame to each sprite with behaviors, in channel order (the ones there when the
    // tick starts), then the frame script's part. Not sendAllSprites: dirplayer's sends
    // to the frame script too, before the sprites, where Director's goes to sprites only.
    const counts = (await lingo(COUNTS)).replace(/[[\]]/g, '').split(',').map(Number);
    const receivers = CHANNELS.filter((_, k) => counts[k] > 0);
    for (const c of [...receivers.map((ch) => `call(#prepareFrame, sprite(${ch}).scriptInstanceList)`), 'sendSprite(0, #checkCollision)', 'sendSprite(0, #RecycleSprites)']) {
      const r = await lingo(c);
      if (r.startsWith('ERR')) errors.push(`${c}: ${r}`);
    }
    const ms2 = Number(await lingo('string(the milliSeconds)'));
    ticks.push({ maps, ms, ms2, robots: [await lingo(robotExpr(10)), await lingo(robotExpr(20))], probes: await readOriginal(lingo), errors });
    await pin(null);
  }
  if (VERBOSE) process.stdout.write('\n');
  await page.close();
  return { env, robots0, ticks };
}

async function readOriginal(lingo) {
  const out = {};
  const sprites = [...WEAPON_SPRITES, ...POOL];
  const counts = (await lingo(`string([${sprites.map((n) => `sprite(${n}).scriptInstanceList.count`).join(', ')}])`))
    .replace(/[[\]]/g, '')
    .split(',')
    .map(Number);
  for (const [i, n] of sprites.entries()) {
    if (!counts[i]) continue;
    const inst = `sprite(${n}).scriptInstanceList[1]`;
    out[`sprite ${n}`] = await lingo(`string([sprite(${n}).locH, sprite(${n}).locV, sprite(${n}).rotation, sprite(${n}).member.name, ${PROPS.map((p) => `getaProp(${inst}, #${p})`).join(', ')}])`);
    out[`script ${n}`] = (await lingo(`string(${inst})`)).replace(/^<offspring (.*?) \d+ _>$/, '$1').replace(/[\s"]/g, '').toLowerCase();
  }
  out.globals = await lingo('string([gShield, gBatt, gLastHitTime])');
  return out;
}

// ------------------------------------------------------------------ the port

async function ported(browser, sc, orig) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  // The port's weapon enhancements off (?quirks=flame) and mirrored transforms split as
  // dirplayer does (?s3d=dirplayer, docs/port-issues.md #71), as in weapon-trace.
  await page.goto(`${APP}/game.html?movie=arena104&frame=backyard&quirks=flame&s3d=dirplayer`);
  await page.waitForFunction(() => window.__player?.movie?.name === 'arena104' && typeof window.__player.frameScript?.checkCollision === 'function', null, { timeout: 60000 });
  await sleep(1500);
  // (the arena's own start, without a logged-in robot, fails before the harness takes over)
  await sleep(500);
  logs.length = 0;
  const result = await page.evaluate(
    async ({ sc, orig, PROPS, ROBOT_PROPS, WEAPON_SPRITES, POOL, adobe }) => {
      const urlOf = (path) => {
        const e = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => new URL(u).pathname === path);
        return e[e.length - 1] ?? path;
      };
      const D = await import(urlOf('/src/director/index.ts'));
      const S3 = await import(urlOf('/src/director/s3d/index.ts'));
      const L = await import(urlOf('/src/lingo/index.ts'));
      const A3 = await import(urlOf('/src/movies/arena104/s006-arena-3d.ts'));
      const RW3 = await import(urlOf('/src/movies/robotwars/s006-3d-scripts.ts'));
      const p = window.__player;
      if (D.player !== p) throw new Error("not the app's director module");
      const G = D.G;
      const sym = L.sym;
      const val = (s) => L.value(s);

      // dirplayer truncates sprite positions where Adobe rounds, and its sqrt of an
      // integer is a float where Adobe's is the rounded integer (the bump's push apart):
      // like for like, or with --adobe the port's own rules.
      D.Sprite.truncate = !adobe;
      L.lingoCompat.floatSqrt = !adobe;
      // Freeze the score and pin the clock.
      p.stepFrame = () => {};
      let now = orig.env.setupMs ?? orig.ticks[0]?.ms ?? 0;
      Object.defineProperty(p, 'milliSeconds', { get: () => now, configurable: true });

      const MAC = { 'å': 'Œ', 'ä': 'Š', 'ö': 'š', 'Å': '\x81', 'Ä': '€', 'Ö': '…', 'é': 'Ž', 'ü': 'Ÿ' };
      G.gPartDescription = val(orig.env.partDescription.replace(/[åäöÅÄÖéü]/g, (c) => MAC[c]));
      G.gUserData = val(orig.env.userData);
      // Made official, as on the original's side (the frame script's beginSprite restores mrdoktor's copy).
      D.sendSprite(1, 'makedoktor');
      G.gopponentdata = val(orig.env.opponentData);
      G.gGamePlace = val(orig.env.gamePlace).getAt(1);
      G.gPlayerNumber = val(orig.env.playerNumber).getAt(1);

      const fs = p.frameScript;
      for (const n of [10, 11, 12, 13, 14, 20, 21, 22, 23, 24]) {
        const s = p.sprite(n);
        s.scriptInstanceList = [];
        if (n === 10) continue;
        s.locH = s.locV = 0;
        s.rotation = 0;
        s.member = null;
        s.puppet = false;
      }
      for (const k of [1, 2, 3]) D.member(`weapon${k} num`).text = '';
      G.world.resetWorld();
      fs.beginSprite();
      const rd2 = G.gopponentdata.getaProp(sym('propertyList')).getaProp(sym('robotDescription'));
      G.gRobot2 = RW3.BuildRobot('robot2', rd2, G.world, undefined);
      G.gRobot2.scale(2.0);
      A3.initWeapons(G.gRobot2, rd2, 2, 20);
      A3.initWheels(G.gRobot2, rd2, 2, 20);
      const s20 = p.sprite(20);
      s20.puppet = true;
      s20.member = D.member('rob2');
      s20.ink = 8;
      const Robot = D.script('robot behavior');
      const robots = [10, 20].map((n) => {
        const r = new Robot();
        Object.assign(r, { spriteNum: n, sp: n, grav: 0.5, state: sym('init'), speed: 0, bomb: 0 });
        p.sprite(n).puppet = true;
        p.sprite(n).scriptInstanceList = [r];
        return r;
      });
      G.gBatt = 0;
      G.gShield = 0;
      robots.forEach((r) => r.InitRobot());
      for (const [r, [x, y, a]] of [[robots[0], sc.p1], [robots[1], sc.p2]]) {
        Object.assign(r, { x, y, angle: a });
        const s = p.sprite(r.sp);
        s.loc = A3.VectorToPoint(S3.vector(x, 0, y));
        s.rotation = a;
      }

      const S = (v) => L.lingoString(v);
      const readRobot = (r) => {
        const s = p.sprite(r.sp);
        const vals = ROBOT_PROPS.map((k) => r[k]);
        return S(new L.LList([...vals, s.locH, s.locV, L.lf(s.rotation), s.member ? s.member.name : '', r.pRobot.parent.worldPosition, r.pRobot.transform.rotation, r.pRobot.parent.transform.rotation]));
      };
      const read = () => {
        const out = {};
        for (const n of [...WEAPON_SPRITES, ...POOL]) {
          const s = p.sprite(n);
          if (!s.scriptInstanceList.length) continue;
          const inst = s.scriptInstanceList[0];
          const prop = (k) => D.getScriptProp(inst, k).value;
          out[`sprite ${n}`] = S(new L.LList([s.locH, s.locV, L.lf(s.rotation), s.member ? s.member.name : '', ...PROPS.map(prop)]));
          out[`script ${n}`] = inst.constructor.name.toLowerCase();
        }
        out.globals = S(new L.LList([G.gShield, G.gBatt, G.gLastHitTime]));
        return out;
      };

      const robots0 = robots.map(readRobot);
      const ticks = [];
      const last = ['00000000', '00000000'];
      for (const t of orig.ticks) {
        now = t.ms;
        const errors = [];
        const guard = (f) => {
          try {
            f();
          } catch (e) {
            errors.push(String(e?.stack ?? e).slice(0, 300));
          }
        };
        for (const r of [0, 1]) {
          if (t.maps[r] !== last[r]) {
            guard(() => robots[r].keyPressed(t.maps[r], -100000));
            last[r] = t.maps[r];
          }
        }
        // sendAllSprites(#prepareFrame) as dirplayer runs it: the receivers are the
        // behaviors on the stage when it starts (a shot created this tick moves next tick).
        const receivers = p.sprites.filter((s) => s.spriteNum > 0 && s.scriptInstanceList.length).map((s) => [s.spriteNum, [...s.scriptInstanceList]]);
        guard(() => {
          for (const [ch, list] of receivers) p.sendToInstances(ch, list, 'prepareFrame', []);
        });
        guard(() => fs.checkCollision());
        guard(() => fs.RecycleSprites());
          ticks.push({ maps: t.maps, robots: robots.map(readRobot), probes: read(), errors });
      }
      return { robots0, ticks };
    },
    { sc, orig, PROPS, ROBOT_PROPS, WEAPON_SPRITES, POOL, adobe: ADOBE },
  );
  await page.close();
  return { ...result, logs };
}

// ------------------------------------------------------------------ comparing

const NUM = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g;
/** dirplayer and Adobe (whom the Lingo library follows) print a few things differently. */
const norm = (s) =>
  s === undefined
    ? s
    : s
        .replace(/<Void>/g, 'Void')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/-(0\.0+)(?!\d)/g, '$1')
        .replace(/-180\.0000/g, '180.0000');
let intFloat = 0;
function same(a, b) {
  a = norm(a);
  b = norm(b);
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const ta = a.split(NUM);
  const tb = b.split(NUM);
  if (ta.length !== tb.length || ta.some((t, i) => t !== tb[i])) return false;
  const na = a.match(NUM) ?? [];
  const nb = b.match(NUM) ?? [];
  return na.every((x, i) => {
    const y = nb[i];
    if (x.includes('.') !== y.includes('.')) intFloat++;
    return Math.abs(Number(x) - Number(y)) <= 1e-3 + 1e-6 * Math.abs(Number(x));
  });
}

/** Splits a robot reading into named fields (the top-level items of the Lingo list). */
function fields(s) {
  const body = norm(s).replace(/^\[|\]$/g, '');
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '[' || c === '(') depth++;
    if (c === ']' || c === ')') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const ROBOT_FIELDS = [...ROBOT_PROPS, 'locH', 'locV', 'rotation', 'member', 'position', 'tilt', 'turn'];

function compare(name, orig, port) {
  const firstBad = new Map();
  let bad = 0;
  const note = (cat, tick, o, p) => {
    bad++;
    if (!firstBad.has(cat)) firstBad.set(cat, { tick, o, p });
  };
  orig.ticks.forEach((t, i) => {
    const P = port.ticks[i];
    for (const r of [0, 1]) {
      const fo = fields(t.robots[r]);
      const fp = fields(P.robots[r]);
      ROBOT_FIELDS.forEach((f, k) => {
        let [a, b] = [fo[k], fp[k]];
        // A sprite rotation of 360 reads 0 in dirplayer.
        if (f === 'rotation') [a, b] = [a, b].map((v) => v?.replace(/^360\.0000$/, '0.0000'));
        if (!same(a, b)) note(`robot ${r + 1} ${f}`, i, a, b);
      });
    }
    const keys = new Set([...Object.keys(t.probes), ...Object.keys(P.probes)]);
    for (const k of keys) {
      let [a, b] = [t.probes[k], P.probes[k]];
      if (k.startsWith('sprite') && a && b) [a, b] = [a, b].map((v) => v.replace(/^(\[[^,]+, [^,]+, )360\.0000/, '$10.0000'));
      // dirplayer resets the rotation of a sprite that had no member when it's given one
      // (a weapon's first tick); Adobe's player and the port keep it.
      const prev = i ? orig.ticks[i - 1].probes[k] : undefined;
      if (k.startsWith('sprite') && a && b && (!prev || /^\[[^,]+, [^,]+, [^,]+, ""/.test(prev)) && /^\[[^,]+, [^,]+, 0\.0000, /.test(a)) b = b.replace(/^(\[[^,]+, [^,]+, )[^,]+/, '$10.0000');
      // Sprite locs are truncated floats: values agreeing to 1e-3 can land a pixel apart.
      if (k.startsWith('sprite') && a && b) {
        const la = a.match(/^\[(-?\d+), (-?\d+), /);
        const lb = b.match(/^\[(-?\d+), (-?\d+), /);
        if (la && lb && Math.abs(la[1] - lb[1]) <= 1 && Math.abs(la[2] - lb[2]) <= 1) b = b.replace(/^\[(-?\d+), (-?\d+), /, `[${la[1]}, ${la[2]}, `);
      }
      if (!same(a, b)) note(k.replace(/\d+$/, 'N'), i, a, b);
    }
    if (VERBOSE && (t.errors.length || P.errors.length)) console.log(`  tick ${i}: original errors ${JSON.stringify(t.errors)} port errors ${JSON.stringify(P.errors)}`);
  });
  const timing = orig.ticks.filter((t) => t.ms2 !== t.ms).length;
  if (timing) console.log(`  warning: dirplayer's clock moved during ${timing} ticks (the pin didn't hold)`);
  if (intFloat) console.log(`  note: ${intFloat} integral float/integer differences in matching values`);
  intFloat = 0;
  const bumps = orig.ticks.filter((t, i) => Number(fields(t.robots[0])[13]) > Number(fields(i ? orig.ticks[i - 1].robots[0] : orig.robots0[0])[13])).length;
  if (!firstBad.size) {
    console.log(`${name}: match, ${orig.ticks.length} ticks (${bumps} bump ticks)`);
    return true;
  }
  console.log(`${name}: ${firstBad.size} kinds of mismatch (${bad} values; ${bumps} bump ticks)`);
  for (const [cat, b] of [...firstBad].sort((x, y) => x[1].tick - y[1].tick)) {
    const t = orig.ticks[b.tick];
    console.log(`  ${cat}: first at tick ${b.tick} (keys ${t.maps.join(' ')})\n    original ${b.o}\n    port     ${b.p}`);
  }
  return false;
}

/** The original's robots, tick by tick: what a player feels. */
function print(name, orig) {
  console.log(`\n${name}: tick  keys1 keys2 | robot 1 x y angle speed dx dy torque bumps state | robot 2 ...`);
  const f4 = (v) => Number(v).toFixed(2).padStart(8);
  orig.ticks.forEach((t, i) => {
    const r = t.robots.map(fields);
    const row = r.map((f) => `${f4(f[0])}${f4(f[1])}${f4(f[3])}${f4(f[6])}${f4(f[7])}${f4(f[8])}${f4(f[10])}${String(f[13]).padStart(4)} ${f[12].padEnd(8)}`);
    console.log(`${String(i).padStart(4)} ${t.maps[0]} ${t.maps[1]} |${row[0]} |${row[1]}`);
  });
}

const wanted = args.filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(SCENARIOS);
const browser = await launch();
let ok = true;
for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`no scenario ${name}`);
  const reuse = opt('reuse');
  const orig = reuse ? JSON.parse((await import('node:fs')).readFileSync(`${reuse}-${name}.json`, 'utf8')).orig : await original(browser, sc);
  if (PRINT) print(`${name} (original)`, orig);
  const dump = opt('dump');
  // (the original's trace first, so a port that fails can be rerun with --reuse)
  if (dump) (await import('node:fs')).writeFileSync(`${dump}-${name}.json`, JSON.stringify({ orig }, null, 1));
  const port = await ported(browser, sc, orig);
  if (ADOBE) {
    // Nothing to compare: dirplayer doesn't round.
    print(`${name} (the port, Adobe's rules)`, port);
    continue;
  }
  if (port.logs.length) console.log(`  port console errors:\n    ${[...new Set(port.logs)].slice(0, 10).join('\n    ')}`);
  const errs = (ticks) => [...new Set(ticks.flatMap((t, i) => t.errors.map((e) => `tick ${i}: ${e}`)))].slice(0, 5);
  if (errs(orig.ticks).length) console.log(`  original script errors:\n    ${errs(orig.ticks).join('\n    ')}`);
  if (errs(port.ticks).length) console.log(`  port script errors:\n    ${errs(port.ticks).join('\n    ')}`);
  if (dump) (await import('node:fs')).writeFileSync(`${dump}-${name}.json`, JSON.stringify({ orig, port }, null, 1));
  ok = compare(name, orig, port) && ok;
}
await browser.close();
process.exit(ok ? 0 : 1);
