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
};
if (!arenaFixes.ambient) mutedSounds.add('ambient sound');

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
