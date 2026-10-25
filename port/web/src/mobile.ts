// The page on phones and tablets: whether this is a touch device, and the shell around
// the stage there. Nothing here changes a desktop session (mouse and keyboard): every
// rule and listener waits for touch mode, which starts only on
//
//   - a touch device: its primary pointer is coarse (a finger), or the first touch
//     event (a laptop's touch screen);
//   - ?touch=1 (forced on, for testing with a mouse) - ?touch=0 never starts it.
//
// In touch mode the page gets the class "touch": no pull-to-refresh or overscroll, no
// long-press callout or text selection, no pinch zoom (game.html's viewport meta covers
// double-tap zoom), and a "turn your phone sideways" prompt over a phone held upright.
// The first tap on a page that isn't already full screen (an installed app is) asks for
// full screen in landscape, where the browser allows it (Android; ?fullscreen=0 doesn't).
// A first tap that doesn't count (the browser refused it) left no other way in, so a small
// button in the window's top left corner asks again; it's up whenever the page could go
// full screen and isn't (never on an iPhone, whose Safari has no full screen for pages).
// The arena's touch controls are in movies/arena104/touch-controls.ts.

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const forced = query.get('touch');

let on = false;
const listeners: (() => void)[] = [];

/** Whether the page is in touch mode (see above). */
export function touchMode(): boolean {
  return on;
}

/** Run `f` when touch mode starts (now, if it has). */
export function onTouchMode(f: () => void) {
  if (on) f();
  else listeners.push(f);
}

function start() {
  if (on) return;
  on = true;
  installShell();
  for (const f of listeners.splice(0)) f();
}

const CSS = `
html.touch, html.touch body { overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
html.touch input, html.touch textarea { -webkit-user-select: text; user-select: text; }
#rotate { display: none; position: fixed; inset: 0; z-index: 20; background: #000; color: #ddd; font: bold 18px sans-serif;
  flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; }
#fullscreen { display: none; position: fixed; left: 6px; top: 6px; z-index: 10; width: 34px; height: 34px; border-radius: 8px; box-sizing: border-box;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); border: 2px solid rgba(255, 255, 255, 0.40); color: rgba(255, 255, 255, 0.85); }
#fullscreen.up { display: flex; }
#rotate .phone { width: 46px; height: 80px; border: 4px solid #ddd; border-radius: 8px; animation: rr-turn 2.4s ease-in-out infinite; }
@keyframes rr-turn { 0%, 25% { transform: rotate(0); } 55%, 100% { transform: rotate(-90deg); } }
/* A phone held upright (its short side under 600 px): a tablet's upright 4:3 stage is big enough to play. */
@media (orientation: portrait) and (max-width: 599px) { html.touch #rotate { display: flex; } }
`;

function installShell() {
  document.documentElement.classList.add('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.innerHTML = '<div class="phone"></div><div>Turn your phone sideways to play</div>';
  document.body.append(rotate);
  const fs = document.createElement('div');
  fs.id = 'fullscreen';
  fs.setAttribute('role', 'button');
  fs.setAttribute('aria-label', 'Full screen');
  fs.innerHTML = '<svg viewBox="0 0 24 24" width="70%" height="70%"><path fill="none" stroke="currentColor" stroke-width="2.4" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
  fs.addEventListener('click', () => enterFullscreen());
  document.body.append(fs);
  const showButton = () => fs.classList.toggle('up', canGoFullscreen());
  document.addEventListener('fullscreenchange', showButton);
  showButton();
  // Linked here, not in game.html: with it a desktop Chrome would offer to install the page.
  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = '/manifest.webmanifest';
  document.head.append(manifest);
  // iOS ignores the viewport's user-scalable=no: its pinch gesture events zoom unless stopped.
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault());
  if (query.get('fullscreen') !== '0') addEventListener('pointerup', goFullscreen);
}

/** Whether the page could go full screen and isn't: not an installed app, not already, and the browser can. */
function canGoFullscreen() {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  return !standalone && !document.fullscreenElement && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

/** Full screen, in landscape where the browser lets a page lock it. */
function enterFullscreen() {
  if (!canGoFullscreen()) return Promise.resolve();
  return document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
}

/** The first tap's try (see the top); the button is there for later ones. */
function goFullscreen() {
  removeEventListener('pointerup', goFullscreen);
  enterFullscreen();
}

if (typeof window !== 'undefined' && forced !== '0') {
  if (forced === '1' || matchMedia('(pointer: coarse)').matches) {
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    addEventListener('touchstart', start, { once: true, capture: true, passive: true });
  }
}
