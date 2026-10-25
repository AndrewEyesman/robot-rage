// Typing on a touch screen. The fields are drawn on the canvas, so nothing on the page
// can take a phone's on-screen keyboard; a hidden input does, over the focused field.
// It's made and focused only when a field gets the focus in a touch (or pen) tap, so a
// mouse and a physical keyboard never meet it.
//
// Keys that arrive as real key events (iOS, physical keyboards, Android's Enter and often
// Backspace) go the usual way, through the Player's keydown, which keeps them out of the
// input. Text that arrives only as input (Android's keyboards send keydown "Unidentified",
// keyCode 229, and compose words) is read from the input's value and typed into the field
// as key presses, so the scripts' keyDown handlers (the login's email box and password
// stars, the chat's RETURN) see it as typed. The input holds one space so Backspace has
// something to delete; it's reset after each edit, never while a word is being composed.

import { TextualMember } from './members';
import type { Player } from './player';

const SENTINEL = ' ';
/** Room kept between the focused field and the on-screen keyboard, in page pixels. */
const MARGIN = 12;

export class TouchTextInput {
  readonly el: HTMLInputElement;
  private last = SENTINEL;
  private composing = false;
  private kind = '';
  /** How far the stage is moved up to keep the field above the keyboard (page pixels, <= 0). */
  private shift = 0;

  constructor(private readonly p: Player) {
    const el = (this.el = document.createElement('input'));
    el.type = 'text';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.spellcheck = false;
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    // 16px: iOS zooms the page into an input with smaller text. The stage's
    // user-select: none would make it read-only in iOS Safari.
    Object.assign(el.style, {
      position: 'absolute', left: '0', top: '0', width: '1px', height: '1px', margin: '0', padding: '0', border: '0',
      opacity: '0', color: 'transparent', background: 'transparent', caretColor: 'transparent', outline: 'none',
      fontSize: '16px', pointerEvents: 'none', userSelect: 'text', webkitUserSelect: 'text',
    });
    p.el.append(el);
    el.addEventListener('compositionstart', () => (this.composing = true));
    el.addEventListener('compositionend', () => {
      this.composing = false;
      this.read();
      this.reset();
    });
    el.addEventListener('input', (e) => {
      this.read();
      if (!this.composing && !(e as InputEvent).isComposing) this.reset();
    });
    el.addEventListener('blur', () => this.place(false));
  }

  get active() {
    return document.activeElement === this.el;
  }

  /** A key event the input got that carries no key (soft keyboards' 229): its text comes as input. */
  static textOnly(e: KeyboardEvent) {
    return e.isComposing || e.keyCode === 229 || e.key === 'Unidentified' || e.key === 'Process';
  }

  /**
   * In a touch tap (iOS opens the keyboard only for a focus() inside the gesture): the
   * keyboard opens on the focused field when the tap was on it or the tap's scripts gave
   * a field the focus (the arena's CHAT button), and closes otherwise.
   */
  tap(onField: boolean) {
    const s = this.field();
    if (s && onField) {
      this.configure(s);
      this.place(true);
      if (!this.active) this.el.focus({ preventScroll: true });
      this.reset();
    } else if (this.active) this.el.blur();
  }

  /** Every display frame while it exists: follow the focus, keep the field in sight. */
  frame() {
    if (!this.active) {
      if (this.shift) this.place(false);
      return;
    }
    const s = this.field();
    if (!s) {
      this.el.blur();
      return;
    }
    this.configure(s);
    this.place(true);
  }

  private field() {
    const f = this.p.focus;
    const s = f ? this.p.sprites[f.sprite] : undefined;
    return s && this.p.isEditable(s) ? s : undefined;
  }

  /** The keyboard for the field: an email one, a password one (no suggestions), or plain text. */
  private configure(s: { member: unknown }) {
    const name = s.member instanceof TextualMember ? s.member.name.toLowerCase() : '';
    const kind = /pass/.test(name) ? 'password' : /mail|user/.test(name) ? 'email' : 'text';
    if (kind === this.kind) return;
    this.kind = kind;
    this.el.type = kind === 'password' ? 'password' : 'text';
    this.el.inputMode = kind === 'email' ? 'email' : 'text';
    this.el.setAttribute('autocapitalize', kind === 'text' ? 'sentences' : 'off');
    this.el.enterKeyHint = kind === 'email' ? 'next' : kind === 'password' ? 'go' : 'enter';
    this.reset();
  }

  /** The text since the last read, typed into the field: Backspaces, then the new characters. */
  private read() {
    const v = this.el.value;
    const old = this.last;
    this.last = v;
    let a = 0;
    while (a < old.length && a < v.length && old[a] === v[a]) a++;
    for (let i = a; i < old.length; i++) this.p.typeKey('Backspace', 'Backspace', false);
    for (const ch of v.slice(a)) {
      if (ch === '\n' || ch === '\r') this.p.typeKey('Enter', 'Enter', false);
      else this.p.typeKey(ch);
    }
  }

  private reset() {
    if (this.composing) return;
    this.el.value = this.last = SENTINEL;
    try {
      this.el.setSelectionRange(SENTINEL.length, SENTINEL.length);
    } catch {
      // Not every input type has a selection.
    }
  }

  /**
   * The input over the focused field (where the browser looks for it), and the stage
   * moved up when the on-screen keyboard (the visual viewport's lower edge) would cover
   * the field; moved back when it's gone.
   */
  private place(on: boolean) {
    const s = on ? this.field() : undefined;
    let shift = 0;
    if (s) {
      const b = s.bounds;
      const tl = this.p.toPage(b.left, b.top);
      const br = this.p.toPage(b.right, b.bottom);
      Object.assign(this.el.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${Math.max(1, br.x - tl.x)}px`, height: `${Math.max(1, br.y - tl.y)}px` });
      const vv = window.visualViewport;
      if (vv) {
        // The field's place on the page without the shift.
        const top = this.p.el.getBoundingClientRect().top - this.shift;
        const fTop = top + tl.y;
        const fBottom = top + br.y;
        const visTop = vv.offsetTop;
        const visBottom = vv.offsetTop + vv.height;
        shift = Math.min(0, visBottom - MARGIN - fBottom);
        if (fTop + shift < visTop + MARGIN) shift = Math.min(0, visTop + MARGIN - fTop);
      }
    }
    shift = Math.round(shift);
    if (shift === this.shift) return;
    this.shift = shift;
    this.p.el.style.transform = shift ? `translateY(${shift}px)` : '';
  }
}
