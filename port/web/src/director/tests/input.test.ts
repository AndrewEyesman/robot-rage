// Input routing (player.ts bindInput, spriteAt, keyDown, editField): which sprite
// gets the mouse and keyboard events, hit-testing order, rollovers, field editing.

import { the } from '../api';
import { DColor } from '../color';
import { Behavior } from '../behavior';
import { pass } from '../dispatch';
import { bitmap, click, describe, eq, field, fieldDoc, mouseDown, mouseMove, mouseUp, ok, play, press, test, text, textDoc, typeText, world3d } from './harness';
import type { FakeSprite } from './harness';

/** A behavior logging mouse clicks as "<event> <spriteNum>" (and rollovers with `rollovers`). */
function mouseLogger(log: string[], rollovers = false) {
  if (rollovers)
    return class extends Behavior {
      mouseEnter() {
        log.push(`mouseEnter ${this.spriteNum}`);
      }
      mouseLeave() {
        log.push(`mouseLeave ${this.spriteNum}`);
      }
    };
  return class extends Behavior {
    mouseDown() {
      log.push(`mouseDown ${this.spriteNum}`);
    }
    mouseUp() {
      log.push(`mouseUp ${this.spriteNum}`);
    }
    mouseUpOutSide() {
      log.push(`mouseUpOutSide ${this.spriteNum}`);
    }
  };
}

const BOXES = [bitmap(1, 100, 100), bitmap(2, 100, 100)];
const box = (ch: number, x: number, y: number, o: Partial<FakeSprite> = {}): FakeSprite => ({ ch, frames: [1, 5], member: 1, loc: [x, y], scripts: [10], ...o });

