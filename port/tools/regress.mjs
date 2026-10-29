// The port's regression suite: every behaviour in docs/port-behaviors.md that can be
// checked automatically, in one command. Run it before calling any change to shared
// code (port/web/src/director, s3d, lingo) done; a behaviour that stops working is a
// failure, not a side effect.
//
//   node port/tools/regress.mjs                  everything
//   node port/tools/regress.mjs login garage     only checks whose name contains a word
//   node port/tools/regress.mjs --fast           skip the slow checks (two-tab matches, traces, the production build): a couple of minutes
//   node port/tools/regress.mjs --full           also the weapons and two robots against the original (weapon-trace, robots-trace, 20-45 min)
//   node port/tools/regress.mjs --approve        re-record the approved screenshots
//   node port/tools/regress.mjs --live           use the running dev server (8092) and test server (8091)
//
// By default the suite starts its own game server (a free port) on a fresh copy of the
// seed data in port/tools/regress-seed.json (accounts tester@home.lan / Crusher,
// rival@home.lan / Rival, lobbytest@home.lan / Lobbyist, regress@home.lan / Regress,
// all password rage2005) and its own dev server (another free port) talking to it, so every run
// starts from the same state and never touches 8091 or 8090. Both are stopped at the
// end.
//
// The game server runs the hosted configuration (docker-compose.yml): IRC_REQUIRE_SESSION=1
// and MAP_REQUIRE_SESSION=1, so every lobby and garage check also checks the client sends
// its session where the original sent none (gameFixes.ircAuth, gameFixes.mapSession).
//
// The lobby check uses its own account (regress@home.lan, robot "Regress", created on
// first run as a copy of Crusher) so it never collides with someone playing on the
// test accounts: the lobby refuses a nick that's already online.
//
// Screenshots are compared with approved ones in .cache/regress/approved/ (game art, so
// never committed): a check records its image the first time, and later fails when
// more than 0.5% of pixels differ by more than 24/255. Diffs go to the run's folder in
// .cache/regress/out/ (see OUT).
// Approve a deliberate change with --approve after looking at the diff.
import { chromium } from 'playwright-core';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args0 = process.argv.slice(2);
const live = args0.includes('--live');
/** A free TCP port (each run gets its own pair, so runs never collide). */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((done) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}
const SERVER_PORT = live ? 8091 : await freePort();
const DEV_PORT = live ? 8092 : await freePort();
const APP = `http://127.0.0.1:${DEV_PORT}`;
const APPROVED = join(ROOT, '.cache/regress/approved');
// Each run's logs and diffs go to a folder of their own (several agents may run the suite at
// once, docs/port-issues.md #51), .cache/regress/out/<time>-<pid>; `latest` links to the newest.
// The tools the suite runs (p2p-test, prod-test) write there too (REGRESS_OUT). Runs older
// than two days are deleted.
const OUT_ROOT = join(ROOT, '.cache/regress/out');
const OUT = join(OUT_ROOT, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
mkdirSync(APPROVED, { recursive: true });
mkdirSync(OUT, { recursive: true });
process.env.REGRESS_OUT = OUT;
for (const e of readdirSync(OUT_ROOT, { withFileTypes: true })) {
  const path = join(OUT_ROOT, e.name);
  if (e.isDirectory() && Date.now() - statSync(path).mtimeMs > 2 * 24 * 3600_000) rmSync(path, { recursive: true, force: true });
}
try {
  rmSync(join(OUT_ROOT, 'latest'), { force: true });
  symlinkSync(basename(OUT), join(OUT_ROOT, 'latest'));
} catch {
  // A link another run made at the same moment: either is fine.
}

const args = args0;
const fast = args.includes('--fast');
// The `full` checks (weapon-trace, robots-trace) take 10-30 minutes each: only with --full or named.
const full = args.includes('--full');
const approve = args.includes('--approve');
const filters = args.filter((a) => !a.startsWith('--'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the checks

/** An account for login-long-email: an address wider than the login screen's box. */
const LONG_EMAIL = 'a.rather.long.address@example.com';
const LONG_PASSWORD = 'horse-battery-staple'; // the box takes 20 characters (login013_ 28)

const LOGIN = [
  ['click', 310, 148],
  ['expect', 'login tab', `p.frameLabel === 'login'`],
  ['click', 400, 222],
  ['type', 'tester@home.lan'],
  ['click', 400, 260],
  ['type', 'rage2005'],
  ['expect', 'password shows stars', `p.sprite(13).member.text === '********'`],
  ['click', 475, 309],
  ['expect', 'robot list loaded', `p.member('robotname1').text === 'Crusher'`, 15000],
  ['expect', 'no caret left in a label (the focus went with the password field)', `p.keyboardFocusSprite === -1 || p.isEditable(p.sprite(p.keyboardFocusSprite))`, 2000],
];
const LIST_TO_GARAGE = [
  ['click', 300, 235],
  ['expect', 'robot selected', `p.globals.gLobby.getaProp(sym('selectedid')) === 1`],
  ['click', 480, 375],
  ['expect', 'garage loaded', `p.movie.name === 'factory0604' && p.frameLabel === 'build'`, 25000],
  ['wait', 1500],
];
const TO_GARAGE = [...LOGIN, ...LIST_TO_GARAGE];
/** A tab opened after a login in the same browser: the kept login (gameFixes.keepLogin) goes straight to the robot list. */
const KEPT_TO_GARAGE = [
  ['expect', 'the kept login goes straight to the robot list', `p.movie.name === 'login013_' && p.member('robotname1').text === 'Crusher'`, 15000],
  ...LIST_TO_GARAGE,
];
/** The browser's kept login (gameFixes.keepLogin). */
const KEPT = `localStorage.getItem('rr-login')`;
/** Collects the login movie's frame labels as they're drawn, in window.__labels (set before the loader is done). */
const LABEL_LOG = `(() => { window.__labels = new Set(); const prev = p.onFrame; p.onFrame = (pl) => { prev?.(pl); if (pl.movie?.name === 'login013_') window.__labels.add(pl.frameLabel); }; })()`;

/** In the lobby: the point on a name's line in the room's user list (sprite 9, 13 px lines). */
// Collects the lobby's P2PMessageHandler script errors in window.__p2pErrors, and
// makes the tab's P2P connections open 300 ms late, as over the internet: #70 needs a
// connection that's still opening on the frame after connectP2P, which never happens
// between two local tabs.
const PING_ERRORS = `import('/src/director/errors.ts').then((m) => {
  window.__p2pErrors = [];
  m.scriptErrorListeners.push((w, e) => { if (/P2PMessageHandler/.test(w)) window.__p2pErrors.push(w + ': ' + e); });
  const Real = window.WebSocket;
  window.WebSocket = class extends Real {
    constructor(...a) { super(...a); this.late = this.url.includes('/ws/p2p/connect'); }
    get readyState() { return this.late && super.readyState === Real.OPEN ? Real.CONNECTING : super.readyState; }
    set onopen(f) { super.onopen = (e) => (this.late ? setTimeout(() => { this.late = false; f.call(this, e); }, 300) : f.call(this, e)); }
    get onopen() { return super.onopen; }
  };
})`;
/** The middle of the page's element `sel`, for a clickAt step; SETTING(key) is the Settings dialog's control for it. */
const CENTER_OF = (sel) => `(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;
const SETTING = (key) => `document.querySelector('#settings [name=${key}]')`;
const LINE_OF = (name) => `(() => { const b = p.sprite(9).bounds; const i = p.member('rvtext').text.split('\\r').findIndex((l) => l.startsWith('${name}\\t')); return [b.left + 40, b.top + 13 * i + 6]; })()`;
/** In the lobby: that robot's card is shown and can be challenged. */
const CARD_OF = (name) =>
  `String(p.frameScript.pState) === '#waiting' && String(p.globals.getOpponentState) === '#waiting' && p.frameScript.pchallengestate === 1 && String(p.globals.gRobotData?.getaProp(sym('robotname'))) === '${name}'`;

/**
 * Records every frame cycle in which a door half (robotwars 263, and the lobby's bottom
 * buttons, lobby060_ 65) is closing or closed: [sprite, locH, closed position, state], to
 * check the slides run to the end; and in window.__doorsShown, a half drawn before its
 * slide started (gameFixes.doorButtons).
 */
const DOOR_LOG = `(() => { window.__doors = []; window.__doorsShown = []; const prev = p.onFrame; p.onFrame = (pl) => { prev?.(pl); const hs = [];
  for (const s of pl.sprites) for (const b of s?.scriptInstanceList ?? []) if (['DoorBehavior', 'Doorbehavior'].includes(b.constructor.name)) {
    if (['#moveclose', '#done'].includes(String(b.pState))) hs.push([s.spriteNum, s.locH, b.closepos, String(b.pState)]);
    else if (s.visible && [4, 8, 9, 19].includes(pl.frame)) window.__doorsShown.push([pl.movie?.name, pl.frame, s.spriteNum, String(b.pState)]);
  }
  if (hs.length) window.__doors.push({ movie: pl.movie?.name, frame: pl.frame, hs }); }; return 1; })()`;
/** The doors of a movie closed in one slide: 30+ frame cycles, and every half at its closed position when the playhead moved on. */
const DOORS_CLOSED = (movie) => `(() => { const e = window.__doors.filter((d) => d.movie === '${movie}'); const last = e[e.length - 1];
  return e.length >= 30 && last.hs.length > 0 && last.hs.every(([sp, x, closed, st]) => x === closed && st === '#done'); })()`;

/** Save gUserData as the garage does (setrobot, economy=1); the reply goes in window.__saved. */
const SAVE_ROBOT = `(async () => { const L = await import('/src/lingo/index.ts'); const g = p.globals;
  const body = new URLSearchParams({ action: 'setrobot', sessionid: String(g.gLobby.getaProp(sym('session'))), robotid: String(g.gGameGlobals.getaProp(sym('userID'))),
    proplist: L.lingoString(g.gUserData.getaProp(sym('propertyList'))), economy: '1' });
  window.__saved = await (await fetch('/api/main.asp', { method: 'POST', body })).text(); return 1; })()`;

/** Records the page's paint map saves (setrobotmap) in window.__maps: whether each carried a session, the map (Latin-1, as sent) and the reply. */
const MAP_SAVES = `(() => { window.__maps = []; const f = window.fetch; window.fetch = async (url, init) => { const r = await f(url, init);
  const body = typeof init?.body === 'string' ? init.body : '';
  const field = (k) => (body.match(new RegExp('(?:^|&)' + k + '=([^&]*)'))?.[1] ?? '').replace(/\\+/g, ' ').replace(/%([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (/(^|&)action=setrobotmap/i.test(body)) window.__maps.push({ session: /(^|&)sessionid=[^&]/i.test(body), map: field('map'), reply: await r.clone().text(), movie: p.movie?.name, frame: p.frameLabel });
  return r; }; return 1; })()`;
/** The paint map the server holds for the page's robot (getrobotmap), read byte for byte, into window.__stored. */
const STORED_MAP = `(async () => { const g = p.globals; const body = new URLSearchParams({ action: 'getrobotmap', sessionid: String(g.gLobby.getaProp(sym('session'))), robotid: String(g.gGameGlobals.getaProp(sym('userID'))) });
  const buf = new Uint8Array(await (await fetch('/api/main.asp', { method: 'POST', body })).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); window.__stored = s; return 1; })()`;

/** Each check: a command, or a flow of steps in a fresh browser context. */
/**
 * In-page helpers for the weapon checks: `__verts(node)` lists a 3D node's mesh vertices
 * in world space; `__inst(name)` finds a behavior instance by its class name.
 */
const WEAPON_HELPERS = `(() => {
  window.__inst = (n) => p.sprites.flatMap((s) => s?.scriptInstanceList ?? []).find((b) => b.constructor.name === n);
  window.__verts = (node) => {
    const o = node.obj, out = [];
    o.updateWorldMatrix(true, true);
    o.traverse((c) => {
      const a = c.geometry?.attributes?.position;
      for (let i = 0; a && i < a.count; i++) out.push(new c.position.constructor(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(c.matrixWorld));
    });
    return out;
  };
  return 1;
})()`;
/** Training with a robot of these parts (Training's robot starts facing -z). */
const weaponUrl = (parts, pos) => `/index.html?layout=original&parts=${parts}&pos=${pos}&pansar=50&name=Crusher`;
const ROBOT_READY = ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000];

/**
 * The spear gun at the front or back (docs/port-issues.md #53, #71): the spear flies out
 * of the gun head first, forward from the front, backward from the back (mounting at the
 * back turns the gun round). The head is the wide end of the spear model, at its -z.
 */
function spearHeadFirst(pos) {
  return {
    name: `spear-head-first-${pos === 'f' ? 'front' : 'back'}`,
    url: weaponUrl('r1,h2,ma1,b1,v24', pos),
    steps: [
      ROBOT_READY,
      [
        'eval',
        `window.__spear = () => {
          const s = p.sprites.find((s) => s.scriptInstanceList.some((b) => b.constructor.name === 'SpearBehavior'));
          const o = s?.scriptInstanceList.find((b) => b.constructor.name === 'SpearBehavior').m?.obj;
          if (!o) return null;
          o.updateWorldMatrix(true, true);
          let rPos = 0, rNeg = 0;
          o.traverse((c) => {
            const a = c.geometry?.attributes?.position;
            for (let i = 0; a && i < a.count; i++) {
              const r = Math.hypot(a.getX(i), a.getY(i));
              if (a.getZ(i) > 0) rPos = Math.max(rPos, r); else rNeg = Math.max(rNeg, r);
            }
          });
          const e = o.matrixWorld.elements, n = Math.hypot(e[8], e[9], e[10]), k = rPos > rNeg ? 1 : -1;
          return { pos: [e[12], e[13], e[14]], head: [e[8], e[9], e[10]].map((v) => (k * v) / n) };
        }`,
      ],
      // Training's robot starts 900 units from the wall behind it: drive away from it first.
      ...(pos === 'b' ? [['hold', 'ArrowUp', 2000], ['wait', 1500]] : []),
      ['hold', 'z', 150],
      [
        'expect',
        `the spear flies ${pos === 'f' ? 'forward' : 'backward'}, head first`,
        `(() => {
          const s = window.__spear();
          if (!s) return false;
          if (!window.__s0) return (window.__s0 = s), false;
          const d = s.pos.map((v, i) => v - window.__s0.pos[i]), n = Math.hypot(...d);
          return n > 1 && ${pos === 'f' ? '' : '-'}d[2] / n < -0.9 && d.reduce((a, v, i) => a + (v / n) * s.head[i], 0) > 0.9;
        })()`,
        3000,
      ],
    ],
  };
}

/**
 * The power axe (docs/port-issues.md #62, #71; the game mounts it only at the front):
 * it swings forward, its up axis tipping toward -z.
 */
const AXE_FORWARD = {
  name: 'axe-swings-forward-front',
  url: weaponUrl('r1,h2,ma1,b1,v8', 'f'),
  steps: [
    ROBOT_READY,
    [
      'eval',
      `window.__axeUp = () => {
        const b = p.sprites.flatMap((s) => s?.scriptInstanceList ?? []).find((b) => b.constructor.name === 'VapenV8');
        b.m.obj.updateWorldMatrix(true, true);
        const e = b.m.obj.matrixWorld.elements, n = Math.hypot(e[4], e[5], e[6]);
        return [e[4] / n, e[5] / n, e[6] / n];
      }`,
    ],
    ['hold', 'z', 60],
    ['expect', 'the axe swings forward', `(() => { const [, y, z] = window.__axeUp(); return y < 0.5 && z < -0.5; })()`, 2000],
  ],
};

/**
 * The claw at the front (#71): its halves keep the mirror they were mounted with while
 * they open and close, so the prongs reach out ahead of the chassis (the port used to
 * drop the mirror on `transform.rotation = ...` and fold them back into the robot).
 */
const CLAW_FORWARD = {
  name: 'claw-reaches-forward',
  url: weaponUrl('r1,h2,ma1,b1,v9', 'f'),
  steps: [
    ROBOT_READY,
    ['eval', WEAPON_HELPERS],
    [
      'eval',
      `window.__claw = () => {
        const b = __inst('VapenV9');
        const body = Math.min(...b.m1.parent.children.filter((c) => c !== b.m1 && c !== b.m2 && c.kind === 'model' && String(c.visibility) !== '#none').flatMap(__verts).map((v) => v.z));
        return body - Math.min(...__verts(b.m1).concat(__verts(b.m2)).map((v) => v.z));
      }`,
    ],
    ['expect', 'at rest the claw reaches 150 units past the chassis front', `window.__claw() > 150`, 2000],
    ['hold', 'z', 250],
    ['expect', 'closing, it still does', `window.__claw() > 150`, 500],
  ],
};

/**
 * The saw (docs/port-issues.md #87): its "sag_loop" member has Director's Loop checkbox set, so the sound
 * keeps going while the key is held, past the clip's 2.9 s (the port used to play it once).
 */
const SAW_SOUND_LOOPS = {
  name: 'saw-sound-loops',
  url: weaponUrl('r1,h2,ma1,b1,v11', 'f'),
  steps: [
    ROBOT_READY,
    ['hold', 'z', 4000],
    ['expect', 'held 4 s, the saw is still heard', `Array.from({ length: 8 }, (_, i) => window.__sound(i + 1)).some((c) => c.member?.name === 'sag_loop' && c.isBusy())`, 500],
  ],
};

/** The laser cannon (#71): the beam goes forward from the cannon, never behind it. */
const LASER_FORWARD = {
  name: 'laser-fires-forward',
  url: weaponUrl('r1,t1,h2,ma1,b1,v3', 't'),
  steps: [
    ROBOT_READY,
    ['eval', WEAPON_HELPERS],
    ['hold', 'z', 200],
    [
      'expect',
      'the beam reaches 1000 units ahead of the cannon and nothing behind it',
      `(() => {
        const w = p.globals.gRobot1.member, z = w.model('laserkanon1').worldPosition.z, v = __verts(w.model('laserray1')).map((a) => a.z);
        return Math.min(...v) < z - 1000 && Math.max(...v) < z + 100;
      })()`,
      2000,
    ],
  ],
};

/**
 * The flame thrower (#72, arenaFixes.flameForward): the flames stream along the robot's
 * heading, ahead of the nozzle (the original mirrored them in z: out of the back here).
 */
const FLAME_FORWARD = {
  name: 'flame-streams-forward',
  url: weaponUrl('r1,t1,h2,ma1,b1,v2', 't'),
  steps: [
    ROBOT_READY,
    ['eval', WEAPON_HELPERS],
    ['hold', 'z', 200],
    ['wait', 700],
    [
      'expect',
      'the emitter points forward and the flames are 700 units ahead of the nozzle on average',
      `(() => {
        const b = __inst('ThrowfireBehavior'), ps = b?.m?.particles;
        if (!ps) return false;
        let n = 0, z = 0;
        for (let i = 0; i < ps.count; i++) if (ps.alive[i]) (n++, (z += ps.pos[i * 3 + 2]));
        return ps.p.direction[2] < -0.9 && n > 0 && z / n < b.grp.worldPosition.z - 700;
      })()`,
      1000,
    ],
  ],
};

const CHECKS = [
  { name: 'typecheck', cmd: ['npx', 'tsc', '--noEmit'], cwd: 'port/web' },
  { name: 'lingo-unit', cmd: ['npx', 'tsx', 'src/lingo/test.ts'], cwd: 'port/web' },
  { name: 'runtime-unit', cmd: ['node', 'port/tools/unit-tests.mjs', APP] },
  // On the fixture, as the seed's Lobbyist with its session (the server requires one).
  { name: 'multiuser', cmd: ['npx', 'tsx', '../tools/multiuser-test.mts', String(SERVER_PORT), ...(live ? [] : ['lobbytest@home.lan', 'rage2005', 'Lobbyist'])], cwd: 'port/web' },
  // Direct (WebRTC) connections: the switch and a fall back mid-stream lose and reorder nothing; ?p2p=relay, ?p2p=fail.
  { name: 'multiuser-p2p', cmd: ['node', 'port/tools/p2p-test.mjs', APP] },
  { name: 'physics-trace', cmd: ['node', 'port/tools/physics-trace.mjs', String(SERVER_PORT), APP], slow: true },
  { name: 'check3d', cmd: ['node', 'port/tools/check3d.mjs', APP], slow: true },
  // The production build served by the game server alone (APP_DIR, no Vite): loader to Training, compression, caching (~30 s).
  { name: 'prod-build', cmd: ['node', 'port/tools/prod-test.mjs'], slow: true },
  // The arena's weapons against the original in dirplayer, tick by tick (11 scenarios, ~12 min).
  { name: 'weapon-trace', cmd: ['node', 'port/tools/weapon-trace.mjs', `--server=${SERVER_PORT}`, `--app=${APP}`], slow: true, full: true, timeout: 2400000 },
  { name: 'robots-trace', cmd: ['node', 'port/tools/robots-trace.mjs', `--server=${SERVER_PORT}`, `--app=${APP}`], slow: true, full: true, timeout: 2400000 },
  {
    name: 'loader-to-login',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_' && p.frameLabel === 'create'`, 15000],
      ['wait', 800],
      ['shot', 'login-create'],
    ],
  },
  {
    // An email address wider than the login screen's box (#59): the box scrolls it by
    // cutting its front off the field's text, which logging in used to read.
    name: 'login-long-email',
    url: '/game.html',
    setup: () => ensureAccount(LONG_EMAIL, LONG_PASSWORD, 'Longmail'),
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ['click', 310, 148],
      ['expect', 'login tab', `p.frameLabel === 'login'`],
      ['click', 400, 222],
      ['type', LONG_EMAIL],
      ['expect', 'the box shows the address scrolled', `p.member('username_box').text !== '${LONG_EMAIL}'`, 2000],
      ['click', 400, 260],
      ['type', LONG_PASSWORD],
      ['click', 475, 309],
      ['expect', 'logged in with the whole address and password', `p.member('robotname1').text === 'Longmail'`, 15000],
    ],
  },
  {
    // Deleting in the login's fields (#64, #65): Backspace in the password field deletes star
    // after star (setting the text kept the caret past its end), and in the email box
    // deletes the selection Tab makes (the box deleted its own stale copy of it).
    name: 'login-field-delete',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_' && p.frameLabel === 'create'`, 15000],
      ['wait', 500],
      ['click', 400, 222],
      ['type', 'someone@example.com'],
      ['key', 'Backspace'],
      ['key', 'Backspace'],
      ['key', 'Backspace'],
      ['expect', 'the email box deletes', `p.member('username_box').text === 'someone@example.'`, 2000],
      ['click', 400, 260],
      ['type', 'abcde'],
      ['key', 'Backspace'],
      ['key', 'Backspace'],
      ['key', 'Backspace'],
      ['type', 'XY'],
      ['expect', 'the password field deletes star after star', `p.sprites[p.keyboardFocusSprite].member.text === '****' && p.member('visiblePassword').text === 'abXY'`, 2000],
      ['key', 'Tab'],
      ['expect', 'Tab selects the email', `p.sprites[p.keyboardFocusSprite].member === p.member('username_box') && p.selEnd - p.selStart === 16`, 2000],
      ['key', 'Backspace'],
      ['type', 'new@example.com'],
      ['expect', 'Backspace deletes the selection', `p.member('username_box').text === 'new@example.com'`, 2000],
      ['expect', 'the mouse and keyboard never make the touch keyboard\'s input', `!p.el.querySelector('input') && !p.el.style.transform`, 500],
    ],
  },
  {
    // Typing on a touch screen (a phone, landscape): a tap on a field focuses a hidden
    // input, which opens the on-screen keyboard; its text, key presses (not doubled),
    // Android's keyless input (keydown 229, composition), and Gboard's Backspace and Enter
    // (key events with no code) reach the fields'
    // scripts as typed keys; the keyboard follows the focus and closes when the field goes;
    // the stage moves up when the keyboard would cover the field.
    name: 'touch-text',
    url: '/game.html',
    mobile: true,
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ['tap', 310, 148],
      ['expect', 'login tab', `p.frameLabel === 'login'`],
      ['tap', 400, 222],
      ['expect', 'a tap on the email box opens an email keyboard', `p.keyboardFocusSprite === 8 && document.activeElement === p.el.querySelector('input') && document.activeElement.inputMode === 'email'`, 2000],
      ['insert', 'tester@home'],
      ['type', '.lam'],
      ['key', 'Backspace'],
      ['insert', 'n'],
      ['expect', 'inserted text and key presses each typed once', `p.member('username_box').text === 'tester@home.lan'`, 2000],
      // Gboard's Enter (as recorded on a real phone, like its Backspace below): a key event with no code.
      ['eval', `(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
        document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true })); return 1; })()`],
      ['expect', "Enter runs the box's RETURN: the password field takes the focus, with a password keyboard", `p.keyboardFocusSprite === 13 && document.activeElement?.type === 'password'`, 2000],
      ['compose', 'rage'],
      ['eval', `(() => { const el = document.activeElement; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true }));
        el.value = el.value.slice(0, -1); el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true }));
        el.value += 'e2005'; el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'e2005', bubbles: true })); return 1; })()`],
      ['expect', "Android's keyless typing, composition and Backspace reach the password's stars", `p.sprite(13).member.text === '********' && p.member('visiblePassword').text === 'rage2005' && !p.keysDown.size`, 2000],
      ['eval', `(() => { window.__vv = Object.getOwnPropertyDescriptor(window, 'visualViewport'); const h = innerHeight;
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: { offsetTop: 0, height: h * 0.45, width: innerWidth, scale: 1 } }); return 1; })()`],
      ['expect', 'a keyboard over the field moves the stage up to keep it in sight', `(() => { const r = p.el.getBoundingClientRect(); return r.top < 0 && r.top + p.toPage(0, p.sprite(13).bounds.bottom).y <= innerHeight * 0.45 - 10; })()`, 2000],
      ['eval', `(() => { Object.defineProperty(window, 'visualViewport', window.__vv); return 1; })()`],
      ['expect', 'and back when it goes', `!p.el.style.transform`, 2000],
      ['tap', 475, 309],
      ['expect', 'logged in', `p.member('robotname1').text === 'Crusher'`, 15000],
      ['expect', 'the keyboard closes with the fields', `document.activeElement !== p.el.querySelector('input')`, 2000],
      ['tapAt', `(() => { const s = p.sprites.find((s) => s.scriptInstanceList.some((b) => b.constructor.name === 'Newbtn')); const b = s.bounds; return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`],
      ['expect', "NEW's script gives the robot name field the focus on the release: the keyboard opens", `p.keyboardFocusSprite === 25 && document.activeElement === p.el.querySelector('input') && document.activeElement.type === 'text'`, 2000],
      ['insert', 'Tapper'],
      ['expect', 'and types into it', `p.sprite(25).member.text === 'Tapper'`, 2000],
      ['eval', `(() => { for (let i = 0; i < 2; i++) { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
        document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', keyCode: 8, bubbles: true })); } return 1; })()`],
      ['expect', "Gboard's Backspace (a key event with no code) deletes", `p.sprite(25).member.text === 'Tapp'`, 2000],
      ['tap', 100, 500],
      ['expect', 'a tap off the field closes the keyboard', `document.activeElement !== p.el.querySelector('input')`, 2000],
    ],
  },
  {
    // A paint job survives a reload (#60): the map is painted with every colour of the
    // Paintshop's palette (codes 128-159 among them, which went as '?') and up to its
    // right edge, saved by the TRAINING door, then loaded in a new tab.
    name: 'garage-map-reload',
    url: '/game.html',
    setup: saveCrusherMap,
    teardown: restoreCrusherMap,
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 175, 15],
      ['expect', 'paintshop opens', `p.frameLabel === 'paint'`, 3000],
      ['wait', 1500],
      [
        'eval',
        `(() => {
          const px = (im) => { const a = []; for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) { const c = im.getPixel(x, y); a.push(typeof c === 'number' ? c : c.paletteIndex(im.palette)); } return a; };
          const s = p.sprites.find((s) => s?.scriptInstanceList.some((b) => b.constructor.name === 'PaletteBehavior'));
          const pim = s.member.image, im = p.member('map1A').image, w = im.width, h = im.height;
          const sw = [];
          for (let y = 4; y < pim.height; y += 9) for (let x = 4; x < pim.width; x += 8) { const c = pim.getPixel(x, y); sw.push(typeof c === 'number' ? c : c.paletteIndex(im.palette)); }
          // bands of every swatch, runs of different lengths, and a column at the right edge
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.setPixel(x, y, sw[(Math.floor(x / (3 + (y % 5))) + y) % sw.length]);
          for (let y = 0; y < h; y++) im.setPixel(w - 1, y, sw[(y * 7) % sw.length]);
          localStorage.setItem('regress-map', JSON.stringify(px(im)));
          return 1;
        })()`,
      ],
      ['click', 60, 15],
      ['expect', 'back in the workshop', `p.frameLabel === 'build'`, 4000],
      ['wait', 1500],
      ['click', 731, 501],
      ['expect', 'the TRAINING door saves the robot', `p.movie?.name === 'arena104'`, 20000],
      ['wait', 2000],
      ['tab', 'reload', '/game.html'],
      ...KEPT_TO_GARAGE,
      [
        'expect',
        'the paint map comes back pixel for pixel',
        `(() => { const px = (im) => { const a = []; for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) { const c = im.getPixel(x, y); a.push(typeof c === 'number' ? c : c.paletteIndex(im.palette)); } return a; }; const want = JSON.parse(localStorage.getItem('regress-map')); const got = px(p.member('map1A').image); return want.length === got.length && want.every((c, i) => c === got[i]); })()`,
        5000,
      ],
    ],
  },
  {
    name: 'login-robot-list',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...LOGIN,
      ['click', 300, 235],
      ['expect', 'robot selected', `p.globals.gLobby.getaProp(sym('selectedid')) === 1`],
      ['wait', 500],
      ['shot', 'robot-list-selected'],
      ['click', 350, 153],
      ['expect', 'settings tab', `p.frameLabel === 'settings'`],
      ['eval', `window.__chat = Number(p.globals.gCHat)`],
      ['click', 300, 237],
      ['expect', 'chat toggled', `Number(p.globals.gCHat) === 1 - window.__chat`],
    ],
  },
  {
    // The remembered email (gameFixes.scrollText, #67): the login screen fills the email
    // box after its behavior read the empty field, so the first key typed replaced the
    // address, and logging in without retyping it sent no email.
    name: 'login-remembered-email',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['eval', `localStorage.setItem('rr-pref:robotrageemail1', 'tester@home.lan')`],
      ['tab', 'remembered', '/game.html'],
      ['expect', 'the login tab opens with the remembered email', `p.movie.name === 'login013_' && p.frameLabel === 'login' && p.member('username_box').text === 'tester@home.lan'`, 15000],
      ['wait', 500],
      ['click', 480, 222],
      ['key', 'Backspace'],
      ['expect', 'Backspace deletes one character of the remembered email', `p.member('username_box').text === 'tester@home.la'`, 2000],
      ['type', 'nx'],
      ['expect', 'typing adds to it', `p.member('username_box').text === 'tester@home.lanx'`, 2000],
      ['key', 'Backspace'],
      ['click', 400, 260],
      ['type', 'rage2005'],
      ['click', 475, 309],
      ['expect', 'logs in with it', `p.member('robotname1').text === 'Crusher'`, 15000],
    ],
  },
  {
    // Staying logged in (gameFixes.keepLogin, #66): a login is kept in the browser, so a
    // reload goes straight to the robot list; QUIT forgets it, a dead session is
    // forgotten, and ?quirks=keeplogin keeps nothing.
    name: 'login-keep',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...LOGIN,
      ['expect', 'the login is kept', `JSON.parse(${KEPT}).email === 'tester@home.lan'`],
      ['tab', 'reload', '/game.html'],
      ['eval', LABEL_LOG],
      ['expect', 'a reload goes straight to the robot list', `p.movie.name === 'login013_' && p.member('robotname1').text === 'Crusher' && p.globals.gMyEmail === 'tester@home.lan'`, 15000],
      ['expect', 'never showing the login screen on the way', `window.__labels.has('listrobots') && !window.__labels.has('login')`],
      ['click', 690, 553],
      ['expect', 'QUIT logs out and forgets the login', `p.frameLabel === 'login' && !${KEPT} && p.member('username_box').text === 'tester@home.lan'`, 5000],
      ['tab', 'after-quit', '/game.html'],
      ['expect', 'login movie running', `p.movie.name === 'login013_' && p.frameLabel === 'login'`, 15000],
      ['wait', 1500],
      ['expect', 'after QUIT a reload asks to log in', `p.frameLabel === 'login'`],
      ['eval', `localStorage.setItem('rr-login', JSON.stringify({ sid: 'expired', id: 1001, email: 'tester@home.lan' }))`],
      ['tab', 'dead', '/game.html'],
      ['expect', 'a dead session is forgotten and the login screen stays', `p.movie.name === 'login013_' && !${KEPT}`, 15000],
      ['wait', 1000],
      ['expect', 'still on the login screen, with no message', `p.frameLabel === 'login' && p.member('gcom_STATE').text === ''`],
      ['tab', 'quirk', '/game.html?quirks=keeplogin'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ['expect', 'the email is still remembered', `p.frameLabel === 'login' && p.member('username_box').text === 'tester@home.lan'`],
      ['click', 400, 260],
      ['type', 'rage2005'],
      ['click', 475, 309],
      ['expect', 'robot list loaded', `p.member('robotname1').text === 'Crusher'`, 15000],
      ['expect', 'with ?quirks=keeplogin nothing is kept', `!${KEPT}`],
    ],
  },
  {
    // The player's Settings (settings.ts, settings-panel.ts): a link in the black bar beside
    // the stage, a dialog whose switches apply at once and are kept in the browser, no key
    // reaching the game while it's open, an address flag still deciding for its page, in
    // the arena no link (the page knows it's there) and L keeping the layout too, and
    // Reset to defaults.
    name: 'settings',
    url: '/game.html',
    context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['expect', 'the Settings link sits in the black bar, clear of the stage', `(() => { const r = document.getElementById('settings-link').getBoundingClientRect(); return r.width > 0 && r.left >= p.left + 800 * p.scale; })()`],
      ['clickAt', CENTER_OF('#settings-link')],
      ['expect', 'the dialog opens with the defaults', `document.getElementById('settings').open && ${SETTING('wide')}.checked && !${SETTING('ambient')}.checked && ${SETTING('touch')}.value === 'auto' && !${SETTING('wide')}.disabled`],
      ['eval', `window.__keys = 0; addEventListener('keydown', () => window.__keys++)`],
      ['key', 'KeyA'],
      ['expect', 'no key reaches the game while it is open', `window.__keys === 0 && !p.keysDown.size && document.getElementById('settings').open`],
      ['clickAt', CENTER_OF('#settings [name=ambient]')],
      ['clickAt', CENTER_OF('#settings [name=wide]')],
      ['expect', 'the choices apply at once and are kept', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); const d = await import('/src/director/index.ts'); const s = JSON.parse(localStorage.getItem('rr-settings')); return s.ambient === true && s.wide === false && e.arenaFixes.ambient && !e.arenaView.wide && !d.mutedSounds.has('ambient sound'); })()`],
      ['key', 'Escape'],
      ['expect', 'Escape closes it and gives the keyboard back to the game', `!document.getElementById('settings').open && document.activeElement === p.canvas`],
      ['key', 'Enter'],
      ['expect', 'Enter then goes to the game, not the link', `!document.getElementById('settings').open && window.__keys > 0`],
      ['tab', 'reload', '/game.html'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['expect', 'after a reload the choices hold', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); return !e.arenaView.wide && e.arenaFixes.ambient && e.arenaFixes.flameForward; })()`],
      ['tab', 'address', '/game.html?ambient=0&quirks=flame'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['expect', 'the address decides for its page', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); return !e.arenaFixes.ambient && !e.arenaFixes.flameForward && !e.arenaView.wide; })()`],
      ['clickAt', CENTER_OF('#settings-link')],
      ['expect', 'and the dialog shows those as set by it', `${SETTING('ambient')}.disabled && !${SETTING('ambient')}.checked && ${SETTING('flame')}.disabled && !${SETTING('flame')}.checked && !${SETTING('wide')}.disabled`],
      ['tab', 'arena', '/index.html?parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher'],
      ['expect', 'Training ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['expect', 'the arena takes the kept layout and knows it is the arena (the link hides)', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); return !e.arenaView.wide && document.documentElement.classList.contains('in-arena'); })()`],
      ['key', 'KeyL'],
      ['expect', 'L switches widescreen and keeps it', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); return e.arenaView.wide && JSON.parse(localStorage.getItem('rr-settings')).wide === undefined; })()`],
      ['tab', 'reset', '/game.html'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['clickAt', CENTER_OF('#settings-link')],
      ['expect', 'Reset to defaults is there for the wind still on', `!document.querySelector('#settings .reset').disabled && ${SETTING('ambient')}.checked`],
      ['clickAt', CENTER_OF('#settings .reset')],
      ['expect', 'it puts everything back, saves nothing and greys out', `(async () => { const e = await import('/src/movies/arena104/enhancements.ts'); return localStorage.getItem('rr-settings') === null && !e.arenaFixes.ambient && !${SETTING('ambient')}.checked && document.querySelector('#settings .reset').disabled && document.getElementById('settings').open; })()`],
      ['clickAt', CENTER_OF('#settings [name=direct]')],
      ['expect', 'direct connection off: matches stay on the relay', `(async () => { const m = await import('/src/director/p2p.ts'); return m.p2pSetting() === 'relay' && JSON.parse(localStorage.getItem('rr-settings')).direct === false; })()`],
      ['tab', 'p2p-address', '/game.html?p2p=fail'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['expect', '?p2p=fail still decides for its page', `import('/src/director/p2p.ts').then((m) => m.p2pSetting() === 'fail')`],
    ],
  },
  {
    name: 'garage-preview',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-workshop'],
      ['eval', `p.sprite(6).visible = true`],
      ['expect', 'zoom knob drawn above the rod', `(() => { const o = p.drawOrder().map((s) => s.spriteNum); return o.indexOf(21) > o.indexOf(18); })()`, 1000],
      ['down', 630, 300],
      ['expect', 'dragging the preview grabs the robot', `String(p.sprite(6).getProp('state')) === '#drag'`, 1000],
      ['up', 680, 300],
      ['eval', `window.__zoom = p.sprite(21).locH`],
      ['drag', 631, 425, 671, 425],
      ['expect', 'zoom knob drags', `p.sprite(21).locH > window.__zoom`, 1000],
    ],
  },
  // The garage (factory0604). Screenshots hide the spinning 3D preview (sprite 6): its
  // angle depends on timing. None of these leave through a door, so Crusher's saved
  // data stays as it is (the training door saves it unchanged).
  {
    name: 'garage-paintshop',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 175, 15],
      ['expect', 'paintshop opens', `p.frameLabel === 'paint'`, 3000],
      ['wait', 1500],
      ['eval', `window.__map = () => { const h = {}; for (const i of p.member('map1A').image.indices) h[i] = (h[i] || 0) + 1; return h; }`],
      ['expect', 'paint map is in the map palette (grey = index 178)', `(window.__map()[178] || 0) > 40000`, 1000],
      ['click', 215, 85],
      ['expect', 'palette picks the colour', `p.sprite(25).scriptInstanceList[0].foreColor.css === 'rgb(203,50,50)'`, 1000],
      ['click', 82, 142],
      ['click', 150, 450],
      ['expect', 'bucket fills the map', `(window.__map()[167] || 0) > 40000`, 1000],
      ['expect', 'painting marks the map to be saved', `p.globals.gUserData.getaProp(sym('propertyList')).getaProp(sym('saveMap')) === 1`, 500],
      ['click', 173, 82],
      ['expect', 'grid shows the chassis outline', `p.sprite(38).visible && p.sprite(38).member.name === 'ram 1'`, 1000],
      ['wait', 500],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-paintshop'],
      ['eval', `p.sprite(6).visible = true`],
      ['key', 'z'],
      ['expect', 'z undoes the fill', `(window.__map()[178] || 0) > 40000`, 1000],
    ],
  },
  {
    name: 'garage-buy',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 280, 15],
      ['expect', 'buy room opens, purchase box hidden', `p.frame === 101 && !p.sprite(313).visible`, 4000],
      ['wait', 1500],
      ['click', 80, 234],
      ['expect', 'Chassis category opens its first page', `p.frame === 104`, 3000],
      ['expect', 'its 3D wireframe is shown', `p.member('robotpre').model.count > 0`, 3000],
      ['click', 290, 495],
      ['expect', 'too few credits: the thanks box says so', `p.sprite(79).visible && /enough credits/.test(p.sprite(82).member.text)`, 2000],
      ['wait', 500],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-buy-nocredits'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 285, 429],
      ['click', 80, 219],
      ['click', 80, 309],
      ['expect', 'a release on the list opens that part (mouseUp goes under the pointer)', `p.frame === 151`, 3000],
    ],
  },
  {
    // Super weapons for credits (the maintainer; factory0604/enhancements.ts): the Super Weapons
    // pages sell each weapon for its price and each pack (7 parts) for 2100. Crusher gets
    // its 5000 credits from the server's admin grant (paid as the robot loads), and the
    // server accepts the purchases when they're saved; Crusher is put back afterwards.
    name: 'garage-super-credits',
    url: '/game.html',
    setup: () => grantCrusher(5000),
    teardown: restoreCrusher,
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 280, 15],
      ['expect', 'buy room opens', `p.frame === 101`, 4000],
      ['wait', 1500],
      ['expect', 'the granted credits arrived with the robot', `p.globals.gUserData.getaProp('propertyList').getaProp('money') === 5000`, 1000],
      ['clickAt', `(() => { const b = p.sprite(28).bounds; return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`],
      ['expect', 'the Super Pack 2 ad leads to its page: nothing bought, no payment box', `p.frame === 159 && p.globals.gUserData.getaProp('propertyList').getaProp('money') === 5000 && !p.sprite(313).visible && !p.sprite(79).visible`, 3000],
      ['wait', 500],
      ['click', 90, 309],
      ['expect', 'Laser Cannon page', `p.frame === 151`, 3000],
      ['expect', 'its description gives the green credit price, the button is the regular BUY NOW!', `p.sprite(43).member.text.includes('Price: 320 credits') && !p.sprite(43).member.text.includes('Sale value') && p.sprite(50).member.name === 'buy btn' && p.sprite(51).member.text === ''`, 2000],
      ['wait', 800],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-super-weapon-page'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 295, 491],
      ['expect', 'bought: in the inventory, 320 credits less, thanks box', `(() => { const pl = p.globals.gUserData.getaProp('propertyList'); return pl.getaProp('money') === 4680 && pl.getaProp('inventory').getPos(sym('v3')) > 0 && p.sprite(79).visible && /Laser Cannon/.test(p.sprite(82).member.text); })()`, 2000],
      ['click', 285, 429],
      ['click', 90, 324],
      ['expect', 'Super Pack 1 page, priced 2 100', `p.frame === 152 && p.sprite(43).member.text.includes('Price: 2 100 credits')`, 3000],
      ['wait', 800],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-super-pack-page'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 295, 491],
      ['expect', 'pack bought: its 7 parts in the inventory, 2100 credits less', `(() => { const pl = p.globals.gUserData.getaProp('propertyList'); const inv = pl.getaProp('inventory'); return pl.getaProp('money') === 2580 && ['v1', 'v9', 'v4', 'v16', 'v17', 'b3'].every((x) => inv.getPos(sym(x)) > 0) && inv.count === 8; })()`, 2000],
      ['wait', 300],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-super-pack-bought'],
      ['eval', `p.sprite(6).visible = true`],
      // Saved as the garage saves (setrobot with economy=1): the server keeps it all.
      ['eval', SAVE_ROBOT],
      ['expect', 'the server accepts the purchases (2580 credits kept)', `/#err: 0/.test(window.__saved) && window.__saved.includes('#money: 2580]')`, 5000],
      // 100 credits the server never gave (as the arena adds a prize for rounds the
      // opponent never confirmed), saved through the game's own RobotWarsSend: the
      // server keeps 2580 and the client takes it back (gameFixes.economy), in step
      // with MrDoktor.
      ['eval', `(async () => { const L = await import('/src/lingo/index.ts'); const net = await import('/src/movies/robotwars/s019-net-lingo.ts');
        const g = p.globals; const pl = g.gUserData.getaProp(sym('propertyList')); pl.setaProp(sym('money'), 2680); pl.setaProp(sym('info1'), 1112 - 2680);
        p.sprite(1).scriptInstanceList.find((i) => i.makedoktor).makedoktor();
        const info = new L.LPropList(); info.addProp('action', 'setrobot'); info.addProp('proplist', L.lingoString(pl));
        net.RobotWarsSend(L.lingoString(g.gVersionList.getaProp(sym('mainasp')).getaProp(sym('version'))), info); return 1; })()`],
      ['expect', 'the client takes back the money the server kept, info1 and MrDoktor in step', `(() => { const pl = p.globals.gUserData.getaProp(sym('propertyList'));
        const before = p.globals.gDoktor; p.sprite(1).scriptInstanceList.find((i) => i.usedoktor).usedoktor();
        const now = p.globals.gUserData.getaProp(sym('propertyList'));
        return now === pl && now.getaProp(sym('money')) === 2580 && now.getaProp(sym('info1')) === 1112 - 2580 && p.globals.gDoktor === before; })()`, 5000],
    ],
  },
  {
    name: 'garage-parts-sell',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['eval', `window.__pl = () => p.globals.gUserData.getaProp(sym('propertyList'))`],
      ['click', 360, 449],
      ['expect', 'Remove puts the plow in the inventory', `window.__pl().getaProp(sym('inventory')).count === 1 && p.sprite(147).member.name !== 'removebtn'`, 2000],
      ['wait', 500],
      ['click', 390, 15],
      ['expect', 'sell room opens', `p.frameLabel === 'sell'`, 4000],
      ['wait', 1500],
      ['click', 220, 110],
      ['expect', 'the part gets its sell box', `p.sprite(350).member.name === 'v6 sell' && p.sprite(351).member.name === 'sell btn'`, 3000],
      ['wait', 800],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-sell-plow'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 60, 15],
      ['expect', 'back in the workshop', `p.frameLabel === 'build'`, 4000],
      ['wait', 1500],
      ['click', 82, 145],
      ['expect', 'Use this part installs it at the back', `window.__pl().getaProp(sym('robotDescription')).getaProp(sym('vapen')).count === 2 && window.__pl().getaProp(sym('robotDescription')).getaProp(sym('wpnPos')).getAt(2) === sym('b')`, 2000],
    ],
  },
  {
    // Paint map saves carry the session (gameFixes.mapSession, docs/port-issues.md #57):
    // the fixture refuses session-less ones (MAP_REQUIRE_SESSION=1). Entering the
    // paintshop marks the map to be saved; the TRAINING door saves the robot, then the
    // map (setrobotmap, watched in the page's fetch). With ?quirks=mapsession the map
    // goes without the session and is refused.
    name: 'garage-map-session',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['eval', MAP_SAVES],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 175, 15],
      ['expect', 'paintshop opens and marks the map to be saved', `p.frameLabel === 'paint' && p.globals.gUserData.getaProp(sym('propertyList')).getaProp(sym('saveMap')) === 1`, 3000],
      ['wait', 1500],
      ['click', 60, 15],
      ['expect', 'back in the workshop', `p.frameLabel === 'build'`, 4000],
      ['wait', 1500],
      ['click', 731, 501],
      ['expect', 'the TRAINING door saves the map with the session, and the server takes it', `p.movie?.name === 'arena104' && window.__maps.length === 1 && window.__maps[0].session && /#err: 0/.test(window.__maps[0].reply)`, 20000],
      // The game's forms and replies are Latin-1 (server/index.mjs): the map's bytes above 127 come back as sent.
      ['eval', STORED_MAP],
      ['expect', 'the server holds the map byte for byte as sent (bytes above 127 too)', `window.__stored.length > 0 && window.__stored === window.__maps[0].map && /[\\x80-\\xff]/.test(window.__stored)`, 3000],
      ['tab', 'nosession', '/game.html?quirks=mapsession'],
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['eval', MAP_SAVES],
      ...KEPT_TO_GARAGE,
      ['click', 175, 15],
      ['expect', 'paintshop opens', `p.frameLabel === 'paint'`, 3000],
      ['wait', 1500],
      ['click', 60, 15],
      ['expect', 'back in the workshop', `p.frameLabel === 'build'`, 4000],
      ['wait', 1500],
      ['click', 731, 501],
      ['expect', 'with ?quirks=mapsession the map goes without the session, and the server refuses it', `p.movie?.name === 'arena104' && window.__maps.length === 1 && !window.__maps[0].session && /#err: -1/.test(window.__maps[0].reply)`, 20000],
    ],
  },
  {
    // The button click on a touch screen (gameFixes.touchClick): the TRAINING door's
    // release opens the doors, which stops every sound channel; a finger's release comes
    // at once, so the click played on a channel was cut before it could be heard. In
    // touch mode it plays outside the channels and is heard to its end.
    name: 'garage-touch-click',
    url: '/game.html',
    mobile: true,
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ['tap', 310, 148],
      ['expect', 'login tab', `p.frameLabel === 'login'`],
      ['tap', 400, 222],
      ['insert', 'tester@home.lan'],
      ['tap', 400, 260],
      ['insert', 'rage2005'],
      ['tap', 475, 309],
      ['expect', 'robot list loaded', `p.member('robotname1').text === 'Crusher'`, 15000],
      ['tap', 300, 235],
      ['tap', 480, 375],
      ['expect', 'garage loaded', `p.movie.name === 'factory0604' && p.frameLabel === 'build'`, 25000],
      ['wait', 1500],
      ['eval', `(() => { window.__clicks = []; const st = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...x) {
        const t = performance.now(); if (this.buffer.duration < 0.2) this.addEventListener('ended', () => window.__clicks.push(performance.now() - t)); return st.apply(this, x); }; return 1; })()`],
      ['tap', 731, 501],
      ['expect', 'a tap on the TRAINING door: its click plays to the end (0.16 s), the doors\' stop notwithstanding', `window.__clicks.length === 1 && window.__clicks[0] > 140`, 3000],
    ],
  },
  {
    name: 'garage-tabs-doors',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 589, 185],
      ['expect', 'STATS tab (through its label) shows the stats', `p.sprite(98).locV === 210 && /Crusher/.test(p.sprite(98).member.text)`, 2000],
      ['click', 730, 192],
      ['expect', 'HIGHSCORE tab loads the list, ranked', `p.sprite(99).locV === 310 && /^1\t/.test(p.member('highscores').text) && /Crusher/.test(p.member('highscores').text)`, 6000],
      ['click', 731, 501],
      ['expect', 'TRAINING door goes to the arena', `p.movie?.name === 'arena104'`, 20000],
    ],
  },
  {
    name: 'training',
    url: '/index.html?layout=original&parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher',
    steps: [
      ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['eval', `window.__y = p.sprite(10).getProp('y')`],
      ['hold', 'ArrowUp', 1500],
      ['expect', 'robot drives forward', `p.sprite(10).getProp('y') !== window.__y`, 2000],
      ['expect', 'no ambient wind', `!Array.from({ length: 8 }, (_, i) => i + 1).some((n) => { const m = window.__sound?.(n)?.member; return m && m.name === 'ambient sound'; })`, 500],
      ['expect', 'with a mouse and keyboard, no touch mode, no touch controls, no full screen button and no manifest', `!document.querySelector('link[rel=manifest]') && !document.getElementById('fullscreen') && !document.documentElement.classList.contains('touch') && !document.getElementById('touch-controls')`, 500],
    ],
  },
  {
    // Touch controls (movies/arena104/touch-controls.ts) on an emulated phone in landscape:
    // up only while Training is played, a button for each weapon with a key (the plough
    // has none), the stick and a fire button held at once drive diagonally and fire, and
    // everything is let go after.
    name: 'training-touch',
    url: '/index.html?parts=r1,h2,ma1,b1,v6,v1,v21&pos=f,b,t&pansar=50&name=Crusher',
    context: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    steps: [
      ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['expect', 'touch mode, the controls up', `document.documentElement.classList.contains('touch') && document.getElementById('touch-controls').classList.contains('up')`, 2000],
      ['expect', 'the full screen button is up (headless Chrome can go full screen)', `document.getElementById('fullscreen').classList.contains('up')`, 2000],
      ['tap', 400, 200],
      ['expect', 'a tap on the game is no request for full screen (only the button is)', `!document.fullscreenElement && document.getElementById('fullscreen').classList.contains('up')`, 1000],
      ['expect', 'buttons for X (Land Mines) and C (Kamikaze Bomb), none for the plough', `(() => { const f = [...document.querySelectorAll('#touch-controls .fire')].map((b) => b.style.display === 'none' ? '' : b.textContent + ' ' + b.getAttribute('aria-label')); return f[0] === '' && f[1] === 'X Land Mines' && f[2] === 'C Kamikaze Bomb'; })()`, 2000],
      ['expect', 'the controls above the control panel', `(() => { const top = p.top + 457 * p.scale; return [...document.querySelectorAll('#touch-controls > div')].every((e) => e.style.display === 'none' || e.getBoundingClientRect().bottom <= top); })()`, 500],
      ['eval', `(() => { window.__xy = [p.sprite(10).getProp('x'), p.sprite(10).getProp('y')]; window.__keys = new Set(); const f = p.virtualKey.bind(p); p.virtualKey = (k, d) => { if (d) window.__keys.add(k); return f(k, d); }; })()`],
      ['touch', [['#touch-controls .stick', 0.3, -0.3], ['#touch-controls .fire[data-key=KeyC]']], 1500],
      ['expect', 'stick up-right and C at once: forward, right and fire pressed', `['ArrowUp', 'ArrowRight', 'KeyC'].every((k) => window.__keys.has(k)) && !window.__keys.has('ArrowLeft') && !window.__keys.has('ArrowDown')`, 500],
      ['expect', 'the robot drove', `Math.hypot(p.sprite(10).getProp('x') - window.__xy[0], p.sprite(10).getProp('y') - window.__xy[1]) > 50`, 500],
      ['expect', 'every key let go', `p.keysDown.size === 0 && p.charsDown.size === 0`, 1000],
      ['touch', [['#touch-controls .cam']], 100],
      ['expect', 'the camera button steps to view 2', `String(p.globals.pNowCam) === '2'`, 1000],
    ],
  },
  {
    // The same on a phone held upright: no prompt to turn it; the 4:3 stage fills the
    // width, the controls sit in the black bar under it and drive, the camera button above it.
    name: 'training-touch-portrait',
    url: '/index.html?parts=r1,h2,ma1,b1,v6,v1,v21&pos=f,b,t&pansar=50&name=Crusher',
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    steps: [
      ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['expect', 'the controls up, nothing over the stage', `document.getElementById('touch-controls').classList.contains('up') && !document.getElementById('rotate')`, 2000],
      ['expect', 'the stick and fire buttons under the stage, the camera button above it', `(() => { const bottom = p.top + 600 * p.scale; return [...document.querySelectorAll('#touch-controls .stick, #touch-controls .fire')].every((e) => e.style.display === 'none' || e.getBoundingClientRect().top >= bottom) && document.querySelector('#touch-controls .cam').getBoundingClientRect().bottom <= p.top; })()`, 500],
      ['eval', `(() => { window.__xy = [p.sprite(10).getProp('x'), p.sprite(10).getProp('y')]; })()`],
      ['touch', [['#touch-controls .stick', 0, -0.3]], 1500],
      ['expect', 'the stick drives', `Math.hypot(p.sprite(10).getProp('x') - window.__xy[0], p.sprite(10).getProp('y') - window.__xy[1]) > 50`, 500],
    ],
  },
  {
    name: 'lobby-entry',
    url: '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress',
    setup: ensureRegressAccount,
    steps: [
      ['expect', 'lobby reached the country list', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['wait', 1000],
      ['shot', 'lobby-countries'],
      // docs/port-issues.md #57 (gameFixes.ircAuth): the server let the nick in (IRC_REQUIRE_SESSION=1) with the login session as PASS.
      ['expect', 'the lobby registered with its session as the IRC password', `String(p.globals.gIRC.pIRCUserPassword) === String(p.globals.gLobby.getaProp(sym('session'))) && p.globals.gIRC.pIRCUserPassword.length > 0`, 1000],
      // docs/port-issues.md #56 (gameFixes.relayAuth): the match listener carries the session, so the server can tell a player leaving.
      ['expect', 'the lobby listens for matches with its session', `String(p.globals.P2PmuInstanceListen?.ws?.url).includes('&sid=' + encodeURIComponent(p.globals.gLobby.getaProp(sym('session'))))`, 5000],
      // gameFixes.robotReply: an error reply to the lobby's getrobotall for its own robot (#err -1, robot 0) leaves it waiting, stats unchanged, no script error.
      ['eval', `(async () => { const d = await import('/src/director/index.ts'); const L = await import('/src/lingo/index.ts'); window.__L = L;
        const fs = p.frameScript; window.__stats = L.lingoString(p.globals.gUserData.getaProp(sym('GameStats')));
        const info = new L.LPropList(); info.addProp(sym('action'), 'getrobotall'); info.addProp(sym('robotid'), 0);
        fs.netId = d.postNetText(L.lingoString(p.globals.gUrl) + 'main.asp', info); fs.pState = sym('waitmyData'); return 1; })()`],
      ['expect', "an error reply to the lobby's own getrobotall leaves it waiting, stats unchanged", `String(p.frameScript.pState) === '#waiting' && window.__L.lingoString(p.globals.gUserData.getaProp(sym('GameStats'))) === window.__stats`, 5000],
      // With the original's empty PASS (?quirks=ircauth) the server refuses the nick; the lobby tries again.
      ['tab', 'nopass', '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress&quirks=ircauth'],
      ['expect', 'with ?quirks=ircauth the nick is refused (Session required)', `p.movie.name === 'lobby060_' && /Session required/.test(p.globals.gIRC?.pLog ?? '')`, 20000],
    ],
  },
  {
    // Changing rooms (docs/port-issues.md #86): the room button's mouseUp (lobby060_ 31)
    // gives sprites 45-52 the plain button image, and 45 is an empty channel on the room
    // screen; the port drew it in the stage's corner until the next frame emptied it.
    name: 'lobby-room-buttons',
    url: '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress',
    setup: ensureRegressAccount,
    steps: [
      ['expect', 'lobby reached the country list', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['wait', 1500],
      ['click', 50, 350],
      ['wait', 2000],
      ['click', 40, 107],
      ['expect', 'in Sweden East', `String(p.globals.gRoom.pRoom) === 'rw11e'`, 5000],
      ['eval', `(() => { const b = p.sprites.flatMap((s) => s.scriptInstanceList).find((i) => i.constructor.name === 'GoToRoomBehavior' && String(i.room) === 's');
        b.mouseDown(); b.mouseUp(); window.__s45 = [p.sprite(45).member?.name ?? '', p.drawOrder().some((s) => s.spriteNum === 45)]; })()`],
      ['expect', 'between frames the button image is on empty sprite 45, which is not drawn', `window.__s45[0] !== '' && window.__s45[1] === false`],
      ['expect', 'and the click takes you to South', `String(p.globals.gRoom.pRoom) === 'rw11s'`, 5000],
    ],
  },
  {
    // Training restarts after a crash (docs/port-issues.md #7): the robot tips into the
    // pit (its own #tip, as the frame script sends on touching the pit) and, 3 s later,
    // Training plays its entry again and the robot drives.
    name: 'training-respawn',
    url: '/index.html?layout=original&parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher',
    steps: [
      ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['eval', `p.sprite(10).scriptInstanceList.find((b) => b.constructor.name === 'RobotBehavior').tip()`],
      ['expect', 'the robot tips into the pit and stops', `String(p.sprite(10).getProp('state')) === '#stop'`, 4000],
      ['expect', 'Training starts again from its entry', `p.frame >= 17 && p.frame <= 19`, 6000],
      ['expect', 'the robot is ready to drive again', `p.frame === 20 && String(p.sprite(10).getProp('state')) === '#move'`, 15000],
    ],
  },
  ...['f', 'b'].map(spearHeadFirst),
  AXE_FORWARD,
  CLAW_FORWARD,
  LASER_FORWARD,
  FLAME_FORWARD,
  SAW_SOUND_LOOPS,
  {
    // The paintshop's grid button with no chassis (#40): it used to fail before toggling.
    name: 'garage-grid-nochassis',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 360, 295],
      ['expect', 'Remove takes the chassis off', `p.globals.gUserData.getaProp(sym('propertyList')).getaProp(sym('robotDescription')).getaProp(sym('ram')).count === 0`, 2000],
      ['click', 175, 15],
      ['expect', 'paintshop opens', `p.frameLabel === 'paint'`, 3000],
      ['wait', 1500],
      ['click', 173, 82],
      ['expect', 'the grid button toggles', `p.sprite(29).member.name === 'GRIDD'`, 1000],
    ],
  },
  {
    // Two players in a lobby room (docs/port-issues.md #29, #31, #28): Regress opens the
    // card of Fresh, a robot that was never saved; Fresh challenges with its first P2P
    // connection made to fail (a bad address), so the two swap server and client;
    // Regress opens the challenger's card by clicking the challenge, accepts with
    // CHALLENGE, and both play the match (Regress fighting the empty robot).
    name: 'lobby-fixes',
    url: '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress&trace',
    setup: ensureFreshRobot,
    slow: true,
    steps: [
      ['expect', 'Regress reached the lobby', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['eval', PING_ERRORS],
      ['wait', 1500],
      ['click', 50, 350],
      ['wait', 2000],
      ['click', 40, 107],
      ['expect', 'Regress in Sweden East', `String(p.globals.gRoom.pRoom) === 'rw11e'`, 5000],
      ['tab', 'fresh', '/lobby-dev.html?email=fresh@home.lan&password=rage2005&robot=Fresh&trace'],
      ['expect', 'Fresh reached the lobby', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['wait', 1500],
      ['click', 50, 350],
      ['wait', 2000],
      ['click', 40, 107],
      ['expect', 'Fresh in Sweden East', `String(p.globals.gRoom.pRoom) === 'rw11e'`, 5000],
      ['use', 'main'],
      ['expect', 'Regress sees Fresh', `/(^|\\r)Fresh\\t/.test(p.member('rvtext').text)`, 10000],
      ['clickAt', LINE_OF('Fresh')],
      ['expect', "the never-saved robot's card opens, with its 3D robot and CHALLENGE", CARD_OF('Fresh') + ` && !!p.member('robot').group('robot')`, 15000],
      ['wait', 1500],
      ['expect', 'its ping went round once, with no pong left over (#70)', `window.__p2pErrors.length === 0`, 1000],
      ['clickAt', LINE_OF('Regress')],
      ['expect', 'another card opens after it', CARD_OF('Regress'), 15000],
      ['use', 'fresh'],
      ['expect', 'Fresh sees Regress', `/(^|\\r)Regress\\t/.test(p.member('rvtext').text)`, 10000],
      ['clickAt', LINE_OF('Regress')],
      ['expect', "Fresh opens Regress's card", CARD_OF('Regress'), 15000],
      ['click', 560, 435],
      ['expect', 'Fresh sends the challenge', `p.frameLabel === 'ChallengeWait'`, 5000],
      ['eval', `p.globals.gopponentdata.setaProp(sym('Userip'), 'nowhere.invalid')`],
      ['use', 'main'],
      ['expect', 'the challenge reaches Regress', `p.globals.ChallengeList.count > 0`, 10000],
      ['clickAt', `(() => { const b = p.sprite(38).bounds; return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; })()`],
      ['expect', "clicking the challenge opens the challenger's card", CARD_OF('Fresh'), 12000],
      ['click', 560, 435],
      ['expect', 'CHALLENGE accepts it', `p.frameLabel === 'ChallengeWait' || p.movie.name === 'arena104'`, 5000],
      ['expect', 'after the swap Regress plays as player 2, against the empty robot', `p.movie.name === 'arena104' && String(p.frameScript?.state) === '#idle' && p.globals.gPlayerNumber === 2 && String(p.sprite(20).getProp('state')) === '#move'`, 60000],
      ['use', 'fresh'],
      ['expect', 'and Fresh as player 1', `p.movie.name === 'arena104' && String(p.frameScript?.state) === '#idle' && p.globals.gPlayerNumber === 1`, 20000],
    ],
  },
  {
    // Screen entries: the door halves (robotwars 263) slide all the way to their closed
    // positions and arrive together, as the original's bytecode does; an earlier
    // translation braked toward x = 0 and snapped halfway (docs/port-issues.md #47).
    // Garage, lobby and arena (the control panel).
    name: 'door-slides',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['eval', DOOR_LOG],
      ['wait', 500],
      ...TO_GARAGE,
      ['expect', 'garage entry: every half slides to its closed position, together', DOORS_CLOSED('factory0604'), 3000],
      ['tab', 'lobby', '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress&trace'],
      ['eval', DOOR_LOG],
      ['expect', 'lobby entry: the same, the bottom buttons too', DOORS_CLOSED('lobby060_'), 30000],
      ['expect', 'lobby entry: no door half or bottom button drawn before its slide (gameFixes.doorButtons)', `(() => { if (window.__doorsShown.length) throw new Error(JSON.stringify(window.__doorsShown.slice(0, 4))); return 1; })()`, 1000],
      ['tab', 'arena', '/index.html?layout=original&parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher'],
      ['expect', 'Training ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['eval', DOOR_LOG],
      ['eval', `p.sprite(10).scriptInstanceList.find((b) => b.constructor.name === 'RobotBehavior').tip()`],
      ['expect', 'arena entry (Training, after a crash restarts it): the control panel slides to its place', DOORS_CLOSED('arena104'), 30000],
    ],
    setup: ensureRegressAccount,
  },
  {
    // A lobby whose connections die (gameFixes.lobbyLost): a phone's browser closes them
    // for a page it keeps in the background, and the browser reports it when the page
    // comes back. The lobby enters again, back into its room, saying the connection was
    // lost; the original stayed on screen dead. ?quirks=lobbylost keeps the original.
    name: 'lobby-connection-lost',
    url: '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress',
    setup: ensureRegressAccount,
    steps: [
      ['expect', 'Regress reached the lobby', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['wait', 1500],
      ['click', 50, 350],
      ['wait', 2000],
      ['click', 40, 107],
      ['expect', 'Regress in Sweden East', `String(p.globals.gRoom.pRoom) === 'rw11e'`, 5000],
      ['eval', `p.globals.gMultiuserInstanceIRC.ws.close(); p.globals.P2PmuInstanceListen.ws.close()`],
      ['expect', 'the lobby enters again, saying the connection was lost', `/connection to the Lobby was lost/.test(p.member('ronline').text)`, 10000],
      ['expect', 'back in its room, connected, listed', `p.frameLabel === 'incountry' && String(p.globals.gRoom.pRoom) === 'rw11e' && p.globals.gMultiuserInstanceIRC?.connected && p.globals.P2PmuInstanceListen?.connected && /(^|\\r)Regress\\t/.test(p.member('rvtext').text)`, 30000],
      // Another robot: the same one would take its lobby nick over.
      ['tab', 'original', '/lobby-dev.html?email=tester@home.lan&password=rage2005&robot=Crusher&quirks=lobbylost'],
      ['expect', 'with ?quirks=lobbylost: the lobby', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000],
      ['wait', 1500],
      ['eval', `p.globals.gMultiuserInstanceIRC.ws.close(); p.globals.P2PmuInstanceListen.ws.close()`],
      ['wait', 4000],
      ['expect', 'with ?quirks=lobbylost: the dead lobby stays', `p.frame >= 10 && !p.globals.gMultiuserInstanceIRC?.connected && !/connection to the Lobby was lost/.test(p.member('ronline').text)`, 1000],
    ],
  },
  { name: 'match-input-delay', match: 'delay', slow: true },
  { name: 'match-start-sync', match: 'sync', slow: true },
  { name: 'match-hidden-tab', match: 'hidden', slow: true },
  { name: 'match-transport', match: 'transport', slow: true },
  { name: 'match-ranked', match: 'ranked', slow: true },
  { name: 'match-background', match: 'background', slow: true },
];

// ------------------------------------------------------------------ setup

/** The suite's own game server's admin token (startFixture); --live servers have none. */
const ADMIN_TOKEN = live ? process.env.ADMIN_TOKEN ?? '' : `regress-${process.pid}`;

/** main.asp on the game server itself (not through the dev server's proxy): the admin grant answers only local, direct requests. */
async function gameAsp(fields) {
  return latin1Post(`http://127.0.0.1:${SERVER_PORT}/api/main.asp`, fields);
}

/** A form post and its reply in Latin-1, as the game sends and reads them (paint maps have bytes above 127). */
async function latin1Post(url, fields) {
  const enc = (v) => String(v).replace(/[^A-Za-z0-9*._-]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  const body = Object.entries(fields).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return Buffer.from(await r.arrayBuffer()).toString('latin1');
}

let crusherMap;
/** Crusher's paint map as the server holds it (garage-map-reload repaints it; restoreCrusherMap puts it back). */
async function saveCrusherMap() {
  const sid = JSON.parse(lingoField(await mainAsp({ action: 'loginmember', membername: 'tester@home.lan', password: 'rage2005' }), 'sid'));
  crusherMap = { sid, map: await mainAsp({ action: 'getrobotmap', robotid: 1003, sessionid: sid }) };
}
async function restoreCrusherMap() {
  const r = await mainAsp({ action: 'setrobotmap', robotid: 1003, robotname: 'Crusher', sessionid: crusherMap.sid, map: crusherMap.map });
  if (!/#err: 0/.test(r)) throw new Error(`Crusher's map not restored: ${r.slice(0, 80)}`);
}

let crusherSaved;
/** Crusher's saved data, then its money set to `money` with the admin grant (paid when the robot next loads). */
async function grantCrusher(money) {
  const sid = JSON.parse(lingoField(await mainAsp({ action: 'loginmember', membername: 'tester@home.lan', password: 'rage2005' }), 'sid'));
  crusherSaved = { sid, proplist: lingoField(await mainAsp({ action: 'getrobot', robotid: 1003, sessionid: sid }), 'propertyList') };
  const r = await gameAsp({ action: 'admingrant', robot: 1003, amount: money, set: 1, token: ADMIN_TOKEN });
  if (lingoField(r, 'err') !== '0') throw new Error(`admin grant refused (${r}): the server needs ADMIN_TOKEN`);
}

/** Crusher back as it was before grantCrusher: a legal save (everything bought sold back, the old money kept). */
async function restoreCrusher() {
  if (!crusherSaved) return;
  const r = await mainAsp({ action: 'setrobot', robotid: 1003, sessionid: crusherSaved.sid, proplist: crusherSaved.proplist });
  if (lingoField(r, 'err') !== '0') throw new Error(`restoring Crusher failed: ${r}`);
  crusherSaved = undefined;
}

async function mainAsp(fields) {
  return latin1Post(`${APP}/api/main.asp`, fields);
}

/** The value of `#key: ...` in a Lingo property list literal (balanced brackets, quotes skipped). */
function lingoField(text, key) {
  const at = text.search(new RegExp(`#${key}:\\s*`, 'i'));
  if (at < 0) return undefined;
  let i = text.indexOf(':', at) + 1;
  while (text[i] === ' ') i++;
  const start = i;
  let depth = 0;
  let quoted = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  return text.slice(start, i).trim();
}

/** regress@home.lan with a saved robot "Regress" (a copy of Crusher's data and paint map). */
/** An account with one robot, created on the fixture server if it isn't there. */
async function ensureAccount(email, password, robot) {
  let login = await mainAsp({ action: 'loginmember', membername: email, password });
  if (lingoField(login, 'err') !== '0') {
    await mainAsp({ action: 'createmember', membername: email, password });
    login = await mainAsp({ action: 'loginmember', membername: email, password });
  }
  const sid = JSON.parse(lingoField(login, 'sid'));
  if (!new RegExp(`robotname: "${robot}"`).test(await mainAsp({ action: 'getmyrobots', sessionid: sid }))) await mainAsp({ action: 'createrobot', robotname: robot, sessionid: sid });
}

async function ensureRegressAccount() {
  const email = 'regress@home.lan';
  let login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  if (lingoField(login, 'err') !== '0') {
    await mainAsp({ action: 'createmember', membername: email, password: 'rage2005' });
    login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  }
  const sid = JSON.parse(lingoField(login, 'sid'));
  let robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  if (!/robotname: "Regress"/.test(robots)) {
    await mainAsp({ action: 'createrobot', robotname: 'Regress', sessionid: sid });
    robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  }
  const id = Number(robots.match(/#robotid: (\d+), #robotname: "Regress"/)[1]);
  const mine = await mainAsp({ action: 'getrobot', robotid: id, sessionid: sid });
  if (lingoField(mine, 'propertyList') && lingoField(mine, 'propertyList') !== '0') return;
  const a = JSON.parse(lingoField(await mainAsp({ action: 'loginmember', membername: 'tester@home.lan', password: 'rage2005' }), 'sid'));
  const crusher = await mainAsp({ action: 'getrobot', robotid: 1003, sessionid: a });
  const map = await mainAsp({ action: 'getrobotmap', robotid: 1003, sessionid: a });
  await mainAsp({ action: 'setrobot', robotid: id, sessionid: sid, proplist: lingoField(crusher, 'propertyList') });
  await mainAsp({ action: 'setrobotmap', robotid: id, sessionid: sid, map });
}

/**
 * fresh@home.lan with a robot "Fresh" that was never saved (the server holds [] for its
 * property list, docs/port-issues.md #29), reset every run; plus regress@home.lan.
 */
async function ensureFreshRobot() {
  await ensureRegressAccount();
  const email = 'fresh@home.lan';
  let login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  if (lingoField(login, 'err') !== '0') {
    await mainAsp({ action: 'createmember', membername: email, password: 'rage2005' });
    login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  }
  const sid = JSON.parse(lingoField(login, 'sid'));
  let robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  if (!/robotname: "Fresh"/.test(robots)) {
    await mainAsp({ action: 'createrobot', robotname: 'Fresh', sessionid: sid });
    robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  }
  const id = Number(robots.match(/#robotid: (\d+), #robotname: "Fresh"/)[1]);
  await mainAsp({ action: 'setrobot', robotid: id, sessionid: sid, proplist: '[]' });
}

// ------------------------------------------------------------------ running

function run(cmd, cwd, timeout = 600000) {
  return new Promise((done) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd: join(ROOT, cwd ?? '.'), env: process.env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, out: out.replace(/^.*(fnm|Node\.js path|shell profile|our documentation).*\n?/gm, '') });
    });
  });
}

function compare(name, file) {
  const approved = join(APPROVED, `${name}.png`);
  if (approve || !existsSync(approved)) {
    copyFileSync(file, approved);
    return { ok: true, note: approve ? 'approved' : 'recorded (first run)' };
  }
  const py = `
from PIL import Image, ImageChops
import sys
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size: print('size'); sys.exit(0)
d = ImageChops.difference(a, b).convert('L')
bad = sum(1 for v in d.getdata() if v > 24)
d.point(lambda v: 255 if v > 24 else 0).save(sys.argv[3])
print(bad / (a.size[0] * a.size[1]))`;
  return new Promise((done) => {
    execFile('python3', ['-I', '-c', py, approved, file, join(OUT, `${name}-diff.png`)], (err, stdout) => {
      const v = stdout.trim();
      if (err || v === 'size') return done({ ok: false, note: err ? String(err) : 'size differs' });
      const frac = Number(v);
      done({ ok: frac <= 0.005, note: `${(frac * 100).toFixed(2)}% pixels differ` });
    });
  });
}

let browser;
async function flow(check) {
  browser ??= await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--headless=new', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'],
  });
  // check.context: another device (the touch checks emulate a phone; check.mobile is the same phone).
  const ctx = await browser.newContext(
    check.context ??
      (check.mobile ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 }),
  );
  const errors = [];
  // Every tab's console, saved as <run folder>/<check>-console.txt for a failure's story.
  const consoleLog = [];
  const t0 = Date.now();
  // Flows with ['tab', name, url] steps play several tabs (players) at once; the first
  // is "main". Steps act on the current tab, ['use', name] switches (and brings it to
  // the front: only the front tab reliably gets clicks, docs/port-issues.md #34).
  const pages = {};
  let page;
  const openTab = async (name, url) => {
    page = pages[name] = await ctx.newPage();
    const tag = name === 'main' ? '' : `[${name}] `;
    page.on('pageerror', (e) => errors.push(tag + e.message));
    page.on('console', (m) => {
      consoleLog.push(`${((Date.now() - t0) / 1000).toFixed(2)} ${name} ${m.text().slice(0, 400)}`);
      if (m.type() === 'error' && /script error|TypeError|ReferenceError/.test(m.text())) errors.push(tag + m.text().slice(0, 300));
    });
    await page.goto(APP + url);
    await page.waitForFunction(() => window.__player, null, { timeout: 15000 });
    await page.evaluate(async () => {
      const d = await import('/src/director/index.ts');
      window.__sound = d.sound;
      window.__sym = (await import('/src/lingo/index.ts')).sym;
    });
  };
  const lines = [];
  let ok = true;
  try {
    await check.setup?.();
    await openTab('main', check.url);
    const ev = (expr) => page.evaluate(async (e) => {
      // A tab that reloaded (the dev server re-optimising its dependencies when a later
      // tab first loads) lost the helpers openTab gave it.
      if (!window.__sym) window.__sym = (await import('/src/lingo/index.ts')).sym;
      const p = window.__player;
      const sym = window.__sym;
      void p, sym;
      return eval(e);
    }, expr);
    for (const step of check.steps) {
      const [kind, ...a] = step;
      if (kind === 'wait') await sleep(a[0]);
      else if (kind === 'tab') await openTab(a[0], a[1]);
      else if (kind === 'use') {
        page = pages[a[0]];
        await page.bringToFront();
      } else if (kind === 'clickAt') {
        // A click at [x, y] computed in the page (e.g. a name's line in a list).
        const [x, y] = await ev(a[0]);
        await page.mouse.move(x, y);
        await sleep(60);
        await page.mouse.down();
        await sleep(100);
        await page.mouse.up();
        await sleep(250);
      } else if (kind === 'click' || kind === 'down' || kind === 'up') {
        await page.mouse.move(a[0], a[1]);
        await sleep(60);
        if (kind !== 'up') await page.mouse.down();
        if (kind === 'click') await sleep(100);
        if (kind !== 'down') await page.mouse.up();
        await sleep(250);
      } else if (kind === 'tap' || kind === 'tapAt') {
        // A touch tap at a stage point (mobile checks).
        const [x, y] = kind === 'tap' ? a : await ev(a[0]);
        const [px, py] = await ev(`(() => { const r = p.el.getBoundingClientRect(); const q = p.toPage(${x}, ${y}); return [r.left + q.x, r.top + q.y]; })()`);
        await page.touchscreen.tap(px, py);
        await sleep(300);
      } else if (kind === 'insert') await page.keyboard.insertText(a[0]);
      else if (kind === 'compose') {
        // Android's keyboards: keydown "Unidentified" (229), the word composed letter by letter, then committed.
        const cdp = await ctx.newCDPSession(page);
        for (let i = 1; i <= a[0].length; i++) {
          await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true }))`);
          await cdp.send('Input.imeSetComposition', { text: a[0].slice(0, i), selectionStart: i, selectionEnd: i });
          await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Unidentified', keyCode: 229, bubbles: true }))`);
        }
        await cdp.send('Input.insertText', { text: a[0] });
        await cdp.detach();
      } else if (kind === 'drag') {
        await page.mouse.move(a[0], a[1]);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
          await page.mouse.move(a[0] + ((a[2] - a[0]) * i) / 8, a[1] + ((a[3] - a[1]) * i) / 8);
          await sleep(60);
        }
        await page.mouse.up();
        await sleep(250);
      } else if (kind === 'type') await page.keyboard.type(a[0], { delay: 40 });
      else if (kind === 'key') await page.keyboard.press(a[0]);
      else if (kind === 'hold') {
        await page.keyboard.down(a[0]);
        await sleep(a[1]);
        await page.keyboard.up(a[0]);
      } else if (kind === 'touch') {
        // ['touch', [[selector, dx, dy], ...], ms]: a finger on each element (dx, dy: the
        // offset from its centre, in its widths) at once, held, then all lifted.
        const cdp = await ctx.newCDPSession(page);
        const points = [];
        for (const [sel, dx = 0, dy = 0] of a[0]) {
          const r = await page.$eval(sel, (e) => e.getBoundingClientRect().toJSON());
          points.push({ x: r.left + r.width * (0.5 + dx), y: r.top + r.height * (0.5 + dy), id: points.length + 1, radiusX: 5, radiusY: 5, force: 1 });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...points] });
        }
        await sleep(a[1]);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
        await sleep(100);
      } else if (kind === 'tap') {
        await page.touchscreen.tap(a[0], a[1]);
        await sleep(250);
      } else if (kind === 'eval') await ev(a[0]);
      else if (kind === 'expect') {
        const [label, expr, timeout = 5000] = a;
        const until = Date.now() + timeout;
        let got = false;
        let last;
        while (Date.now() < until) {
          try {
            got = !!(await ev(expr));
          } catch (e) {
            last = e.message.split('\n')[0];
          }
          if (got) break;
          await sleep(150);
        }
        lines.push(`  ${got ? 'ok  ' : 'FAIL'} ${label}${got || !last ? '' : ` (${last})`}`);
        if (!got) {
          ok = false;
          await page.screenshot({ path: join(OUT, `${check.name}-failed.png`) });
          break;
        }
      } else if (kind === 'shot') {
        const file = join(OUT, `${a[0]}.png`);
        await page.screenshot({ path: file });
        const r = await compare(a[0], file);
        lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'} screenshot ${a[0]}: ${r.note}`);
        if (!r.ok) ok = false;
      }
    }
  } catch (e) {
    ok = false;
    lines.push(`  FAIL ${e.message.split('\n')[0]}`);
  }
  try {
    await check.teardown?.();
  } catch (e) {
    ok = false;
    lines.push(`  FAIL teardown: ${e.message.split('\n')[0]}`);
  }
  if (errors.length) lines.push(...errors.slice(0, 5).map((e) => `  (page error) ${e}`));
  writeFileSync(join(OUT, `${check.name}-console.txt`), consoleLog.join('\n'));
  // A fresh browser per flow: after several garage and arena pages (WebGL contexts) a
  // long-lived one died mid-run and failed the remaining checks instantly.
  await browser.close().catch(() => {});
  browser = undefined;
  return { ok, out: lines.join('\n') };
}

