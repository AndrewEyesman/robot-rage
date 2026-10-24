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
// 3. The probes are compared tick by tick (numbers to 1e-3: four printed decimals and
//    float drift over a long flight), and the damage and energy the weapons take from the
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
// (the first idle ticks also let dirplayer's pinned clock settle: it reads late for a few ticks)
const std = [...run('00000000', 8), ...shot(1, 2, 45), ...shot(2, 2, 45), ...shot(3, 2, 45), ...shot(1, 2, 20, '1'), ...shot(2, 2, 20, '1'), ...shot(3, 20, 30)];

export const SCENARIOS = {
  grenade_mine_axe: { rd: robot(['v4', 'v1', 'v8'], ['t', 'b', 'f']), schedule: std, models: ['Granatkastare1', 'Slagpik1', 'Mina1'] },
  flame_nail_claw: { rd: robot(['v2', 'v13', 'v9'], ['t', 'b', 'f']), schedule: std, models: ['Eldkastare1', 'Klo11', 'Klo21'] },
  laser_glue_drill: { rd: robot(['v3', 'v14', 'v10'], ['t', 'b', 'f']), schedule: std, models: ['laserkanon1', 'laserray1', 'Skruv1'] },
  guided_oil_saw: { rd: robot(['v16', 'v15', 'v11'], ['t', 'b', 'f']), schedule: std, models: ['missilHN1', 'missilVU1'] },
  heat_pin_plow: { rd: robot(['v17', 'v12', 'v6'], ['t', 'f', 'b']), schedule: std, models: ['missilHN1', 'Taggar1'] },
  regen_kami_spear: { rd: robot(['v22', 'v24', 'v21'], ['t', 'b', 'f']), schedule: std, models: ['regen1', 'speargun1'] },
  field_flash_disc: { rd: robot(['v33', 'v25', 'v26'], ['t', 'f', 'b']), schedule: std, models: ['shield1', 'flash1', 'spinndisc1'] },
  cloak_mini_charges: { rd: robot(['v34', 'v31', 'v32'], ['t', 'f', 'b']), schedule: std, models: ['trans1', 'RCbombcar1', 'RCMine1'] },
  gun_emp_dagger: { rd: robot(['v35', 'v36', 'v7'], ['f', 'b', 'f']), schedule: std, models: ['Railgun1', 'EMP1'] },
  // The maintainer's spear gun: razor discs at the back, spear gun at the front, all five spears.
  spear_front_five: { rd: robot(['v26', 'v24'], ['b', 'f']), schedule: [...run('00000000', 8), ...[1, 2, 3, 4, 5, 6].flatMap(() => shot(2, 2, 18))], models: ['speargun1'], forward: 5 },
  spear_back_five: { rd: robot(['v24'], ['b']), schedule: [...run('00000000', 8), ...[1, 2, 3, 4, 5, 6].flatMap(() => shot(1, 2, 18))], models: ['speargun1'] },
};

/**
 * Differences that aren't the weapons' and are reported elsewhere (docs/port-issues.md):
 * BuildRobot's copies of the mini-gun, mini robot and disc launcher come out #none in
 * the port where dirplayer reads #front (their parents carry no mesh; the visible parts
 * are children, which match).
 */
