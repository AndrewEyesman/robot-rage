// The port's two improvements to the arena, kept apart from the translated scripts
// and switchable (the original look and timing stay available and testable):
//
// - Widescreen: the 3D view spans the window above the original control panel, at the
//   original's vertical field of view; the panel's frame art is repeated out to the
//   window's sides. L switches between it and the original 4:3 stage, as does the
//   player's Settings dialog (settings.ts; ?layout=original sets it for a page).
// - Smooth drawing: the scripts still run at the movie's 20 frames a second, and the 3D
//   view draws at the display's rate with every node placed between its last two
//   frame-cycle poses (?smooth=0 turns it off).
//
// And two fixes to the original's behaviour, for the maintainer (docs/port-issues.md):
//
// - Input delay: the match measures the ping to delay your own keys by half the round
//   trip, so both players' robots move at the same moment. The original stamps the
//   ping in seconds since midnight but times the pong in milliseconds, so the delay
//   always hit its 300 ms cap and every key took a third of a second. The port times
//   it properly (?quirks=ping restores the original).
// - No ambient wind: matches loop the "ambient sound" member at volume 20; the maintainer
//   asked for it gone (?ambient=1 brings it back).
// - Start sync: the arena alternates between sending "ready" and waiting, a frame each,
//   and player 2 answered the host's "ready" only while waiting. Two tabs in lockstep
//   could miss each other forever. The port answers in both (?quirks=sync restores it).
// - Tab switches: the speed-hack check measured the time a hidden tab spent stopped as
//   one long second, struck the robot for #speedgear and stalled every frame. The player
//   now keeps running while hidden, and a check spanning a tab switch is let off
//   (?quirks=speedgear restores the strike).
// - Training restarts after a crash: falling into the pit or off the roof, or losing
//   all armour, stopped the robot for good (the lose handler only shows it broken), so
//   the player had to leave Training and come back. Three seconds after the crash the
//   port plays Training's entry again, as the garage's door does (?quirks=pit restores
//   the original).
// - Flame thrower: the flames' direction is the x axis of a rotation by the robot's
//   heading, which mirrors it in z: facing up or down the arena the flames shot out of
//   the back, at an angle they went off to the side, while the hit still travels
//   forward. The port sends them along the heading (?quirks=flame restores the
//   original).
// - Ranked results from both players: after each ranked round only the winner reported
//   the result (the host alone for a tie), and the server believed it. Now the loser
//   reports too (and both report ties), so the server counts a round only when both
//   reports agree (server/results.mjs; ?quirks=results restores the original).
// - Coming back from the background: a phone's browser freezes a page it puts in the
//   background (another app, the screen locked), and a match stops dead. After 20 s of
//   silence the opponent's arena takes the round as a walkover, and the relay closes
//   the frozen page's connection as the player leaving (server/relay.mjs). On coming
//   back the original then found the connection gone, asked the server whether it was
//   still reachable (it was) and claimed the round as a walkover too: both players saw
//   a win, and the server, given two claims, counted nothing. Now a page that was frozen
//   for the opponent's 20 s of silence (no frame ran), or that finds its own connection
//   gone while in the background or just back from it, gives the round up as SURRENDER
//   does, with a line in the chat saying why, and reports it lost, confirming the
//   opponent's walkover. A hidden desktop tab keeps playing (above), so neither happens
//   to it while its connection lasts (?quirks=away restores the original).

import { BitmapMember, STAGE_H, STAGE_W, bootHooks, member, mutedSounds, sound, type Player, type Sprite } from '../../director';
import { install3d, Shockwave3dMember, type ViewRect } from '../../director/s3d';
import { changeSetting, onSettingChange, setByAddress, setting } from '../../settings';

const query = new URLSearchParams(location.search);

// Widescreen, smooth drawing, the flames, the wind and Training's restart change only this
// browser's game: the player's Settings (settings.ts) choose them, an address flag still wins.
export const arenaView = {
  wide: setting('wide'),
  smooth: setting('smooth'),
};

const quirks = (query.get('quirks') ?? '').split(',');
export const arenaFixes = {
  pingDelay: !quirks.includes('ping'),
  ambient: setting('ambient'),
  startSync: !quirks.includes('sync'),
  tabSwitch: !quirks.includes('speedgear'),
  trainingRespawn: setting('respawn'),
  flameForward: setting('flame'),
  bothReport: !quirks.includes('results'),
  awayLoss: !quirks.includes('away'),
};
if (!arenaFixes.ambient) mutedSounds.add('ambient sound');
onSettingChange('smooth', (v) => (arenaView.smooth = v));
onSettingChange('respawn', (v) => (arenaFixes.trainingRespawn = v));
onSettingChange('flame', (v) => (arenaFixes.flameForward = v));
onSettingChange('ambient', (v) => {
  // Back from the next match on; turned off, a wind playing now stops.
  arenaFixes.ambient = v;
  if (v) return mutedSounds.delete('ambient sound');
  mutedSounds.add('ambient sound');
  for (let n = 1; n <= 8; n++) if (sound(n).member?.name.toLowerCase() === 'ambient sound') sound(n).stop();
});

