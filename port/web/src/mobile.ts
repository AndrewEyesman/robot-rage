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
// double-tap zoom). Either way up works: held upright, the 4:3 stage fills the width
// and the arena's controls sit in the black bar under it.
// Full screen only when asked for: a small button in the window's top left corner, up
// whenever the page could go full screen and isn't (not in an installed app, which is
// already, and never on an iPhone, whose Safari has no full screen for pages).
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
#fullscreen { display: none; position: fixed; left: 6px; top: 6px; z-index: 10; width: 34px; height: 34px; border-radius: 8px; box-sizing: border-box;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.35); border: 2px solid rgba(255, 255, 255, 0.40); color: rgba(255, 255, 255, 0.85); }
#fullscreen.up { display: flex; }
`;

function installShell() {
  document.documentElement.classList.add('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
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
}

/** Whether the page could go full screen and isn't: not an installed app, not already, and the browser can. */
function canGoFullscreen() {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
  return !standalone && !document.fullscreenElement && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

/** Full screen (either way up: the screen isn't locked to landscape). */
function enterFullscreen() {
  if (!canGoFullscreen()) return Promise.resolve();
  return document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

if (typeof window !== 'undefined' && forced !== '0') {
  if (forced === '1' || matchMedia('(pointer: coarse)').matches) {
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    addEventListener('touchstart', start, { once: true, capture: true, passive: true });
  }
}
