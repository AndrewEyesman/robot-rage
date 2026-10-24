// Message passing (dispatch.ts and player.ts): handler lookup, pass / stopEvent,
// sendSprite and sendAllSprites, script errors.

import { call, sendAllSprites, sendSprite, the } from '../api';
import { Behavior } from '../behavior';
import { dontPassEvent, findHandler, invoke, pass, stopEvent } from '../dispatch';
import { bitmap, click, describe, eq, ok, play, test } from './harness';

const MEMBERS = [bitmap(1, 50, 50), bitmap(2, 50, 50), bitmap(3, 50, 50)];

describe('message dispatch', () => {
  test('handlers are found case-insensitively', 'Lingo (handler names are not case-sensitive)', () => {
    class B {
      mouseUp() {
        return 'up';
      }
    }
    const b = new B();
    eq(invoke(b, 'MOUSEUP', []).result, 'up');
    ok(findHandler(b, 'mouseup'), 'findHandler');
    eq(invoke(b, 'mouseDown', []).found, false, 'missing handler');
  });

  test('pass lets the event go on; a handler that does not pass stops it', 'Director docs (pass: sends the event message to the next location in the message hierarchy)', async () => {
    const log: string[] = [];
    let passing = true;
    class Btn extends Behavior {
      mouseUp() {
        log.push('sprite');
        if (passing) return pass();
      }
    }
    class FS extends Behavior {
      mouseUp() {
        log.push('frame');
      }
    }
    const p = await play({ frames: 1, members: MEMBERS, sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [10] }], frameScripts: [{ frames: [1, 1], script: 11 }], scripts: { 10: Btn, 11: FS } });
    p.stepFrame();
    click(p, 10, 10);
    eq(log, ['sprite', 'frame'], 'passed');
    log.length = 0;
    passing = false;
    click(p, 10, 10);
    eq(log, ['sprite'], 'not passed');
  });

  test("every behavior on a sprite gets the event unless one calls stopEvent", 'Director docs (stopEvent: prevents scripts that follow, including other behaviors on the sprite, from receiving the event)', async () => {
    const log: string[] = [];
    let stop: (() => void) | null = null;
    class A extends Behavior {
      mouseDown() {
        log.push('A');
        stop?.();
        log.push('A after');
      }
    }
    class B extends Behavior {
      mouseDown() {
        log.push('B');
      }
    }
    const p = await play({ frames: 1, members: MEMBERS, sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [10, 11] }], scripts: { 10: A, 11: B } });
    p.stepFrame();
    click(p, 5, 5);
    eq(log, ['A', 'A after', 'B'], 'both behaviors');
    log.length = 0;
    stop = stopEvent;
    click(p, 5, 5);
    eq(log, ['A', 'A after'], 'stopEvent (the handler itself goes on)');
    log.length = 0;
    stop = dontPassEvent;
    click(p, 5, 5);
    eq(log, ['A', 'A after'], 'dontPassEvent');
  });

  test('sendSprite: the sprite, else the frame script, else movie scripts', 'Director docs (sendSprite: if the sprite has no handler, the message passes to the frame script and then the movie scripts)', async () => {
    class S extends Behavior {
      hello(x: number) {
        return `sprite ${x}`;
      }
    }
    class FS extends Behavior {
      hello(x: number) {
        return `frame ${x}`;
      }
      onlyFrame() {
        return 'frame only';
      }
    }
    const p = await play({
      frames: 1,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [10] }, { ch: 2, frames: [1, 1], member: 2, scripts: [12] }],
      frameScripts: [{ frames: [1, 1], script: 11 }],
      scripts: { 10: S, 11: FS, 12: class extends Behavior {} },
      handlers: { onlyMovie: () => 'movie only', hello: () => 'movie hello' },
    });
    p.stepFrame();
    eq(sendSprite(1, 'HELLO', 1), 'sprite 1', 'sprite handler');
    eq(sendSprite(2, 'hello', 2), 'frame 2', 'sprite 2 has none: frame script');
    eq(sendSprite(0, 'hello', 3), 'frame 3', 'sendSprite(0)');
    eq(sendSprite(1, 'onlyFrame'), 'frame only');
    eq(sendSprite(1, 'onlyMovie'), 'movie only', 'movie scripts');
    eq(sendSprite(1, 'nobody'), undefined, 'nobody: VOID');
  });

  test('sendAllSprites: every sprite in channel order; the frame script and movie scripts only when no sprite has the handler', 'Director docs (sendAllSprites)', async () => {
    const log: string[] = [];
    class S extends Behavior {
      ping(x: string) {
        log.push(`s${this.spriteNum} ${x}`);
        return this.spriteNum;
      }
    }
    class FS extends Behavior {
      pong() {
        log.push('frame pong');
      }
    }
    const p = await play({
      frames: 1,
      members: MEMBERS,
      sprites: [{ ch: 3, frames: [1, 1], member: 1, scripts: [10] }, { ch: 1, frames: [1, 1], member: 2, scripts: [10] }],
      frameScripts: [{ frames: [1, 1], script: 11 }],
      scripts: { 10: S, 11: FS },
      handlers: { ping: () => log.push('movie ping'), pong: () => log.push('movie pong'), zing: () => log.push('movie zing') },
    });
    p.stepFrame();
    sendAllSprites('ping', 'x');
    eq(log, ['s1 x', 's3 x'], 'sprites, no fall-through');
    log.length = 0;
    sendAllSprites('pong');
    eq(log, ['frame pong'], 'frame script');
    log.length = 0;
    sendAllSprites('zing');
    eq(log, ['movie zing'], 'movie scripts');
  });

  test("a script error ends only its handler; the event still reaches the other scripts", 'docs/port-issues.md "Fixed along the way" (a script error ends only the failing handler, as Director\'s alertHook does)', async () => {
    const log: string[] = [];
    class Bad extends Behavior {
      enterFrame() {
        log.push('bad start');
        (undefined as unknown as { x: number }).x;
        log.push('bad end');
      }
    }
    class Good extends Behavior {
      enterFrame() {
        log.push(`good ${this.spriteNum}`);
      }
    }
    const err = console.error;
    console.error = () => {};
    try {
      const p = await play({
        frames: 2,
        members: MEMBERS,
        sprites: [{ ch: 1, frames: [1, 2], member: 1, scripts: [10, 11] }, { ch: 2, frames: [1, 2], member: 2, scripts: [11] }],
        frameScripts: [{ frames: [1, 2], script: 11 }],
        scripts: { 10: Bad, 11: Good },
      });
      p.stepFrame();
      eq(log, ['bad start', 'good 1', 'good 2', 'good 0']);
      p.stepFrame();
      eq(p.frame, 1, 'the movie plays on (2 frames, looped)');
    } finally {
      console.error = err;
    }
  });

  test('the currentSpriteNum is the behavior\'s channel in its handlers, 0 in the frame script', 'Director docs (the currentSpriteNum)', async () => {
    const seen: number[] = [];
    class S extends Behavior {
      enterFrame() {
        seen.push(the.currentSpriteNum);
      }
    }
    const p = await play({ frames: 1, members: MEMBERS, sprites: [{ ch: 6, frames: [1, 1], member: 1, scripts: [10] }], frameScripts: [{ frames: [1, 1], script: 10 }], scripts: { 10: S } });
    p.stepFrame();
    eq(seen, [6, 0]);
  });

  test('call(#handler, list) calls each object in the list', 'Director docs (call)', () => {
    const log: string[] = [];
    const mk = (n: string) => ({ Notify: (a: number) => log.push(`${n}${a}`) });
    call('notify', [mk('a'), mk('b'), {}], 1);
    eq(log, ['a1', 'b1']);
  });
});
