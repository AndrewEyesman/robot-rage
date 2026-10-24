// Check the port's weapons against the game's own Lingo, tick by tick.
//
//   node port/tools/weapon-trace.mjs [scenario ...] [--server=8091] [--app=http://127.0.0.1:8092] [--ticks=N]
//        [--verbose] [--dump=/tmp/prefix] [--reuse=/tmp/prefix] [--eval-at=N --eval=js]
//
// Scenarios (see SCENARIOS below) give Training's robot a set of weapons and a key
// schedule. For each one:
//
// 1. dirplayer (the test server, never 8090) runs the original: log in as the test
//    account, enter Training, pause the movie, give the robot the scenario's parts (in
//    gUserData, made official with #makedoktor so mrdoktor doesn't restore the old
//    robot), rebuild the world and robot (world.resetWorld(), the frame script's
//    beginSprite) and then, per 20 fps tick: queue the keys, one
//    sendAllSprites(#prepareFrame) (robot, weapons, shots in channel order) and the frame
//    script's RecycleSprites. After each tick it reads the robot's state and the probes:
//    each weapon and shot sprite's loc, rotation, member, script and properties (state,
//    x, y, z, dx, dy...), its model's position, the scenario's weapon models, and the
//    ammo counters.
// 2. The port runs the translated weapons in its runtime on the arena movie, with the
//    same robot built from the same parts, `the milliSeconds` pinned on both sides to
//    the same 20 fps timeline (dirplayer reads the page's `new Date()`), and the robot replayed: a stand-in robot behavior on sprite 10
//    takes the original's state every tick (before its keys fire the weapons, as the
//    real one's keyEvent does, and after its move) and records the handlers the weapons
//    call on it (damage, spendEnergy, hopp, rekyl...). So any difference comes from the
//    weapons, not the driving.
// 3. The probes are compared tick by tick (numbers to 5e-4, so "3" against "3.0000" is
//    an integer/float difference), and the damage and energy the weapons take from the
//    robot are checked against the original robot's armour and battery.
//
// Weapons that use random() (the disc's bounce) can't match draw for draw: the Lingo
// library reproduces Adobe's generator and dirplayer has its own. Exits non-zero on a
// mismatch.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const SERVER = opt('server', '8091');
if (SERVER === '8090') throw new Error('never 8090 (the shared server)');
const APP = opt('app', 'http://127.0.0.1:8092');
const VERBOSE = args.includes('--verbose');

const run = (map, n) => Array(n).fill(map);
/** Fire weapon k (1-3) for `hold` ticks, then wait `wait` ticks; optionally while driving. */
const shot = (k, hold, wait, drive = '0') => {
  const on = ['0', '0', drive, '0', k === 1 ? '1' : '0', k === 2 ? '1' : '0', k === 3 ? '1' : '0', '0'].join('');
  const off = `00${drive}00000`;
  return [...run(on, hold), ...run(off, wait)];
};
const robot = (vapen, pos) =>
  `[#ram: [#r3], #torn: [#t3], #hjul: [#h2], #motor: [#ma1], #batteri: [#b3], #vapen: [${vapen.map((v) => '#' + v).join(', ')}], #wpnPos: [${pos.map((p) => '#' + p).join(', ')}], #special: [], #ammunition: []]`;
const std = [...run('00000000', 3), ...shot(1, 2, 45), ...shot(2, 2, 45), ...shot(3, 2, 45), ...shot(1, 2, 20, '1'), ...shot(2, 2, 20, '1'), ...shot(3, 20, 30)];

export const SCENARIOS = {
  grenade_mine_axe: { rd: robot(['v4', 'v1', 'v8'], ['t', 'b', 'f']), schedule: std, models: ['Granatkastare1', 'Slagpik1', 'Mina1'] },
  flame_nail_claw: { rd: robot(['v2', 'v13', 'v9'], ['t', 'b', 'f']), schedule: std, models: ['Eldkastare1', 'Klo11', 'Klo21'] },
  laser_glue_drill: { rd: robot(['v3', 'v14', 'v10'], ['t', 'b', 'f']), schedule: std, models: ['laserkanon1', 'laserray1', 'Skruv1'] },
  guided_oil_saw: { rd: robot(['v16', 'v15', 'v11'], ['t', 'b', 'f']), schedule: std, models: ['missilHN1', 'missilVU1', 'sågblad1'] },
  heat_pin_plow: { rd: robot(['v17', 'v12', 'v6'], ['t', 'f', 'b']), schedule: std, models: ['missilHN1', 'Taggar1'] },
  regen_kami_spear: { rd: robot(['v22', 'v24', 'v21'], ['t', 'b', 'f']), schedule: std, models: ['regen1', 'speargun1'] },
  field_flash_disc: { rd: robot(['v33', 'v25', 'v26'], ['t', 'f', 'b']), schedule: std, models: ['shield1', 'flash1', 'spinndisc1'] },
  cloak_mini_charges: { rd: robot(['v34', 'v31', 'v32'], ['t', 'f', 'b']), schedule: std, models: ['trans1', 'RCbombcar1', 'RCMine1'] },
  gun_emp_dagger: { rd: robot(['v35', 'v36', 'v7'], ['f', 'b', 'f']), schedule: std, models: ['Railgun1', 'EMP1'] },
};