/** Run arena-match.mjs (a two-tab match) with its STEP and SECONDS settings. */
const BASE_QUERY = process.env.QUERY ?? '';
async function arenaMatch(name, env) {
  // QUERY (extra page settings) given to the suite applies to every match unless a check sets its own.
  // RANKED too, so a ranked check doesn't leak into later matches.
  Object.assign(process.env, { QUERY: BASE_QUERY, RANKED: '', ...env });
  const r = await run(['node', 'port/tools/arena-match.mjs', APP], '.', 150000);
  writeFileSync(join(OUT, `${name}.txt`), r.out);
  return r;
}

/** Both tabs' frame script states on the last state line before the steps. */
function startStates(out) {
  const line = out.split('\n').filter((l) => /^t\d+ /.test(l)).pop() ?? '';
  return [...line.matchAll(/"fs":"#?([^"]*)"/g)].map((m) => m[1]);
}

/** Past the start sync (ready / ready ok): counting down or playing. */
const started = (states) => states.length === 2 && states.every((s) => !['init', 'sendready', 'waitOpponent', 'ping'].includes(s));

async function match(kind) {
  if (kind === 'sync') {
    // The start sync used to hang in about 2 of 7 two-tab matches (docs/port-issues.md #1).
    const lines = [];
    let ok = true;
    for (let i = 1; i <= 4; i++) {
      const r = await arenaMatch(`match-start-sync-${i}`, { SECONDS: '14', STEP: '' });
      const st = startStates(r.out);
      const good = started(st);
      ok &&= good;
      lines.push(`  ${good ? 'ok  ' : 'FAIL'} match ${i} started (states ${st.join(' / ') || 'none'})`);
    }
    return { ok, out: lines.join('\n') };
  }
  if (kind === 'hidden') {
    // A hidden tab keeps playing (docs/port-issues.md #2): the browser stops
    // requestAnimationFrame (simulated here; headless Chrome never hides a tab), the
    // worker's timer runs the frames. 25 s is past the opponent's 20 s silence walkover.
    // Then a stall the worker doesn't cover (a browser throttling everything): 17 s,
    // past the speed-hack check's 15 s, must not strike the robot.
    const hide = (reallyHidden) => `(() => {
      window.__raf = window.__raf ?? window.requestAnimationFrame; window.__rafQ = [];
      window.requestAnimationFrame = (f) => (__rafQ.push(f), 0);
      ${reallyHidden ? "Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });" : ''}
      document.dispatchEvent(new Event('visibilitychange'));
      window.__c0 = __player.frameCycles; return 0; })()`;
    const show = `(() => {
      delete document.hidden; delete document.visibilityState;
      window.requestAnimationFrame = __raf; document.dispatchEvent(new Event('visibilitychange'));
      __rafQ.forEach((f) => __raf(f));
      return 'cycles=' + (__player.frameCycles - __c0); })()`;
    const report = `'state=' + String(__player.frameScript.state) + ' speedgear=' + String(__player.globals.gUserData.getaProp('propertyList').getaProp('speedgear')) + ' result=' + String(__player.globals.gMatchResult)`;
    const steps = [`host|${report}|100`, `client|${report}|100`, `host|${hide(true)}|25000`, `host|${show}|3000`, `host|${report}|100`, `client|${report}|100`, `host|${hide(false)}|17000`, `host|${show}|3000`, `host|${report}|100`, `client|${report}|100`];
    const r = await arenaMatch('match-hidden-tab', { SECONDS: '14', STEP: steps.map((st) => st.replace(/\s*\n\s*/g, ' ')).join('§') });
    const res = [...r.out.matchAll(/^step (?:host|client) .*? => "?([^"\n]*)"?$/gm)].map((m) => m[1]);
    const val = (i) => res[i] ?? '';
    const cycles = Number(val(3).match(/cycles=(\d+)/)?.[1] ?? 0);
    const stillOn = (i) => /state=#?idle /.test(val(i)) && /result=#?nada$/.test(val(i));
    const strikes = (i) => val(i).match(/speedgear=(\S*)/)?.[1];
    // The seed's Rival already has a strike (from this bug, on the test server).
    const noStrike = (i, base) => strikes(i) !== undefined && strikes(i) === strikes(base);
    const checks = [
      [started(startStates(r.out)), `match started`],
      [cycles >= 400, `hidden 25 s: the host ran ${cycles} frames (20 fps: ~500)`],
      [stillOn(4) && stillOn(5), `hidden 25 s: both still playing (${val(4)} | ${val(5)})`],
      [noStrike(4, 0) && noStrike(5, 1), `hidden 25 s: no speed-hack strike`],
      [noStrike(8, 0) && noStrike(9, 1), `stalled 17 s: no speed-hack strike (${val(8)})`],
      [stillOn(8) && stillOn(9), `stalled 17 s: both still playing`],
    ];
    return { ok: checks.every((c) => c[0]), out: checks.map(([good, what]) => `  ${good ? 'ok  ' : 'FAIL'} ${what}`).join('\n') };
  }
  if (kind === 'background') {
    // A phone's browser freezes a page in the background (arenaFixes.awayLoss,
    // server/relay.mjs keepalive). Headless Chrome never hides or freezes a page
    // (Page.setWebLifecycleState does nothing to a visible one), so the client's main
    // thread is blocked instead, hidden as a backgrounded page is: no frame, timer or
    // message runs, as when frozen, while its sockets stay open. 25 s is past the
    // relay's 20 s of silence and the host's 20 s silence walkover. The host claims the
    // round, the relay counts the client as leaving, and the client, back, gives the
    // round up (not claiming it too), which the server records once, for both.
    const card = async (id) => {
      const t = await mainAsp({ action: 'getrobotall', robotid: id });
      const [, win, lose] = t.match(/#Win: (\d+), #lose: (\d+)/).map(Number);
      return { win, lose };
    };
    // kill: the connections die while frozen (the relay socket and the peer connection closed first).
    const freeze = (ms, kill = false) => `client|(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      ${kill ? 'const mu = __player.globals.muInstance; mu.ws.close(); for (const l of mu.links.values()) l.pc?.close();' : ''}
      const t = performance.now(); while (performance.now() - t < ${ms}) {}
      setTimeout(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }, 0); return 'frozen'; })()|4000`;
    const report = (who) => `${who}|'state=' + String(__player.frameScript?.state) + ' result=' + String(__player.globals.gMatchResult) + ' won=' + __player.globals.gWonGames + ' lost=' + __player.globals.gLostGames
      + ' speedgear=' + String(__player.globals.gUserData.getaProp('propertyList').getaProp('speedgear')) + ' away=' + /away too long/.test((() => { try { return __player.member('chat history')?.text ?? ''; } catch { return ''; } })())|100`;
    const checks = [];
    // Frozen 25 s with its connections open; then frozen 6 s while its connections die
    // (the browser reports it on waking): it finds its own connection gone, just back.
    for (const [label, ms, kill] of [['frozen 25 s', 25000, false], ['connections lost while frozen 6 s', 6000, true]]) {
      const before = [await card(1003), await card(1005)];
      const name = kill ? 'match-background-lost' : 'match-background';
      const r = await arenaMatch(name, { RANKED: '1', SECONDS: '14', STEP: [report('client'), freeze(ms, kill), report('host'), report('client')].map((st) => st.replace(/\s*\n\s*/g, ' ')).join('§') });
      const res = [...r.out.matchAll(/^step (?:host|client) .*? => "?([^"\n]*)"?$/gm)].map((m) => m[1]);
      const val = (i) => res[i] ?? '';
      // The round counts once both reports are in, or once the report window has passed.
      let after;
      for (let i = 0; i < 8; i++) {
        after = [await card(1003), await card(1005)];
        if (after[0].win > before[0].win) break;
        await sleep(5000);
      }
      const strikes = (i) => val(i).match(/speedgear=(\S*)/)?.[1];
      checks.push(
        [started(startStates(r.out)), `${label}: match started`],
        [/result=#?walkover won=1 lost=0/.test(val(2)), `${label}: the host took the round as a walkover (${val(2)})`],
        [/result=#?walkover won=0 lost=1/.test(val(3)) && /away=true/.test(val(3)), `${label}: the client, back, gave the round up, saying why (${val(3)})`],
        [strikes(3) !== undefined && strikes(3) === strikes(0), `${label}: no speed-hack strike for the frozen time`],
        [after[0].win === before[0].win + 1 && after[1].lose === before[1].lose + 1 && after[0].lose === before[0].lose && after[1].win === before[1].win,
          `${label}: the server counts it once, for both: Crusher ${before[0].win}-${before[0].lose} -> ${after[0].win}-${after[0].lose}, Rival ${before[1].win}-${before[1].lose} -> ${after[1].win}-${after[1].lose}`],
      );
    }
    return { ok: checks.every((c) => c[0]), out: checks.map(([good, what]) => `  ${good ? 'ok  ' : 'FAIL'} ${what}`).join('\n') };
  }
  if (kind === 'ranked') {
    // Ranked results count once both players report (server/results.mjs): the host's
    // dev page reports the match start (setrwgames, as the lobby does), the client's
    // robot breaks down, both tabs report the round (the loser too: arenaFixes.bothReport)
    // and the server records it once, for both robots.
    const card = async (id) => {
      const t = await mainAsp({ action: 'getrobotall', robotid: id });
      const [, win, lose] = t.match(/#Win: (\d+), #lose: (\d+)/).map(Number);
      return { win, lose };
    };
    const before = [await card(1003), await card(1005)];
    const lose = `client|(() => { for (const n of [10, 20]) { const b = __player.sprite(n).scriptInstanceList.find((x) => x.MakeLoser); if (b && b.robotNumber === 1) { b.MakeLoser(); return n; } } return 0; })()|8000`;
    const r = await arenaMatch('match-ranked', { RANKED: '1', SECONDS: '14', STEP: lose });
    const after = [await card(1003), await card(1005)];
    const playing = started(startStates(r.out));
    const counted = after[0].win === before[0].win + 1 && after[1].lose === before[1].lose + 1 && after[0].lose === before[0].lose && after[1].win === before[1].win;
    const lines = [
      `  ${playing ? 'ok  ' : 'FAIL'} the ranked match started`,
      `  ${counted ? 'ok  ' : 'FAIL'} the round is recorded once, for both: Crusher ${before[0].win}-${before[0].lose} -> ${after[0].win}-${after[0].lose}, Rival ${before[1].win}-${before[1].lose} -> ${after[1].win}-${after[1].lose}`,
    ];
    return { ok: playing && counted, out: lines.join('\n') };
  }
  if (kind === 'transport') {
    // Matches go over a direct WebRTC DataChannel between the tabs (the relay only
    // signals); with ?p2p=relay, or with ICE broken (?p2p=fail: no candidates, falls
    // back after 5 s), they stay on the relay and still start and play.
    const info = (who) => `${who}|(() => { const i = __player.globals.muInstance.transportInfo(); return 'transport=' + i.transport + ' (' + i.reason + ') delay=' + Number(__player.globals.gdelay).toFixed(1); })()|200`;
    const lines = [];
    let ok = true;
    for (const [query, want] of [['', 'direct'], ['p2p=relay', 'relay'], ['p2p=fail', 'relay']]) {
      const r = await arenaMatch(`match-transport-${want}${query ? '-' + query.slice(4) : ''}`, { QUERY: query, SECONDS: '14', STEP: `host|0|2000§${info('host')}§${info('client')}` });
      const res = [...r.out.matchAll(/^step (?:host|client) .*? => "([^"\n]*)"$/gm)].map((m) => m[1]);
      const st = startStates(r.out);
      const on = res.length === 2 && res.every((x) => x.startsWith(`transport=${want} `));
      const playing = started(st);
      ok &&= on && playing;
      lines.push(`  ${on ? 'ok  ' : 'FAIL'} ${query ? `?${query}` : 'default'}: both tabs on the ${want} transport (${res.join(' | ') || 'no answer'})`);
      lines.push(`  ${playing ? 'ok  ' : 'FAIL'} ${query ? `?${query}` : 'default'}: the match started (states ${st.join(' / ') || 'none'})`);
    }
    return { ok, out: lines.join('\n') };
  }
  // Read the host's input delay (docs/port-issues.md #36), and that clicks anywhere on
  // the SURRENDER label (205, Background Transparent text with only a locZ behavior)
  // reach the button under it (204), as Adobe's player lets them through (#3).
  const label = `(() => { const b = __player.sprite(205).bounds; let n = 0, hit = 0;
    for (let x = b.left; x < b.right; x += 2) for (let y = b.top; y < b.bottom; y += 2) { n++; if (__player.spriteAt(x, y) === 204) hit++; }
    return 'takes=' + Math.round((100 * hit) / n); })()`.replace(/\s*\n\s*/g, ' ');
  const r = await arenaMatch('match-input-delay', { SECONDS: '14', STEP: `host|0|3000§host|String(Number(__player.globals.gdelay))|300§host|${label}|100` });
  // gdelay can be an integral Lingo float (an LFloat box): Number() unboxes it.
  const m = r.out.match(/step host .*gdelay\)\) => "([^"]*)"/);
  if (!m || m[1] === '' || !Number.isFinite(Number(m[1]))) return { ok: false, out: '  FAIL the match never started (start sync, #1)' };
  const d = Number(m[1]);
  const takes = r.out.match(/=> "takes=(\d+)"/)?.[1];
  const lines = [`  ${d < 5 ? 'ok  ' : 'FAIL'} host input delay ${d} ms`, `  ${takes === '100' ? 'ok  ' : 'FAIL'} clicks anywhere on the SURRENDER label go to the button (${takes}%)`];
  return { ok: d < 5 && takes === '100', out: lines.join('\n') };
}

// ------------------------------------------------------------------ fixture

const children = [];
async function waitFor(url, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`${url} didn't come up`);
}

