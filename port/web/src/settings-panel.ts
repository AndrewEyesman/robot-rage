// game.html's Settings dialog: the player's own settings (settings.ts), the switches that
// change only this browser's game (the direct connection aside, which says so). It opens from a small "Settings" link beside Privacy,
// in the black bars beside (or under) the 4:3 stage, never over the game: the link is
// hidden when the window has no bars, and in the arena (the widescreen view and the touch
// controls use the bars there). While the dialog is open the game gets no keys.
// In touch mode (mobile.ts) the bars hold only a small dim gear for it: the credit and
// Privacy move into the dialog's foot, as text in a phone's bars distracted from the game.
// Privacy opens there in a panel over the game, not as a page: an installed app has no
// browser to go back from it in, and the phone's back gesture closes the panel or the
// dialog (a history entry each) instead of leaving the game, which would close the app.

import type { Player } from './director';
import { onTouchMode, touchMode } from './mobile';
import { anySettingChanged, changeSetting, resetSettings, savedSetting, setByAddress, setting, type SettingKey } from './settings';

interface Row {
  key: SettingKey;
  label: string;
  hint: string;
  /** A choice of values instead of a checkbox. */
  options?: [string, string][];
}

const SECTIONS: [string, Row[]][] = [
  [
    'Display',
    [
      { key: 'wide', label: 'Widescreen arena', hint: "The 3D view fills the window's width. L switches it in the arena." },
      { key: 'smooth', label: 'Smooth 3D motion', hint: "Draws the arena at your screen's refresh rate." },
      { key: 'flame', label: 'Flames stream forward', hint: 'The flames go where the robot faces. Looks only: hits are the same.' },
    ],
  ],
  ['Sound', [{ key: 'ambient', label: 'Wind in matches', hint: "The original's ambient wind loop." }]],
  [
    'Matches',
    [
      {
        key: 'direct',
        label: 'Direct connection to opponents',
        hint: 'Off: matches go through the server, so opponents never see your IP address, but both of you get a little more lag.',
      },
    ],
  ],
  ['Training', [{ key: 'respawn', label: 'Restart after a crash', hint: 'Three seconds after a fall or losing all armour.' }]],
  ['Login', [{ key: 'keepLogin', label: 'Stay logged in', hint: "Turning it off forgets this browser's login." }]],
  [
    'Controls',
    [
      {
        key: 'touch',
        label: 'Touch controls',
        hint: 'Auto: on a touch screen. From the next page load.',
        options: [
          ['auto', 'Auto'],
          ['on', 'Always'],
          ['off', 'Never'],
        ],
      },
    ],
  ],
];