const PROPS = ['state', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'angle', 'dangle', 'counter', 'speed', 'pHit', 'radie', 'gnista'];
const WEAPON_SPRITES = [12, 13, 14];
const POOL = Array.from({ length: 31 }, (_, i) => 100 + i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'],
  });
}

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
  await click(731, 501);
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if ((await lingo('string(sprite(10).state)')) === 'move') break;
  }
  await page.evaluate(() => window.__vm.stop());
  await sleep(300);
  const setup = [
    `gUserData.propertyList.robotDescription = value("${sc.rd.replace(/"/g, '" & QUOTE & "')}")`,
    'sendSprite(1, #makedoktor)',
    // The weapon channels as a fresh Training has them (puppets left from the first build go).
    ...[11, 12, 13, 14].flatMap((n) => [`sprite(${n}).scriptInstanceList = []`, `sprite(${n}).loc = point(0, 0)`, `sprite(${n}).rotation = 0`, `sprite(${n}).member = member(0, 0)`, `puppetSprite(${n}, 0)`]),
    'world.resetWorld()',
    'sendSprite(0, #beginSprite)',
    'sendSprite(10, #InitRobot)',
  ];
  for (const c of setup) {
    const r = await lingo(c);
    if (r.startsWith('ERR')) throw new Error(`${c}: ${r}`);
  }
  const rd = await lingo('string(gUserData.propertyList.robotDescription)');
  if (!rd.includes(sc.rd.match(/#vapen: \[[^\]]*\]/)[0])) throw new Error(`robot data didn't take: ${rd}`);
  const env = {
    rd,
    userData: await lingo('string(gUserData.propertyList)'),
    partDescription: await lingo('string(gPartDescription)'),
    gamePlace: await lingo('string([gGamePlace])'),
    playerNumber: await lingo('string([gPlayerNumber])'),
    battkonst: Number(await lingo('string(sprite(10).battkonst)')),
    motorkonst: Number(await lingo('string(sprite(10).motorkonst)')),
  };
  const robotExpr =
    'string([sprite(10).x, sprite(10).y, sprite(10).z, sprite(10).angle, sprite(10).anglex, sprite(10).anglez, sprite(10).speed, sprite(10).dx, sprite(10).dy, sprite(10).fart, sprite(10).state, sprite(10).locH, sprite(10).locV, sprite(10).rotation, sprite(10).damageStatus, sprite(10).member.name])';
  const ticks = [];
  const robot0 = await lingo(robotExpr);
  let last = '00000000';
  const n = Number(opt('ticks', sc.schedule.length));
  // dirplayer's clock (`the milliSeconds`) is the page's `new Date()` (chrono through
  // wasm-bindgen): pin it for each tick to a 20 fps timeline, so the original sees exactly
  // the times the port is given, however long the tick takes to evaluate.
  const t0 = await page.evaluate(() => (window.__RealDate ??= Date).now());
  const pin = (t) =>
    page.evaluate((t) => {
      const R = window.__RealDate;
      if (t === null) {
        window.Date = R;
        return;
      }
      window.Date = class extends R {
        constructor(...a) {
          if (a.length) super(...a);
          else super(t);
        }
      };
      // Date.now() stays real: the page's event loop busy-waits on it.
    }, t);
  for (let i = 0; i < n; i++) {
    const map = sc.schedule[i] ?? '00000000';
    if (VERBOSE) process.stdout.write(`\roriginal tick ${i}   `);
    await pin(t0 + 50 * (i + 1));
    if (map !== last) {
      await lingo(`sendSprite(10, #keyPressed, "${map}", -100000)`);
      last = map;
    }
    const ms = Number(await lingo('string(the milliSeconds)'));
    const err1 = await lingo('sendAllSprites(#prepareFrame)');
    const err2 = await lingo('sendSprite(0, #RecycleSprites)');
    const ms2 = Number(await lingo('string(the milliSeconds)'));
    ticks.push({ map, ms, ms2, robot: await lingo(robotExpr), probes: await readOriginal(lingo, sc), errors: [err1, err2].filter((e) => e.startsWith('ERR')) });
    await pin(null);
  }
  await page.close();
  return { env, robot0, ticks };
}

async function readOriginal(lingo, sc) {
  const out = {};
  const counts = (await lingo(`string([${[...WEAPON_SPRITES, ...POOL].map((n) => `sprite(${n}).scriptInstanceList.count`).join(', ')}])`))
    .replace(/[[\]]/g, '')
    .split(',')
    .map(Number);
  [...WEAPON_SPRITES, ...POOL].forEach((n, i) => {
    if (!counts[i]) return;
    out[`sprite ${n}`] = null;
  });
  for (const key of Object.keys(out)) {
    const n = Number(key.split(' ')[1]);
    const inst = `sprite(${n}).scriptInstanceList[1]`;
    out[key] = await lingo(`string([sprite(${n}).locH, sprite(${n}).locV, sprite(${n}).rotation, sprite(${n}).member.name, ${PROPS.map((p) => `getaProp(${inst}, #${p})`).join(', ')}])`);
    out[`script ${n}`] = (await lingo(`string(${inst})`)).replace(/^<offspring (.*?) \d+ _>$/, '$1').replace(/[\s"]/g, '').toLowerCase();
    for (const p of ['m', 'pm']) {
      const v = await lingo(`string([getaProp(${inst}, #${p}).name, getaProp(${inst}, #${p}).worldPosition, getaProp(${inst}, #${p}).visibility])`);
      out[`${p} of ${n}`] = v.startsWith('ERR') ? '-' : v;
    }
  }
  for (const name of sc.models) {
    const v = await lingo(`string([world.model("${name}").worldPosition, world.model("${name}").transform.rotation, world.model("${name}").visibility, world.model("${name}").transform.scale])`);
    out[`model ${name}`] = v.startsWith('ERR') ? '-' : v;
  }
  out.ammo = await lingo('string([member("weapon1 num").text, member("weapon2 num").text, member("weapon3 num").text])');
  out.globals = await lingo('string([gShield, gBatt])');
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
  await page.goto(`${APP}/game.html?movie=arena104&frame=backyard`);
  await page.waitForFunction(() => window.__player?.movie?.name === 'arena104', null, { timeout: 60000 });
  await sleep(1500);
  const result = await page.evaluate(
    async ({ sc, orig, PROPS, WEAPON_SPRITES, POOL, evalAt }) => {
      // The app's own module instances (the URLs it loaded, with any ?t= HMR stamp).
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
      if (D.player !== p) throw new Error('not the app\'s director module');
      const G = D.G;
      const sym = L.sym;
      const val = (s) => L.value(s);

      // dirplayer truncates sprite positions where Adobe rounds; compare like for like.
      D.Sprite.truncate = true;
      // Freeze the score and pin the clock.
      p.stepFrame = () => {};
      let now = orig.ticks[0]?.ms ?? 0;
      Object.defineProperty(p, 'milliSeconds', { get: () => now, configurable: true });

      // The original's globals for Training.
      const ud = val(orig.env.userData);
      G.gUserData = { propertyList: ud, robotid: undefined, robotname: undefined, score: 0 };
      G.gPartDescription = val(orig.env.partDescription);
      G.gGamePlace = val(orig.env.gamePlace).getAt(1);
      G.gPlayerNumber = val(orig.env.playerNumber).getAt(1);
      G.gLastHitTime = now;
      G.gShield = 0;
      G.gBatt = 0;

      // The world and robot as the backyard frame script's beginSprite builds them.
      const world = S3.member3d('arena');
      world.resetWorld();
      A3.BuildWorld();
      G.gPlog = new L.LList([]);
      const rd = ud.getaProp(sym('robotDescription'));
      const ram = L.lingoString(rd.getaProp(sym('ram')).getAt(1)).replace('#', '');
      const srcRobot = S3.member3d('robot' + ram.slice(1));
      G.gRobot1 = RW3.BuildRobot('robot1', rd, G.world, srcRobot);
      G.gRobot1.scale(2.0);
      for (let n = 11; n <= 14; n++) p.sprite(n).scriptInstanceList = [];

      // The stand-in robot: the original's state, tick by tick.
      const calls = [];
      class ReplayRobot {
        constructor() {
          this.sp = 10;
          this.sp2 = 20;
          this.robotNumber = 1;
          this.pRobot = G.gRobot1;
          this.robotRD = rd;
          this.damageStatus = L.propList(sym('energy'), L.lf(100), sym('pansar'), ud.getaProp(sym('pansar')));
          this.keymap = '00000000';
          this.vikt = 0;
        }
        take(s) {
          const l = val(s);
          const k = ['x', 'y', 'z', 'angle', 'anglex', 'anglez', 'speed', 'dx', 'dy', 'fart', 'state'];
          k.forEach((name, i) => (this[name] = l.getAt(i + 1)));
          const spr = p.sprite(10);
          spr.locH = L.num(l.getAt(12));
          spr.locV = L.num(l.getAt(13));
          spr.rotation = L.num(l.getAt(14));
          const ds = l.getAt(15);
          this.damageStatus.setaProp(sym('energy'), ds.getaProp(sym('energy')));
          this.damageStatus.setaProp(sym('pansar'), ds.getaProp(sym('pansar')));
          spr.member = D.member(l.getAt(16));
          // UpdateRobot
          const num = L.num;
          this.pRobot.parent.worldPosition = S3.vector(num(this.x) * 5, num(this.z), num(this.y) * 5);
          this.pRobot.transform.rotation = S3.vector(num(this.anglex), 0, num(this.anglez));
          this.pRobot.parent.transform.rotation = S3.vector(0, -num(this.angle) + 90, 0);
        }
        // keyEvent, as the robot behavior runs it from CheckKeyQueue (sprite 211, the
        // chat line, is #hidden in Training).
        keyEvent(map) {
          const lastKeymap = this.keymap;
          this.keymap = map;
          if (this.state !== sym('stunned')) {
            for (const [c, off] of [[4, 2], [5, 3], [6, 4]]) {
              if (map[c] !== lastKeymap[c]) {
                D.sendSprite(this.sp + off, 'fire', map[c] === '1' ? 1 : 0);
                D.sendAllSprites('lightup', this.robotNumber);
              }
            }
          }
        }
        prepareFrame() {
          const t = this.tick;
          this.take(t.pre);
          if (t.map !== this.keymap) this.keyEvent(t.map);
          this.take(t.post);
        }
      }
      for (const h of ['damage', 'spendEnergy', 'hopp', 'rekyl', 'hit', 'fasten', 'makeslow', 'makenormal', 'release', 'slippery', 'startmini', 'stopmini', 'emp', 'noemp', 'tip', 'MakeLoser', 'breakdown']) {
        ReplayRobot.prototype[h] = function (...a) {
          calls.push([h, ...a.map((x) => L.lingoString(x))]);
        };
      }
      const robot = new ReplayRobot();
      robot.take(orig.robot0);
      p.sprite(10).puppet = true;
      p.sprite(10).scriptInstanceList = [robot];

      // The backyard frame script's shot sprites (createSprite, removeSprite, RecycleSprites, createSparkle).
      const frame = {
        freeSpriteList: new L.LList(POOL.slice()),
        removeSpriteList: new L.LList([]),
        removeSprite(sp) {
          this.removeSpriteList.add(sp);
        },
        createSprite(name, V, a1, a2, a3) {
          if (this.freeSpriteList.count === 0) return;
          const sp = this.freeSpriteList.getAt(1);
          this.freeSpriteList.deleteAt(1);
          const s = p.sprite(sp);
          s.locV = -1000;
          s.puppet = true;
          s.member = D.member(name);
          s.ink = 8;
          s.blend = 100;
          s.loc = A3.VectorToPoint(V);
          s.locZ = 20;
          const Cls = D.script(name + ' behavior');
          s.scriptInstanceList = [new Cls(sp, name, V, a1, a2, a3)];
          s.foreColor = 255;
          s.backColor = 0;
        },
        RecycleSprites() {
          while (this.removeSpriteList.count > 0) {
            const n = this.removeSpriteList.getAt(1);
            const s = p.sprite(n);
            s.scriptInstanceList = [];
            s.member = null;
            D.puppetSprite(n, 0);
            this.removeSpriteList.deleteAt(1);
            this.freeSpriteList.add(n);
          }
        },
        createSparkle(V) {
          if (this.freeSpriteList.count === 0) return;
          const sp = this.freeSpriteList.getAt(1);
          this.freeSpriteList.deleteAt(1);
          const s = p.sprite(sp);
          s.puppet = true;
          s.member = D.member('sparkle texture');
          s.loc = A3.VectorToPoint(V);
          const Cls = D.script('sparkle behavior');
          s.scriptInstanceList = [new Cls(sp, V)];
        },
      };
      p.frameScript = frame;

      A3.initWeapons(G.gRobot1, rd, 1, 10);
      window.__wt = { D, S3, L, G, p, frame, robot };

      const S = (v) => L.lingoString(v);
      const read = () => {
        const out = {};
        for (const n of [...WEAPON_SPRITES, ...POOL]) {
          const s = p.sprite(n);
          if (!s.scriptInstanceList.length) continue;
          const inst = s.scriptInstanceList[0];
          const prop = (k) => D.getScriptProp(inst, k).value;
          out[`sprite ${n}`] = S(new L.LList([s.locH, s.locV, L.lf(s.rotation), s.member ? s.member.name : '', ...PROPS.map(prop)]));
          out[`script ${n}`] = inst.constructor.name.toLowerCase();
          for (const k of ['m', 'pm']) {
            const m = prop(k);
            out[`${k} of ${n}`] = m instanceof S3.Model ? S(new L.LList([m.name, m.worldPosition, m.visibility])) : '-';
          }
        }
        for (const name of sc.models) {
          const m = G.world.model(name);
          out[`model ${name}`] = m ? S(new L.LList([m.worldPosition, m.transform.rotation, m.visibility, m.transform.scale])) : '-';
        }
        out.ammo = S(new L.LList([1, 2, 3].map((k) => D.member(`weapon${k} num`).text)));
        out.globals = S(new L.LList([G.gShield, G.gBatt]));
        return out;
      };

      const ticks = [];
      let pre = orig.robot0;
      const stopAt = evalAt === null ? Infinity : evalAt;
      for (const t of orig.ticks) {
        if (ticks.length === stopAt) break;
        now = t.ms;
        calls.length = 0;
        robot.tick = { pre, post: t.robot, map: t.map };
        // sendAllSprites(#prepareFrame) as dirplayer runs it: the receivers are the
        // behaviors on the stage when it starts, so a shot created during this tick gets
        // its first prepareFrame next tick (dirplayer's frame events work the same way).
        const receivers = p.sprites.filter((s) => s.spriteNum > 0 && s.scriptInstanceList.length).map((s) => [s.spriteNum, [...s.scriptInstanceList]]);
        for (const [ch, list] of receivers) p.sendToInstances(ch, list, 'prepareFrame', []);
        frame.RecycleSprites();
        ticks.push({ probes: read(), calls: calls.slice() });
        pre = t.robot;
      }
      return { ticks };
    },
    { sc, orig, PROPS, WEAPON_SPRITES, POOL, evalAt: opt('eval-at') === undefined ? null : Number(opt('eval-at')) },
  );
  // --eval-at=N --eval=js: stop after N ticks and print a page expression (window.__wt has the harness).
  if (opt('eval')) console.log('eval:', await page.evaluate(opt('eval')));
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
        // Euler angles: -180 and 180 are the same turn.
        .replace(/-180\.0000/g, '180.0000')
        .replace(/^\[Void, Void, Void\]$/, '-')
        // A model that isn't there: dirplayer reads VOID's properties as VOID or zero.
        .replace(/^\[Void, vector\(0\.0000, 0\.0000, 0\.0000\), Void, vector\(0\.0000, 0\.0000, 0\.0000\)\]$/, '-');
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
    // An integral float against an integer ("3.0000" / "3") counts as equal but is
    // tallied: the translations keep plain JS numbers where Lingo's int/float type
    // doesn't change the result (values.ts); a real difference shows in the value.
    if (x.includes('.') !== y.includes('.')) intFloat++;
    return Math.abs(Number(x) - Number(y)) <= 5e-4 + 1e-6 * Math.abs(Number(x));
  });
}
let intFloat = 0;

function compare(name, orig, port) {
  let bad = 0;
  const firstBad = new Map();
  const { battkonst, motorkonst } = orig.env;
  let prevDs = orig.robot0.match(/#energy: ([-\d.]+), #pansar: ([-\d.]+)/).slice(1).map(Number);
  orig.ticks.forEach((t, i) => {
    const P = port.ticks[i];
    const keys = new Set([...Object.keys(t.probes), ...Object.keys(P.probes)]);
    for (const k of keys) {
      if (same(t.probes[k], P.probes[k])) continue;
      const cat = k.replace(/\d+$/, 'N');
      if (!firstBad.has(cat)) firstBad.set(cat, { tick: i, key: k, o: t.probes[k], p: P.probes[k] });
      bad++;
    }
    // What the weapons took from the robot, against the original robot's damageStatus.
    const ds = t.robot.match(/#energy: ([-\d.]+), #pansar: ([-\d.]+)/).slice(1).map(Number);
    // The robot's damage takes 20% off while the force field (v33) has gShield = 1.
    const shield = /^\[1,/.test(P.probes.globals ?? '') ? 0.8 : 1;
    const dmg = P.calls.filter((c) => c[0] === 'damage').reduce((s, c) => s + Number(c[1]) * shield, 0);
    const spend = P.calls.filter((c) => c[0] === 'spendEnergy').reduce((s, c) => s + Number(c[1]), 0);
    // The robot's own motor drain (handleMove spends energy for up/down unless the robot is in #battery or #mini).
    const rstate = t.robot.match(/#(\w+), \d+, \d+, [-\d.]+, \[#energy/)?.[1];
    const motor = (t.map[2] === '1' || t.map[3] === '1') && rstate !== 'battery' && rstate !== 'mini' ? motorkonst * battkonst : 0;
    const expEnergy = Math.max(0, prevDs[0] - (spend + motor) * battkonst);
    const expPansar = Math.max(0, prevDs[1] - dmg);
    if (Math.abs(expPansar - ds[1]) > 1e-3 && !firstBad.has('armour')) firstBad.set('armour', { tick: i, key: 'armour', o: ds[1], p: `${expPansar} (calls ${JSON.stringify(P.calls)})` });
    if (Math.abs(expEnergy - ds[0]) > 1e-3 && ds[0] > 0 && !firstBad.has('energy')) firstBad.set('energy', { tick: i, key: 'energy', o: ds[0], p: `${expEnergy} (calls ${JSON.stringify(P.calls)})` });
    if (VERBOSE && (P.calls.length || t.errors.length)) console.log(`  tick ${i} ${t.map}: port calls ${JSON.stringify(P.calls)} ${t.errors.length ? 'original errors ' + t.errors.join('; ') : ''}`);
    prevDs = ds;
  });
  const timing = orig.ticks.filter((t) => t.ms2 !== t.ms).length;
  if (timing) console.log(`  warning: dirplayer's clock moved during ${timing} ticks (the pin didn't hold)`);
  if (intFloat) console.log(`  note: ${intFloat} integral float/integer differences in matching values`);
  intFloat = 0;
  if (!firstBad.size) {
    console.log(`${name}: match, ${orig.ticks.length} ticks`);
    return true;
  }
  console.log(`${name}: ${firstBad.size} kinds of mismatch (${bad} probe values)`);
  for (const [cat, b] of firstBad) {
    const t = orig.ticks[b.tick];
    console.log(`  ${cat}: first at tick ${b.tick} (keys ${t.map}, ms ${t.ms}..${t.ms2})\n    original ${b.o}\n    port     ${b.p}`);
  }
  return false;
}

const wanted = args.filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(SCENARIOS);
const browser = await launch();
let ok = true;
for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`no scenario ${name}`);
  // --reuse=/tmp/prefix: the original's trace from an earlier --dump (port side only).
  const reuse = opt('reuse');
  const orig = reuse ? JSON.parse((await import('node:fs')).readFileSync(`${reuse}-${name}.json`, 'utf8')).orig : await original(browser, sc);
  const port = await ported(browser, sc, orig);
  if (port.logs.length) console.log(`  port console errors:\n    ${[...new Set(port.logs)].slice(0, 10).join('\n    ')}`);
  const errs = orig.ticks.flatMap((t, i) => t.errors.map((e) => `tick ${i}: ${e}`));
  if (errs.length) console.log(`  original script errors:\n    ${[...new Set(errs)].slice(0, 5).join('\n    ')}`);
  if (opt('eval')) continue;
  const dump = opt('dump');
  if (dump) (await import('node:fs')).writeFileSync(`${dump}-${name}.json`, JSON.stringify({ orig, port }, null, 1));
  ok = compare(name, orig, port) && ok;
}
await browser.close();
process.exit(ok ? 0 : 1);