describe('input: mouse', () => {
  test('mouseDown and mouseUp go to the sprite under the pointer; the clickOn is it', 'Director docs (mouseDown/mouseUp are sent to the sprite clicked; the clickOn)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 200, 0)], scripts: { 10: mouseLogger(log) } });
    p.stepFrame();
    click(p, 250, 50);
    eq(log, ['mouseDown 2', 'mouseUp 2']);
    eq(the.clickOn, 2, 'the clickOn');
  });

  test('released elsewhere: mouseUpOutSide to the pressed sprite, mouseUp to the sprite under the pointer', 'Adobe measurement (player.ts: checked with two puppets, press on one, release on the other; the garage drop-down relies on it)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 200, 0)], scripts: { 10: mouseLogger(log) } });
    p.stepFrame();
    mouseDown(p, 50, 50);
    mouseUp(p, 250, 50);
    eq(log, ['mouseDown 1', 'mouseUpOutSide 1', 'mouseUp 2']);
  });

  test('a click on no sprite goes to the frame script, then movie scripts', 'Director docs (message hierarchy for mouse events)', async () => {
    const log: string[] = [];
    class FS extends Behavior {
      mouseDown() {
        log.push('frame mouseDown');
      }
    }
    const p = await play({ frames: 5, members: BOXES, frameScripts: [{ frames: [1, 5], script: 11 }], scripts: { 11: FS }, handlers: { mouseUp: () => log.push('movie mouseUp') } });
    p.stepFrame();
    click(p, 400, 400);
    eq(log, ['frame mouseDown', 'movie mouseUp']);
  });

  test('sprites without scripts let clicks through', 'Director (only sprites with scripts are active: the clickOn names the last active sprite clicked)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 0, 0, { scripts: [] })], scripts: { 10: mouseLogger(log) } });
    p.stepFrame();
    click(p, 50, 50);
    eq(log, ['mouseDown 1', 'mouseUp 1']);
  });

  test('the higher channel takes the click', 'Director (sprites in higher channels are in front)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 50, 50)], scripts: { 10: mouseLogger(log) } });
    p.stepFrame();
    click(p, 75, 75);
    eq(log, ['mouseDown 2', 'mouseUp 2']);
  });

  test("score sprites are hit-tested in channel order even when a script changed their locZ; puppets go by locZ", 'Adobe measurement (player.ts spriteAt: the garage tab headers raised to channel + 100 over the tab buttons, which still take the clicks)', async () => {
    const log: string[] = [];
    class Raise extends Behavior {
      beginSprite() {
        this.sprite.locZ = 100;
      }
      mouseDown() {
        log.push(`mouseDown ${this.spriteNum}`);
      }
    }
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0, { scripts: [11] }), box(2, 0, 0)], scripts: { 10: mouseLogger(log), 11: Raise } });
    p.stepFrame();
    mouseDown(p, 50, 50);
    mouseUp(p, 50, 50);
    eq(log[0], 'mouseDown 2', 'score sprite 2 still in front for clicks');
    eq(p.drawOrder().map((s) => s.spriteNum), [2, 1], 'but sprite 1 is drawn on top');
    log.length = 0;
    p.sprite(1).puppet = true;
    mouseDown(p, 50, 50);
    mouseUp(p, 50, 50);
    eq(log[0], 'mouseDown 1', 'a puppet with locZ 100 takes the click');
  });

  test('3D sprites take clicks before the 2D sprites drawn over them', 'docs/port-issues.md #38 (the garage robot preview is dragged through the frame bitmap above it; 3D is drawn over everything)', async () => {
    const log: string[] = [];
    const p = await play({
      frames: 5,
      members: [...BOXES, world3d(3)],
      sprites: [box(1, 100, 100, { member: 3, size: [200, 200], stretch: true }), box(2, 0, 0, { size: [300, 300] })],
      scripts: { 10: mouseLogger(log) },
    });
    p.stepFrame();
    // The 3D sprite is registered at its centre: loc 100,100 covers 0..200.
    eq([p.sprite(1).left, p.sprite(1).top], [0, 0], '3D sprite registered at its centre');
    click(p, 50, 50);
    eq(log, ['mouseDown 1', 'mouseUp 1']);
  });

  test('matte ink: the white around the image lets clicks through', 'Director docs (matte ink hit-tests the opaque pixels)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 0, 0, { member: 2, ink: 8 })], scripts: { 10: mouseLogger(log) } });
    p.stepFrame();
    const img = p.sprite(2).member.image;
    img.fill({ left: 40, top: 40, right: 60, bottom: 60 }, new DColor(0, 0, 0));
    click(p, 5, 5);
    click(p, 50, 50);
    eq(log, ['mouseDown 1', 'mouseUp 1', 'mouseDown 2', 'mouseUp 2']);
  });

  test('a background-transparent text sprite with no mouse handlers lets clicks through; with them it takes its whole box', 'Adobe measurement (render.ts hitTest: the garage STATS/HIGHSCORE labels vs the login\'s LOG IN hotspot)', async () => {
    const log: string[] = [];
    class LocZOnly extends Behavior {
      beginSprite() {}
    }
    const label = text(3, textDoc([{ text: 'LABEL' }], { size: [100, 20] }));
    const p = await play({
      frames: 5,
      members: [...BOXES, label],
      sprites: [box(1, 0, 0), box(2, 0, 0, { member: 3, ink: 36, scripts: [11] })],
      scripts: { 10: mouseLogger(log), 11: LocZOnly },
    });
    p.stepFrame();
    click(p, 10, 10);
    eq(log, ['mouseDown 1', 'mouseUp 1'], 'label without mouse handlers');
    log.length = 0;
    const p2 = await play({ frames: 5, members: [...BOXES, label], sprites: [box(1, 0, 0), box(2, 0, 0, { member: 3, ink: 36 })], scripts: { 10: mouseLogger(log) } });
    p2.stepFrame();
    click(p2, 90, 15);
    eq(log, ['mouseDown 2', 'mouseUp 2'], 'label with mouse handlers, empty part of the box');
  });

  test('rollover: mouseEnter on entering, mouseLeave on leaving; the rollover names the sprite', 'Director docs (mouseEnter, mouseLeave, the rollover)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 5, members: BOXES, sprites: [box(1, 0, 0), box(2, 200, 0)], scripts: { 10: mouseLogger(log, true) } });
    mouseMove(p, 300, 300);
    p.stepFrame();
    mouseMove(p, 50, 50);
    eq(the.rollover, 1, 'the rollover');
    mouseMove(p, 60, 60);
    mouseMove(p, 250, 50);
    mouseMove(p, 400, 400);
    eq(log, ['mouseEnter 1', 'mouseLeave 1', 'mouseEnter 2', 'mouseLeave 2']);
    eq(the.rollover, 0, 'over nothing');
  });

  test('mouse positions round to whole stage pixels', 'Director (the mouseH/mouseV are integers)', async () => {
    const p = await play({ frames: 1, members: BOXES });
    mouseMove(p, 10.6, 20.4);
    eq([the.mouseH, the.mouseV], [11, 20]);
  });
});