const CSS = `
#settings-link { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
html.in-arena #settings-link { display: none; }
#settings { width: min(720px, calc(100vw - 32px)); max-height: calc(100dvh - 24px); box-sizing: border-box; padding: 14px 20px 12px; overflow-y: auto; outline: none;
  background: #141414; color: #ddd; border: 1px solid #3a3a3a; border-radius: 6px; font: 13px/1.3 sans-serif; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
#settings::backdrop { background: rgba(0, 0, 0, 0.6); }
#settings header { display: flex; align-items: center; gap: 12px; }
#settings h2 { margin: 0; font-size: 16px; color: #fff; flex: 1; }
#settings .note { margin: 2px 0 0; color: #888; font-size: 12px; }
#settings .cols { columns: 2 280px; column-gap: 32px; }
#settings section { break-inside: avoid; padding-top: 10px; }
#settings h3 { margin: 0 0 2px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a; }
#settings label { display: grid; grid-template-columns: auto 1fr; column-gap: 9px; align-items: start; padding: 4px 0; cursor: pointer; }
#settings label.choice { grid-template-columns: 1fr auto; }
#settings input[type=checkbox] { margin: 2px 0 0; accent-color: #c33; }
#settings select { background: #222; color: #ddd; border: 1px solid #444; border-radius: 3px; font: inherit; padding: 1px 4px; }
#settings .hint { grid-column: 1 / -1; color: #888; font-size: 12px; }
#settings label:has(input[type=checkbox]) .hint { grid-column: 2; }
#settings label.fixed { cursor: default; opacity: 0.55; }
#settings .done, #settings .reset { padding: 4px 14px; background: #2a2a2a; color: #eee; border: 1px solid #555; border-radius: 4px; font: inherit; cursor: pointer; }
#settings .reset { background: none; border-color: #3a3a3a; color: #aaa; }
#settings .done:hover, #settings .reset:hover:enabled { color: #fff; }
#settings .reset:disabled { opacity: 0.4; cursor: default; }
#settings .foot { margin: 12px 0 0; padding-top: 8px; border-top: 1px solid #2a2a2a; color: #777; font-size: 12px; }
#settings .foot a { color: #aaa; }
#privacy-view { width: min(760px, calc(100vw - 24px)); height: calc(100dvh - 24px); box-sizing: border-box; padding: 0; outline: none;
  background: #111; border: 1px solid #3a3a3a; border-radius: 6px; font: 13px/1.3 sans-serif; }
#privacy-view[open] { display: flex; flex-direction: column; }
#privacy-view::backdrop { background: rgba(0, 0, 0, 0.6); }
#privacy-view header { display: flex; justify-content: flex-end; padding: 8px 10px; border-bottom: 1px solid #2a2a2a; }
#privacy-view .done { padding: 4px 14px; background: #2a2a2a; color: #eee; border: 1px solid #555; border-radius: 4px; font: inherit; }
#privacy-view iframe { flex: 1; width: 100%; border: 0; }
html.touch #credit, html.touch #privacy { display: none; }
/* In touch mode: a button like mobile.ts's full screen one, beside the stage's top right corner as that is beside its top left. */
html.touch #links { left: var(--beside-right); top: var(--beside-top); right: auto; bottom: auto; }
html.touch #settings-link { display: flex; width: 34px; height: 34px; border-radius: 8px; box-sizing: border-box; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.35); border: 2px solid rgba(255, 255, 255, 0.25); color: rgba(255, 255, 255, 0.55); }
html.touch.in-arena #settings-link { display: none; }
`;

/** A control changed: save it, and let the reset button know there's something to reset. */
function changed(k: SettingKey, v: boolean | string) {
  changeSetting(k, v as never);
  const reset = document.querySelector<HTMLButtonElement>('#settings .reset');
  if (reset) reset.disabled = !anySettingChanged();
}

// Touch mode's back gesture (see the top): the open dialogs with a history entry, newest last.
const backStack: HTMLDialogElement[] = [];
let ownBacks = 0;

/** showModal, and in touch mode a history entry that the back gesture takes to close it. */
function showModal(d: HTMLDialogElement) {
  d.showModal();
  if (!touchMode()) return;
  history.pushState(null, '');
  backStack.push(d);
}

/** Closed by a button or Escape: take its history entry back off. */
function closedSelf(d: HTMLDialogElement) {
  const i = backStack.lastIndexOf(d);
  if (i < 0) return;
  backStack.splice(i, 1);
  ownBacks++;
  history.back();
}

addEventListener('popstate', () => {
  if (ownBacks) ownBacks--;
  else backStack.pop()?.close();
});

let privacyView: HTMLDialogElement | null = null;

/** The privacy page in a panel over the game (touch mode). */
function openPrivacy() {
  if (!privacyView) {
    const d = (privacyView = document.createElement('dialog'));
    d.id = 'privacy-view';
    d.setAttribute('aria-label', 'Privacy');
    const header = document.createElement('header');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'done';
    done.textContent = 'Done';
    done.addEventListener('click', () => d.close());
    header.append(done);
    const frame = document.createElement('iframe');
    frame.title = 'Privacy';
    frame.src = '/privacy.html';
    d.append(header, frame);
    d.addEventListener('close', () => closedSelf(d));
    document.body.append(d);
  }
  showModal(privacyView);
}

