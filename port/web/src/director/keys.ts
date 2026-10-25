// Keyboard codes as Lingo sees them: `the keyCode` is the Mac virtual key code
// (Director reports Mac codes on every platform), `the key` is the character.

const CODES: Record<string, number> = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9, IntlBackslash: 10, KeyB: 11,
  KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17, Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit6: 22,
  Digit5: 23, Equal: 24, Digit9: 25, Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29, BracketRight: 30, KeyO: 31, KeyU: 32,
  BracketLeft: 33, KeyI: 34, KeyP: 35, Enter: 36, KeyL: 37, KeyJ: 38, Quote: 39, KeyK: 40, Semicolon: 41, Backslash: 42,
  Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47, Tab: 48, Space: 49, Backquote: 50, Backspace: 51, Escape: 53,
  NumpadDecimal: 65, NumpadMultiply: 67, NumpadAdd: 69, NumLock: 71, NumpadDivide: 75, NumpadEnter: 76, NumpadSubtract: 78,
  NumpadEqual: 81, Numpad0: 82, Numpad1: 83, Numpad2: 84, Numpad3: 85, Numpad4: 86, Numpad5: 87, Numpad6: 88, Numpad7: 89,
  Numpad8: 91, Numpad9: 92, F5: 96, F6: 97, F7: 98, F3: 99, F8: 100, F9: 101, F11: 103, F13: 105, F10: 109, F12: 111,
  Insert: 114, Home: 115, PageUp: 116, Delete: 117, F4: 118, End: 119, F2: 120, PageDown: 121, F1: 122,
  ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126,
};

/** Characters for keys that don't type one (Mac conventions Director follows). */
const CHARS: Record<string, string> = {
  Enter: '\r', NumpadEnter: '\x03', Tab: '\t', Backspace: '\b', Escape: '\x1b', Delete: '\x7f',
  ArrowLeft: '\x1c', ArrowRight: '\x1d', ArrowUp: '\x1e', ArrowDown: '\x1f', Home: '\x01', End: '\x04', PageUp: '\x0b', PageDown: '\x0c',
};

/**
 * The key's KeyboardEvent code. A phone's keyboard sends some keys with an empty code
 * (Gboard's Backspace and Enter): the key's name or character tells which it is then.
 */
function codeOf(e: KeyboardEvent): string {
  if (e.code) return e.code;
  if (e.key in CODES || e.key in CHARS) return e.key;
  return e.key.length === 1 ? keyForChar(e.key).code : '';
}

export function macKeyCode(e: KeyboardEvent): number {
  return CODES[codeOf(e)] ?? 0;
}

export function keyChar(e: KeyboardEvent): string {
  const code = codeOf(e);
  if (CHARS[code]) return CHARS[code];
  return e.key.length === 1 ? e.key : '';
}

/** Shifted characters on a US keyboard, by the key they're typed with. */
const SHIFTED: Record<string, string> = {
  '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', $: 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7', '*': 'Digit8', '(': 'Digit9',
  ')': 'Digit0', _: 'Minus', '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash', ':': 'Semicolon', '"': 'Quote',
  '<': 'Comma', '>': 'Period', '?': 'Slash', '~': 'Backquote',
};
const PUNCT: Record<string, string> = {
  ' ': 'Space', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote',
  ',': 'Comma', '.': 'Period', '/': 'Slash', '`': 'Backquote',
};

/**
 * The key (KeyboardEvent.code, US layout) and shift state a character is typed with,
 * for text that arrives without key events (a phone's on-screen keyboard); '' for a
 * character no key types.
 */
export function keyForChar(ch: string): { code: string; shift: boolean } {
  if (/^[a-z]$/.test(ch)) return { code: `Key${ch.toUpperCase()}`, shift: false };
  if (/^[A-Z]$/.test(ch)) return { code: `Key${ch}`, shift: true };
  if (/^[0-9]$/.test(ch)) return { code: `Digit${ch}`, shift: false };
  if (PUNCT[ch]) return { code: PUNCT[ch], shift: false };
  if (SHIFTED[ch]) return { code: SHIFTED[ch], shift: true };
  return { code: '', shift: false };
}

/**
 * A key by its KeyboardEvent code ('ArrowUp', 'KeyZ', 'Digit1'): the key code and the
 * character (unshifted) the keyboard's own key gives (Player.virtualKey).
 */
export function keyByName(name: string): { code: number; char: string } {
  const code = CODES[name] ?? 0;
  if (CHARS[name]) return { code, char: CHARS[name] };
  const m = /^(?:Key|Digit)(.)$/.exec(name);
  return { code, char: m ? m[1].toLowerCase() : '' };
}

/** The Mac key code a character is typed with (keyPressed("a")). */
export function codeForChar(ch: string): number | undefined {
  const c = ch.toLowerCase();
  if (c === '\r') return 36;
  if (c === ' ') return 49;
  if (c === '\t') return 48;
  if (c === '\b') return 51;
  for (const [k, v] of Object.entries(CODES)) {
    if (k === `Key${c.toUpperCase()}` || k === `Digit${c}`) return v;
  }
  const punct: Record<string, number> = { '=': 24, '-': 27, ']': 30, '[': 33, "'": 39, ';': 41, '\\': 42, ',': 43, '/': 44, '.': 47, '`': 50 };
  return punct[c];
}