/** Two editable fields, a behavior on the first that logs keys, and a frame script. */
async function fields(o: { passKeys?: boolean; frameHandles?: boolean } = {}) {
  const log: string[] = [];
  class KeyLog extends Behavior {
    keyDown() {
      log.push(`field keyDown ${the.key}`);
      if (o.passKeys !== false) return pass();
    }
  }
  class FS extends Behavior {
    keyDown() {
      log.push(`frame keyDown ${the.key}`);
      if (!o.frameHandles) return pass();
    }
  }
  const p = await play({
    frames: 1,
    members: [field(1, fieldDoc('', { editable: true, rect: [0, 0, 150, 20] })), field(2, fieldDoc('xyz', { editable: true, rect: [0, 0, 150, 20] })), field(3, fieldDoc('static', { rect: [0, 0, 150, 20] }))],
    sprites: [
      { ch: 1, frames: [1, 1], member: 1, loc: [0, 0], scripts: [10] },
      { ch: 2, frames: [1, 1], member: 2, loc: [0, 100] },
      { ch: 3, frames: [1, 1], member: 3, loc: [0, 200] },
    ],
    frameScripts: [{ frames: [1, 1], script: 11 }],
    scripts: { 10: KeyLog, 11: FS },
  });
  p.stepFrame();
  return { p, log, f1: p.sprite(1).member, f2: p.sprite(2).member };
}