/** The opponent's silence before its arena takes the round as a walkover (CheckPing: 20 s). */
export const SILENCE_MS = 20000;
/** How long after the page comes back from the background its own connection's loss counts as the background's. */
const BACK_MS = 10000;

let tabSwitched = false;
/** When the page was last shown again after being hidden or frozen (performance.now()). */
let shownAt = -Infinity;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    tabSwitched = true;
    if (!document.hidden) shownAt = performance.now();
  });
  // Chrome's page lifecycle (a frozen page, a page back from the back/forward cache): as a tab switch.
  document.addEventListener('freeze', () => (tabSwitched = true));
  document.addEventListener('resume', () => {
    tabSwitched = true;
    shownAt = performance.now();
  });
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    tabSwitched = true;
    shownAt = performance.now();
  });
}

/** Whether the page is in the background, or came back from it in the last BACK_MS (arenaFixes.awayLoss). */
export function pageAway(): boolean {
  return document.hidden || performance.now() - shownAt < BACK_MS;
}

/** Whether the tab was hidden or shown since the last call (the speed-hack check's last second). */
export function takeTabSwitch(): boolean {
  const was = tabSwitched || (typeof document !== 'undefined' && document.hidden);
  tabSwitched = false;
  return was;
}

/** The stage's top edge of the control panel: everything above it is the 3D view's. */
export const PANEL_TOP = 457;

const inArena = (p: Player) => p.movie?.name === 'arena104';

/** Widescreen applies in the arena, on a window wider than 4:3. */
const wideNow = (p: Player) => arenaView.wide && inArena(p) && innerWidth / innerHeight > STAGE_W / STAGE_H;

function layout(p: Player) {
  // The page's Settings link keeps off the arena's screen (settings-panel.ts).
  document.documentElement.classList.toggle('in-arena', inArena(p));
  const W = innerWidth;
  const H = innerHeight;
  if (wideNow(p)) {
    // The stage at the window's height, its panel at the bottom, centred.
    p.scale = H / STAGE_H;
    p.left = Math.round((W - STAGE_W * p.scale) / 2);
    p.top = Math.round(H - STAGE_H * p.scale);
  } else {
    // The player's default: the stage fitted to the window.
    p.scale = Math.min(W / STAGE_W, H / STAGE_H);
    p.left = Math.round((W - STAGE_W * p.scale) / 2);
    p.top = Math.round((H - STAGE_H * p.scale) / 2);
  }
  p.sizeCanvas(W, H);
}

/** The arena's 3D view in widescreen: the whole width above the panel. */
function viewRect(s: Sprite, p: Player): ViewRect {
  if (wideNow(p) && s.memberRef instanceof Shockwave3dMember && s.memberRef.name.toLowerCase() === 'arena') {
    return { x: 0, y: 0, w: innerWidth, h: p.top + PANEL_TOP * p.scale };
  }
  const b = s.bounds;
  return { x: p.left + b.left * p.scale, y: p.top + b.top * p.scale, w: (b.right - b.left) * p.scale, h: (b.bottom - b.top) * p.scale };
}

/** Widescreen: the panel's strip of the frame art ("arena1"), repeated beside the stage. */
function drawPanelSides(ctx: CanvasRenderingContext2D, p: Player) {
  if (!wideNow(p)) return;
  const art = member('arena1');
  if (!(art instanceof BitmapMember) || !art.image.width) return;
  const img = art.image.canvas();
  const h = STAGE_H - PANEL_TOP;
  const extra = p.left / p.scale;
  for (let x = -STAGE_W; x > -extra - STAGE_W; x -= STAGE_W) ctx.drawImage(img, 0, PANEL_TOP, STAGE_W, h, x, PANEL_TOP, STAGE_W, h);
  for (let x = STAGE_W; x < STAGE_W + extra; x += STAGE_W) ctx.drawImage(img, 0, PANEL_TOP, STAGE_W, h, x, PANEL_TOP, STAGE_W, h);
}

bootHooks.push((p) => {
  const r3d = install3d();
  r3d.viewRect = viewRect;
  p.layoutHook = layout;
  p.renderHook = (ctx, pl) => {
    r3d.interpolate = arenaView.smooth && inArena(pl);
    drawPanelSides(ctx, pl);
  };
  addEventListener('keydown', (e) => {
    // L, unless a text field has the keyboard (the chat line).
    if (e.code !== 'KeyL' || e.ctrlKey || e.metaKey || e.altKey || !inArena(p) || p.focus) return;
    // Kept as the player's setting, unless the address sets the layout for this page.
    if (setByAddress('wide')) {
      arenaView.wide = !arenaView.wide;
      p.layout();
    } else changeSetting('wide', !arenaView.wide);
  });
  onSettingChange('wide', (v) => {
    arenaView.wide = v;
    p.layout();
  });
  p.layout();
});
