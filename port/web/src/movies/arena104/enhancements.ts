// The port's two improvements to the arena, kept apart from the translated scripts
// and switchable (the original look and timing stay available and testable):
//
// - Widescreen: the 3D view spans the window above the original control panel, at the
//   original's vertical field of view; the panel's frame art is repeated out to the
//   window's sides. L switches between it and the original 4:3 stage (also
//   ?layout=original).
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
// - Spear gun: the spear model's head is at its -z but the original flies it along +z,
//   tail first. A gun at the front shot through its own robot and out of the back; a gun
//   at the back (turned round when mounted) shot forward with the head pointing back.
//   The port flies every spear head first and forward, from either mount (?quirks=spear
//   restores the original).
// - Power axe at the front: the axe is modelled to sit at the back (mounting there turns
//   it round) and swing forward over the robot; at the front or on top it swung
//   backwards, over its own robot, while the hit is checked in front of the robot. The
//   port swings it forward from every mount (?quirks=axe restores the original).
// - Ranked results from both players: after each ranked round only the winner reported
//   the result (the host alone for a tie), and the server believed it. Now the loser
//   reports too (and both report ties), so the server counts a round only when both
//   reports agree (server/results.mjs; ?quirks=results restores the original).

import { BitmapMember, STAGE_H, STAGE_W, bootHooks, member, mutedSounds, type Player, type Sprite } from '../../director';
import { install3d, Shockwave3dMember, type ViewRect } from '../../director/s3d';

const query = new URLSearchParams(location.search);

export const arenaView = {
  wide: query.get('layout') !== 'original',
  smooth: query.get('smooth') !== '0',
};

const quirks = (query.get('quirks') ?? '').split(',');
export const arenaFixes = {
  pingDelay: !quirks.includes('ping'),
  ambient: query.get('ambient') === '1',
  startSync: !quirks.includes('sync'),
  tabSwitch: !quirks.includes('speedgear'),
  trainingRespawn: !quirks.includes('pit'),
  spearForward: !quirks.includes('spear'),
  axeForward: !quirks.includes('axe'),
  bothReport: !quirks.includes('results'),
};
if (!arenaFixes.ambient) mutedSounds.add('ambient sound');

let tabSwitched = false;
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => (tabSwitched = true));

/** Whether the tab was hidden or shown since the last call (the speed-hack check's last second). */
export function takeTabSwitch(): boolean {
  const was = tabSwitched || (typeof document !== 'undefined' && document.hidden);
  tabSwitched = false;
  return was;
}

/** The stage's top edge of the control panel: everything above it is the 3D view's. */
const PANEL_TOP = 457;

const inArena = (p: Player) => p.movie?.name === 'arena104';

/** Widescreen applies in the arena, on a window wider than 4:3. */
const wideNow = (p: Player) => arenaView.wide && inArena(p) && innerWidth / innerHeight > STAGE_W / STAGE_H;

function layout(p: Player) {
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
    arenaView.wide = !arenaView.wide;
    p.layout();
  });
  p.layout();
});