async function startFixture() {
  const { mkdtempSync, symlinkSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'rr-regress-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'data/db.json'), readFileSync(join(ROOT, 'port/tools/regress-seed.json')));
  mkdirSync(join(dir, 'public'));
  // The game files and dirplayer (for the checks that compare with the original), and
  // a copy of the page (the test server's own symlinked page edited 8090's once).
  symlinkSync(join(ROOT, 'public/game'), join(dir, 'public/game'));
  symlinkSync(join(ROOT, 'public/dirplayer'), join(dir, 'public/dirplayer'));
  copyFileSync(join(ROOT, 'public/index.html'), join(dir, 'public/index.html'));
  // ICE_SERVERS empty: direct matches between the suite's tabs use host candidates, no outside STUN server.
  // ADMIN_TOKEN: the admin grant, for checks that need credits (garage-super-credits).
  // IRC_REQUIRE_SESSION, MAP_REQUIRE_SESSION: as hosted (docker-compose.yml), so the lobby and garage checks run that way.
  const env = { ...process.env, PORT: String(SERVER_PORT), DATA_DIR: join(dir, 'data'), PUBLIC_DIR: join(dir, 'public'), ICE_SERVERS: '', ADMIN_TOKEN, IRC_REQUIRE_SESSION: '1', MAP_REQUIRE_SESSION: '1' };
  children.push(spawn('node', ['server/index.mjs'], { cwd: ROOT, env, stdio: 'ignore' }));
  await waitFor(`http://127.0.0.1:${SERVER_PORT}/game/main.ini`);
  children.push(
    spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], { cwd: join(ROOT, 'port/web'), env: { ...process.env, RR_SERVER: `http://127.0.0.1:${SERVER_PORT}` }, stdio: 'ignore' }),
  );
  await waitFor(`${APP}/game.html`);
  await waitFor(`${APP}/game/main.ini`);
  console.log(`fixture: game server :${SERVER_PORT} (${dir}), dev server ${APP}\n`);
}