function row(r: Row): HTMLLabelElement {
  const label = document.createElement('label');
  const fixed = setByAddress(r.key);
  const name = document.createElement('span');
  name.textContent = r.label;
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = fixed ? `${r.hint} Set by this page's address.` : r.hint;
  let input: HTMLInputElement | HTMLSelectElement;
  if (r.options) {
    label.className = 'choice';
    const select = document.createElement('select');
    for (const [v, text] of r.options) select.add(new Option(text, v));
    select.value = String(fixed ? setting(r.key) : savedSetting(r.key));
    select.addEventListener('change', () => changed(r.key, select.value));
    input = select;
    label.append(name, select, hint);
  } else {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!setting(r.key);
    box.addEventListener('change', () => changed(r.key, box.checked));
    input = box;
    label.append(box, name, hint);
  }
  input.name = r.key;
  input.disabled = fixed;
  if (fixed) label.classList.add('fixed');
  return label;
}

export function installSettings(player: Player) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const dialog = document.createElement('dialog');
  dialog.id = 'settings';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.tabIndex = -1;
  document.body.append(dialog);

  const render = () => {
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.textContent = 'Settings';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'reset';
    reset.textContent = 'Reset to defaults';
    reset.disabled = !anySettingChanged();
    reset.addEventListener('click', () => {
      resetSettings();
      render();
      dialog.focus();
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'done';
    done.textContent = 'Done';
    done.addEventListener('click', () => dialog.close());
    header.append(title, reset, done);
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = 'For this browser only.';
    const cols = document.createElement('div');
    cols.className = 'cols';
    for (const [heading, rows] of SECTIONS) {
      const section = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = heading;
      section.append(h, ...rows.map(row));
      cols.append(section);
    }
    dialog.replaceChildren(header, note, cols);
    if (touchMode()) {
      const foot = document.createElement('p');
      foot.className = 'foot';
      const privacy = document.createElement('a');
      privacy.href = '/privacy.html';
      privacy.target = '_blank';
      privacy.rel = 'noopener';
      privacy.textContent = 'Privacy';
      privacy.addEventListener('click', (e) => {
        e.preventDefault();
        openPrivacy();
      });
      foot.append(privacy, ' · © Raketspel / Miniclip');
      dialog.append(foot);
    }
  };
  const open = () => {
    render();
    showModal(dialog);
    // Open at the top with no control picked out (Tab reaches them).
    dialog.scrollTop = 0;
    dialog.focus();
  };
  // A click on the backdrop closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
  // The keyboard back to the game, not left on the link (Enter would open it again).
  dialog.addEventListener('close', () => {
    closedSelf(dialog);
    player.canvas.focus();
  });
  // No key reaches the game (window listeners) while it's open; the dialog's own keys still work.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    addEventListener(type, (e) => {
      if (dialog.open) e.stopPropagation();
    }, true);
  }

  const link = document.createElement('button');
  link.type = 'button';
  link.id = 'settings-link';
  link.textContent = 'Settings';
  link.addEventListener('click', open);
  const privacy = document.getElementById('privacy');
  privacy?.parentElement?.insertBefore(link, privacy);
  onTouchMode(() => {
    link.setAttribute('aria-label', 'Settings');
    link.innerHTML = '<svg viewBox="0 0 24 24" width="70%" height="70%"><path fill="currentColor" fill-rule="evenodd" d="M19.64 9.64 L22.29 9.91 L22.29 14.09 L19.64 14.36 L19.08 15.73 L20.75 17.80 L17.80 20.75 L15.73 19.08 L14.36 19.64 L14.09 22.29 L9.91 22.29 L9.64 19.64 L8.27 19.08 L6.20 20.75 L3.25 17.80 L4.92 15.73 L4.36 14.36 L1.71 14.09 L1.71 9.91 L4.36 9.64 L4.92 8.27 L3.25 6.20 L6.20 3.25 L8.27 4.92 L9.64 4.36 L9.91 1.71 L14.09 1.71 L14.36 4.36 L15.73 4.92 L17.80 3.25 L20.75 6.20 L19.08 8.27Z M15.6 12a3.6 3.6 0 1 0-7.2 0a3.6 3.6 0 1 0 7.2 0Z"/></svg>';
  });
}