describe('input: keyboard and fields', () => {
  test("the focus goes with its sprite: a new sprite in the channel doesn't inherit it (no caret in a label)", 'Maintainer report 2026-10-24: after logging in, a caret blinked in the robot list\'s SCRAP ROBOT label, in the channel where the password field had been', async () => {
    const p = await play({
      frames: 2,
      members: [field(1, fieldDoc('', { editable: true, rect: [0, 0, 150, 20] })), field(2, fieldDoc('label', { rect: [0, 0, 150, 20] }))],
      sprites: [
        { ch: 1, frames: [1, 1], member: 1, loc: [0, 0] },
        { ch: 1, frames: [2, 2], member: 2, loc: [0, 0] },
      ],
    });
    p.stepFrame();
    the.keyboardFocusSprite = 1;
    eq(the.keyboardFocusSprite, 1);
    p.go(2);
    p.stepFrame();
    p.stepFrame();
    eq(the.keyboardFocusSprite, -1);
  });

  test('clicking an editable field focuses it', 'Director docs (the keyboardFocusSprite)', async () => {
    const { p } = await fields();
    eq(the.keyboardFocusSprite, -1, 'no focus at first');
    click(p, 5, 105);
    eq(the.keyboardFocusSprite, 2);
    click(p, 5, 205);
    eq(the.keyboardFocusSprite, 2, 'a non-editable field does not take the focus');
  });

  test("keyDown: the focused field's behaviors, then the frame script, then the field's own editing", 'Director docs (keyDown goes to the editable field sprite, then the frame script; a key is typed into the field only when the handlers pass)', async () => {
    const { p, log, f1 } = await fields();
    the.keyboardFocusSprite = 1;
    typeText(p, 'ab');
    eq(log, ['field keyDown a', 'frame keyDown a', 'field keyDown b', 'frame keyDown b']);
    eq(f1.text, 'ab', 'typed');
  });

  test("a field behavior that doesn't pass keeps the key out of the field and from the frame script", 'Director docs (keyDown: a handler that does not pass stops the character being entered)', async () => {
    const { p, log, f1 } = await fields({ passKeys: false });
    the.keyboardFocusSprite = 1;
    typeText(p, 'a');
    eq(log, ['field keyDown a']);
    eq(f1.text, '');
  });

  test("a frame script keyDown that doesn't pass keeps the key out of the field", 'Director docs (keyDown hierarchy)', async () => {
    const { p, f1 } = await fields({ frameHandles: true });
    the.keyboardFocusSprite = 1;
    typeText(p, 'a');
    eq(f1.text, '');
  });

  test('the key and the keyCode: the character and the Mac key code', 'Director docs (the keyCode reports Mac virtual key codes on every platform; keys.ts)', async () => {
    const seen: unknown[] = [];
    class FS extends Behavior {
      keyDown() {
        seen.push([the.key, the.keyCode]);
      }
    }
    const p = await play({ frames: 1, frameScripts: [{ frames: [1, 1], script: 10 }], scripts: { 10: FS } });
    p.stepFrame();
    press(p, 'a');
    press(p, 'Enter');
    press(p, 'ArrowLeft');
    press(p, 'Tab');
    eq(seen, [['a', 0], ['\r', 36], ['\x1c', 123], ['\t', 48]]);
  });

  test('keyPressed follows keys held down', 'Director docs (keyPressed(keyCode or character))', async () => {
    const p = await play({ frames: 1 });
    const pp = p as unknown as { keyDown(e: KeyboardEvent): void; keyUp(e: KeyboardEvent): void };
    pp.keyDown(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp' }));
    ok(p.keyPressed(126), 'up arrow (126) held');
    pp.keyDown(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ' }));
    ok(p.keyPressed('Z') && p.keyPressed(6), 'z held, by character and code');
    pp.keyUp(new KeyboardEvent('keyup', { key: 'ArrowUp', code: 'ArrowUp' }));
    ok(!p.keyPressed(126), 'released');
  });

  test('field editing: typing at the caret, Backspace, Delete, arrows, Home, End, Enter, replacing a selection', 'Director (a field edits as a Windows text box)', async () => {
    const { p, f2 } = await fields();
    the.keyboardFocusSprite = 2;
    eq([the.selStart, the.selEnd], [3, 3], 'keyboardFocusSprite puts the caret at the end');
    press(p, 'Backspace');
    eq(f2.text, 'xy', 'Backspace');
    press(p, 'Home');
    typeText(p, 'A');
    eq(f2.text, 'Axy', 'Home, type');
    press(p, 'ArrowRight');
    press(p, 'Delete');
    eq(f2.text, 'Ax', 'ArrowRight, Delete');
    press(p, 'ArrowLeft');
    press(p, 'Enter');
    eq(f2.text, 'A\rx', 'Enter types RETURN');
    press(p, 'End');
    eq(the.selStart, 3, 'End');
    the.selStart = 0;
    the.selEnd = 3;
    typeText(p, 'Z');
    eq(f2.text, 'Z', 'typing replaces the selection');
  });

  test('Tab moves to the next editable field in channel order, selecting its text; Shift-Tab back; it wraps', 'Director docs (autoTab / tabbing between editable fields)', async () => {
    const { p } = await fields({ passKeys: true });
    the.keyboardFocusSprite = 1;
    press(p, 'Tab');
    eq([the.keyboardFocusSprite, the.selStart, the.selEnd], [2, 0, 3], 'to field 2, all selected');
    press(p, 'Tab');
    eq(the.keyboardFocusSprite, 1, 'wraps to field 1 (field 3 is not editable)');
    press(p, 'Tab', { shift: true });
    eq(the.keyboardFocusSprite, 2, 'Shift-Tab');
  });
});