const KNOWN = [
  { key: /^model (Railgun1|RCbombcar1|spinndisc1)$/, re: /#(none|front)(?=[,\]])/, to: '#vis' },
  { key: /^m of \d+$/, when: /^\["RCbombcar1"/, re: /#(none|front)(?=[,\]])/, to: '#vis' },
  // The saw (v11): dirplayer can't find its blade model by the part table's Mac-encoded
  // name ("s\x8cgblad"), so the original side never spins it; the port finds and spins it.
  { key: /^m of \d+$/, when: /^\[Void, Void, Void\]$/, whenPort: /^\["s\u0152gblad1"/, re: /^.*$/, to: '-' },
  // The spear gun's cloneDeep copies: children are numbered "-copy1" in the port and
  // "-copy2" in dirplayer (the runtime's clone naming; same models, same positions).
  { key: /^m of \d+$/, when: /^\["spear/, re: /-copy\d+/, to: '-copyN' },
];

const PROPS = ['state', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'angle', 'dangle', 'counter', 'speed', 'pHit', 'radie', 'gnista'];
const WEAPON_SPRITES = [12, 13, 14];
const POOL = Array.from({ length: 31 }, (_, i) => 100 + i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  return chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
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
  if (VERBOSE) console.log('original: entering Training');
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
    ...[1, 2, 3].map((k) => `member("weapon${k} num").text = ""`),
    'world.resetWorld()',
    'sendSprite(0, #beginSprite)',
    'sendSprite(10, #InitRobot)',
  ];
  if (VERBOSE) console.log('original: robot', await lingo('string(sprite(10).state)'));
  for (const c of setup) {
    if (VERBOSE) console.log('original:', c.slice(0, 60));
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
    'string([sprite(10).x, sprite(10).y, sprite(10).z, sprite(10).angle, sprite(10).anglex, sprite(10).anglez, sprite(10).speed, sprite(10).dx, sprite(10).dy, sprite(10).fart, sprite(10).state, sprite(10).locH, sprite(10).locV, sprite(10).rotation, sprite(10).damageStatus, sprite(10).member.name, sprite(10).pRobot.parent.worldPosition, sprite(10).pRobot.transform.rotation, sprite(10).pRobot.parent.transform.rotation, sprite(10).keymap])';
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
      // The clock creeps on by 1 ms every 100000 reads: dirplayer's VM waits for time to
      // pass inside a long handler, and a stopped clock hangs it.
      let n = 0;
      window.Date = class extends R {
        constructor(...a) {
          if (a.length) super(...a);
          else super(t + Math.floor(n++ / 100000));
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
    if (VERBOSE) process.stdout.write(`ms ${ms} `);
    const err1 = await lingo('sendAllSprites(#prepareFrame)');
    if (VERBOSE) process.stdout.write(`frame ${await lingo('string(the milliSeconds)')} `);
    const err2 = await lingo('sendSprite(0, #RecycleSprites)');
    const ms2 = Number(await lingo('string(the milliSeconds)'));
    if (VERBOSE) process.stdout.write(`recycled `);
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

async function ported(browser, sc, orig, fixes = false) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') logs.push(m.text().slice(0, 400));
  });
  page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  // The port's enhancements that change weapons are off for the comparison (?quirks=).
  await page.goto(`${APP}/game.html?movie=arena104&frame=backyard${fixes ? '' : '&quirks=spear'}`);
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
      // dirplayer shows the cast's Mac bytes decoded as Mac Roman ("sågblad"); the port
      // keeps each byte as its Windows-1252 character, as Adobe's Windows player does
      // ("s\u0152gblad", byte 0x8C), which is how the 3D file names the saw blade.
      const MAC = { 'å': '\u0152', 'ä': '\u0160', 'ö': '\u0161', 'Å': '\x81', 'Ä': '\u20ac', 'Ö': '\u2026', 'é': '\u017d', 'ü': '\u0178' };
      G.gPartDescription = val(orig.env.partDescription.replace(/[åäöÅÄÖéü]/g, (c) => MAC[c]));
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
      // The weapon channels as a fresh Training has them (the arena's own frame script
      // may have run first with its default robot).
      for (let n = 11; n <= 14; n++) {
        const s = p.sprite(n);
        s.scriptInstanceList = [];
        s.locH = s.locV = 0;
        s.rotation = 0;
        s.member = null;
        s.puppet = false;
      }

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
          // The robot model where the original's last UpdateRobot left it (a hopp during
          // the tick changes z only after the model has moved).
          this.pRobot.parent.worldPosition = l.getAt(17);
          this.pRobot.transform.rotation = l.getAt(18);
          this.pRobot.parent.transform.rotation = l.getAt(19);
          // The keymap the robot acts on (#broken and the like clear it each frame).
          this.keymap = L.lingoString(l.getAt(20));
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
          // keyPressed only queues keys in these states (the queue then delivers them this tick).
          const takes = ['move', 'slow', 'fast', 'hopp', 'battery', 'mini', 'scrambled'].some((x) => this.state === sym(x));
          if (t.changed && takes) this.keyEvent(t.map);
          // moveMini: in #mini the robot steers the mini robot instead of itself.
          if (this.state === sym('mini')) D.sendSprite(this.minisp, 'steermini', this.keymap.slice(0, 4), this.speed);
          this.take(t.post);
        }
      }
      for (const h of ['damage', 'spendEnergy', 'hopp', 'rekyl', 'hit', 'fasten', 'makeslow', 'makenormal', 'release', 'slippery', 'stopmini', 'emp', 'noemp', 'tip', 'MakeLoser', 'breakdown']) {
        ReplayRobot.prototype[h] = function (...a) {
          calls.push([h, ...a.map((x) => L.lingoString(x))]);
        };
      }
      ReplayRobot.prototype.startmini = function (sp0) {
        calls.push(['startmini', L.lingoString(sp0)]);
        this.minisp = sp0;
      };
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

      for (const k of [1, 2, 3]) D.member(`weapon${k} num`).text = '';
      A3.initWeapons(G.gRobot1, rd, 1, 10);
      // The robot's InitRobot (sent after the rebuild on the original's side, and run on
      // its first frame in the game) starts with sendAllSprites(#stopshoot).
      D.sendAllSprites('stopshoot');
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
            // A deleted model's position reads as zero in dirplayer.
            out[`${k} of ${n}`] = m instanceof S3.Model ? S(new L.LList([m.name, m.deleted ? S3.vector(0, 0, 0) : m.worldPosition, m.visibility])) : '-';
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
      let lastMap = '00000000';
      const stopAt = evalAt === null ? Infinity : evalAt;
      for (const t of orig.ticks) {
        if (ticks.length === stopAt) break;
        now = t.ms;
        calls.length = 0;
        robot.tick = { pre, post: t.robot, map: t.map, changed: t.map !== lastMap };
        lastMap = t.map;
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
    return Math.abs(Number(x) - Number(y)) <= 1e-3 + 1e-6 * Math.abs(Number(x));
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
      let [a, b] = [t.probes[k], P.probes[k]];
      // A sprite rotation of 360 reads 0 in dirplayer on Training's first tick.
      if (k.startsWith('sprite') && a && b) [a, b] = [a, b].map((v) => v.replace(/^(\[[^,]+, [^,]+, )360\.0000/, '$10.0000'));
      // A sprite's loc is a float truncated to whole pixels: positions that agree to
      // 1e-3 can land a pixel apart (a gun at x 6000 in dirplayer, 5999.9999 in the port).
      if (k.startsWith('sprite') && a && b) {
        const la = a.match(/^\[(-?\d+), (-?\d+), /);
        const lb = b.match(/^\[(-?\d+), (-?\d+), /);
        if (la && lb && Math.abs(la[1] - lb[1]) <= 1 && Math.abs(la[2] - lb[2]) <= 1) b = b.replace(/^\[(-?\d+), (-?\d+), /, `[${la[1]}, ${la[2]}, `);
      }
      // Known differences outside the weapons (KNOWN below): compared without them.
      for (const kn of KNOWN) if (kn.key.test(k) && a && b && (!kn.when || kn.when.test(a)) && (!kn.whenPort || kn.whenPort.test(b))) [a, b] = [a.replace(kn.re, kn.to), b.replace(kn.re, kn.to)];
      if (same(a, b)) continue;
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
    // The robot's own motor drain: handleMove spends energy for up/down.
    const stateOf = (r) => r.match(/#(\w+), -?\d+, -?\d+, [-\d.]+, \[#energy/)?.[1];
    const rstates = [stateOf(t.robot), stateOf(i ? orig.ticks[i - 1].robot : orig.robot0)];
    // (#broken, #over and #stunned clear the keymap; #battery and #mini don't drive; the rest don't run handleMove's keys)
    const noMotor = ['battery', 'mini', 'broken', 'over', 'stunned', 'stop', 'tip', 'fall'];
    const keymap = t.robot.match(/, "([01]{8})"\]$/)?.[1] ?? t.map;
    const motor = (keymap[2] === '1' || keymap[3] === '1') && !rstates.some((x) => noMotor.includes(x)) ? motorkonst * battkonst : 0;
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

/**
 * With the port's fix on (enhancements.ts arenaFixes.spearForward), every spear of a
 * front-mounted gun flies forward: the robot faces -z in these scenarios, so each spear
 * model's z must fall from tick to tick while it flies.
 */
async function checkForward(browser, name, sc, orig) {
  const port = await ported(browser, sc, orig, true);
  const zs = new Map();
  port.ticks.forEach((t) => {
    for (const [k, v] of Object.entries(t.probes)) {
      const m = /^m of (\d+)$/.test(k) && v.match(/^\["(spear[^"]*)", vector\( *[-\d.]+, *[-\d.]+, *([-\d.]+)/);
      if (m) (zs.get(m[1]) ?? zs.set(m[1], []).get(m[1])).push(Number(m[2]));
    }
  });
  const backward = [...zs].filter(([, z]) => z.length < 2 || z[1] >= z[0]);
  const ok = zs.size === sc.forward && !backward.length;
  console.log(`${name} (port fix on): ${ok ? 'ok' : 'FAIL'}, ${zs.size} of ${sc.forward} spears fired${backward.length ? `, backwards: ${backward.map(([n]) => n).join(', ')}` : ', all forward'}`);
  return ok;
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
  if (sc.forward) ok = (await checkForward(browser, name, sc, orig)) && ok;
}
await browser.close();
process.exit(ok ? 0 : 1);