function stopFixture() {
  for (const c of children) c.kill('SIGTERM');
}
process.on('exit', stopFixture);
process.on('SIGINT', () => process.exit(130));

const named = (c) => filters.some((f) => c.name.includes(f));
const selected = CHECKS.filter((c) => (!filters.length || named(c)) && !(fast && c.slow) && !(c.full && !full && !named(c)));
if (!live) await startFixture();
let failed = 0;
for (const c of selected) {
  const t0 = Date.now();
  const r = c.cmd ? await run(c.cmd, c.cwd, c.timeout) : c.match ? await match(c.match) : await flow(c);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${c.name} (${secs}s)`);
  if (!r.ok || c.steps || c.match) {
    // A failed command: its last 15 lines, after any FAIL lines above them; all of it
    // goes to <run folder>/<check>.txt.
    const lines = r.out.trim().split('\n');
    const shown = [...lines.slice(0, -15).filter((l) => /^\s*FAIL\b/.test(l)), ...lines.slice(-15)];
    if (c.cmd && !r.ok) {
      writeFileSync(join(OUT, `${c.name}.txt`), r.out);
      shown.push(`(all of it: ${relative(ROOT, join(OUT, `${c.name}.txt`))})`);
    }
    const text = c.cmd && !r.ok ? shown.map((l) => '  ' + l).join('\n') : r.out;
    if (text.trim()) console.log(text);
  }
  if (!r.ok) failed++;
}
await browser?.close();
console.log(failed ? `\n${failed} of ${selected.length} checks failed` : `\nall ${selected.length} checks passed`);
process.exit(failed ? 1 : 0);
