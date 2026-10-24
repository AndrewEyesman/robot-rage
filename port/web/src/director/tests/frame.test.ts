// The frame cycle (player.ts stepFrame), go() and the playhead, movie switching and
// timeouts.

import { G, go, newTimeout, the, timeout } from '../api';
import { Behavior } from '../behavior';
import { addMovie, bitmap, describe, eq, logger, ok, play, sleep, steps, switchTo, test, waitFor } from './harness';

const MEMBERS = [bitmap(1, 10, 10), bitmap(2, 10, 10)];

describe('frame cycle', () => {
  test('first frame: prepareMovie, beginSprite, stepFrame, prepareFrame, startMovie, enterFrame, exitFrame', 'Director docs (movie start event order; Director 8+ frame cycle)', async () => {
    const log: string[] = [];
    const L = logger(log);
    const actor = { stepFrame: () => log.push('actor:stepFrame') };
    const p = await play({
      frames: 3,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 3], member: 1, scripts: [10] }],
      frameScripts: [{ frames: [1, 3], script: 10 }],
      scripts: { 10: L },
      handlers: {
        prepareMovie: () => {
          log.push('movie:prepareMovie');
          the.actorList = [actor];
        },
        startMovie: () => log.push('movie:startMovie'),
      },
    });
    p.stepFrame();
    eq(log, [
      'movie:prepareMovie',
      's1:beginSprite', 'fs:beginSprite',
      'actor:stepFrame',
      's1:prepareFrame', 'fs:prepareFrame',
      'movie:startMovie',
      's1:enterFrame', 'fs:enterFrame',
      's1:exitFrame', 'fs:exitFrame',
    ]);
    log.length = 0;
    p.stepFrame();
    eq(log, ['actor:stepFrame', 's1:prepareFrame', 'fs:prepareFrame', 's1:enterFrame', 'fs:enterFrame', 's1:exitFrame', 'fs:exitFrame'], 'second frame: no startMovie, no beginSprite');
  });

  test('frame events go to sprites in channel order, then the frame script', 'Director docs (message order: sprite behaviors, then frame behavior)', async () => {
    const log: string[] = [];
    const L = logger(log);
    const p = await play({
      frames: 1,
      members: MEMBERS,
      sprites: [{ ch: 9, frames: [1, 1], member: 1, scripts: [10] }, { ch: 2, frames: [1, 1], member: 2, scripts: [10] }],
      frameScripts: [{ frames: [1, 1], script: 10 }],
      scripts: { 10: L },
    });
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('enterFrame')), ['s2:enterFrame', 's9:enterFrame', 'fs:enterFrame']);
  });

  test('a frame event the frame script lacks goes to the movie scripts', 'Director docs (message hierarchy: frame script, then movie scripts)', async () => {
    const log: string[] = [];
    class FS extends Behavior {
      exitFrame() {
        log.push('fs:exitFrame');
      }
    }
    const p = await play({
      frames: 2,
      members: MEMBERS,
      frameScripts: [{ frames: [1, 1], script: 10 }],
      scripts: { 10: FS },
      handlers: { enterFrame: () => log.push('movie:enterFrame'), exitFrame: () => log.push('movie:exitFrame') },
    });
    p.stepFrame();
    eq(log, ['movie:enterFrame', 'fs:exitFrame'], 'frame 1 (frame script has exitFrame)');
    log.length = 0;
    p.stepFrame();
    eq(log, ['movie:enterFrame', 'movie:exitFrame'], 'frame 2 (no frame script)');
  });

  test('the actorList gets stepFrame every frame, before prepareFrame', 'Director docs (stepFrame is sent to objects in the actorList each time the playhead enters a frame)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 2, members: MEMBERS, frameScripts: [{ frames: [1, 2], script: 10 }], scripts: { 10: logger(log) } });
    the.actorList = [{ stepFrame: () => log.push('a:stepFrame') }, { stepFrame: () => log.push('b:stepFrame') }];
    steps(p, 2);
    eq(log.filter((l) => !l.endsWith('Sprite')), ['a:stepFrame', 'b:stepFrame', 'fs:prepareFrame', 'fs:enterFrame', 'fs:exitFrame', 'a:stepFrame', 'b:stepFrame', 'fs:prepareFrame', 'fs:enterFrame', 'fs:exitFrame']);
  });

  test('the playhead moves on one frame per cycle and loops at the end', 'Director (Shockwave plays in a loop: after the last frame comes frame 1)', async () => {
    const p = await play({ frames: 3, members: MEMBERS });
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(p.frame);
      p.stepFrame();
    }
    eq(seen, [1, 2, 3, 1, 2]);
  });

  test('the movie can start at a label', 'Director docs (go(label, movie))', async () => {
    const p = await play({ frames: 9, labels: { Intro: 4 }, members: MEMBERS }, 'intro');
    eq(p.frame, 4);
    eq(p.frameLabel, 'Intro');
  });
});

describe('go and the playhead', () => {
  test('go(n) in exitFrame: the next frame is n', 'Director docs (go: the playhead goes to the frame after the handler)', async () => {
    class FS extends Behavior {
      exitFrame() {
        go(7);
      }
    }
    const p = await play({ frames: 9, members: MEMBERS, frameScripts: [{ frames: [1, 1], script: 10 }], scripts: { 10: FS } });
    p.stepFrame();
    eq(p.frame, 7);
  });

  test('after go(x), the frame already reports x; go(the frame) keeps the jump', 'docs/port-issues.md "Fixed along the way" (after go(x), the frame already reports x; otherwise every go(label) ... go(the frame) undid the jump)', async () => {
    let reported = 0;
    class FS extends Behavior {
      exitFrame() {
        go('menu');
        reported = the.frame;
        go(the.frame);
      }
    }
    const p = await play({ frames: 9, labels: { Menu: 5 }, members: MEMBERS, frameScripts: [{ frames: [1, 1], script: 10 }], scripts: { 10: FS } });
    p.stepFrame();
    eq(reported, 5, 'the frame right after go("menu")');
    eq(p.frame, 5, 'the playhead');
  });

  test('go(the frame) loops on the frame', 'Director docs (the usual "on exitFrame go the frame" hold)', async () => {
    const log: string[] = [];
    class FS extends Behavior {
      enterFrame() {
        log.push(`enter ${the.frame}`);
      }
      exitFrame() {
        go(the.frame);
      }
    }
    const p = await play({ frames: 5, members: MEMBERS, frameScripts: [{ frames: [2, 2], script: 10 }], scripts: { 10: FS } });
    steps(p, 4);
    eq(p.frame, 2);
    eq(log, ['enter 2', 'enter 2', 'enter 2']);
  });

  test('a go to another frame stops the event reaching later sprites and the frame script', 'Port rule (player.ts dispatchFrameEvent), as Director leaves the frame at once', async () => {
    const log: string[] = [];
    const Jumper = logger(log, undefined, {
      enterFrame(this: Behavior) {
        log.push(`s${this.spriteNum}:enterFrame`);
        go(3);
      },
    });
    const L = logger(log);
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [11] }, { ch: 2, frames: [1, 1], member: 2, scripts: [10] }],
      frameScripts: [{ frames: [1, 1], script: 10 }],
      scripts: { 10: L, 11: Jumper },
    });
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('enterFrame')), ['s1:enterFrame'], 'enterFrame after the jump');
    eq(p.frame, 3);
  });

  test('a go to the current frame lets the event go on', 'Port rule (player.ts dispatchFrameEvent: only a go elsewhere leaves the frame)', async () => {
    const log: string[] = [];
    const Stayer = logger(log, undefined, {
      enterFrame(this: Behavior) {
        log.push(`s${this.spriteNum}:enterFrame`);
        go(the.frame);
      },
    });
    const L = logger(log);
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [11] }, { ch: 2, frames: [1, 1], member: 2, scripts: [10] }],
      frameScripts: [{ frames: [1, 1], script: 10 }],
      scripts: { 10: L, 11: Stayer },
    });
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('enterFrame')), ['s1:enterFrame', 's2:enterFrame', 'fs:enterFrame']);
  });

  test('labels are case-insensitive; an unknown label does nothing; frames clamp to the movie', 'Director docs (marker names are not case-sensitive)', async () => {
    const p = await play({ frames: 6, labels: { Shop: 4 }, members: MEMBERS });
    go('SHOP');
    eq(the.frame, 4, 'go("SHOP")');
    p.stepFrame();
    eq(p.frame, 4);
    go('nowhere');
    p.stepFrame();
    eq(p.frame, 5, 'unknown label: playhead moves on');
    go(99);
    p.stepFrame();
    eq(p.frame, 6, 'go(99) clamps to the last frame');
  });
});

describe('movie switching', () => {
  test('go(frame, movie): stopMovie, endSprite, prepareMovie, then the new movie starts', 'Director docs / dirplayer stop_movie_sequence (stopMovie, then endSprite for every sprite; then the new movie: prepareMovie, beginSprite, prepareFrame, startMovie)', async () => {
    const log: string[] = [];
    const p = await play({
      frames: 2,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 2], member: 1, scripts: [10] }],
      frameScripts: [{ frames: [1, 2], script: 11 }],
      scripts: {
        10: logger(log, 'old1'),
        11: logger(log, 'oldfs', {
          exitFrame() {
            log.push('oldfs:exitFrame');
            go('start', name2);
          },
        }),
      },
      handlers: { stopMovie: () => log.push('old:stopMovie') },
    });
    const name2 = addMovie(p, {
      frames: 5,
      labels: { start: 3 },
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [3, 3], member: 2, scripts: [10] }],
      scripts: { 10: logger(log, 'new1') },
      handlers: { prepareMovie: () => log.push('new:prepareMovie'), startMovie: () => log.push('new:startMovie') },
    });
    p.stepFrame();
    log.length = 0;
    p.stepFrame();
    await waitFor(() => p.movie?.name === name2, 'the new movie');
    eq(log, ['old:stopMovie', 'old1:endSprite', 'oldfs:endSprite', 'new:prepareMovie'], 'leaving');
    eq(p.frame, 3, 'starts at the label');
    log.length = 0;
    p.stepFrame();
    eq(log.slice(0, 4), ['new1:beginSprite', 'new1:prepareFrame', 'new:startMovie', 'new1:enterFrame']);
  });

  test('the frame on which go(movie) is called still finishes; the playhead does not move', 'Director docs (go to another movie happens after the current handler, at the frame boundary)', async () => {
    const log: string[] = [];
    let other = '';
    class FS extends Behavior {
      enterFrame() {
        go(1, other);
      }
      exitFrame() {
        log.push('exitFrame');
      }
    }
    const p = await play({ frames: 5, members: MEMBERS, frameScripts: [{ frames: [1, 5], script: 10 }], scripts: { 10: FS } });
    other = addMovie(p, { frames: 1 });
    p.stepFrame();
    eq(log, ['exitFrame']);
    eq(p.frame, 1, 'no frame advance in the old movie');
  });

  test('globals survive the switch; non-persistent timeouts are cleared, persistent ones kept', 'Director docs (globals are shared by all movies; timeout objects persist across movies only when persistent is TRUE)', async () => {
    const p = await play({ frames: 1, members: MEMBERS });
    G.gKeep = 42;
    newTimeout('gone', 10000, 'tick');
    newTimeout('kept', 10000, 'tick');
    timeout('kept').persistent = true;
    const other = addMovie(p, { frames: 1 });
    await switchTo(p, other);
    eq(G.gkeep, 42, 'global (case-insensitive name)');
    eq(timeout('gone').exists, false, 'non-persistent timeout');
    eq(timeout('kept').exists, true, 'persistent timeout');
  });

  test('puppets are released and every channel emptied on the switch', 'Director docs (puppets are reset when a new movie starts)', async () => {
    const p = await play({ frames: 1, members: MEMBERS });
    p.sprite(5).puppet = true;
    p.sprite(5).member = 'bmp1';
    await switchTo(p, addMovie(p, { frames: 1 }));
    eq([p.sprite(5).puppet, p.sprite(5).member], [false, null]);
  });
});

describe('timeouts', () => {
  test('a timeout calls its handler on its target with the timeout object once its period has passed', 'Director docs (timeout().new(period, #handler, target))', async () => {
    const calls: unknown[] = [];
    const target = { onTick: (t: { name: string }) => calls.push(t.name) };
    const p = await play({ frames: 1, members: MEMBERS });
    const run = () => (p as unknown as { runTimeouts(): void }).runTimeouts();
    timeout('tt').new(60, 'ONTICK', target);
    run();
    eq(calls, [], 'not before its period');
    await sleep(80);
    run();
    eq(calls, ['tt'], 'fired once (handler name case-insensitive)');
    run();
    eq(calls.length, 1, 'next one a period later');
    eq(timeout('tt').period, 60);
    timeout('tt').forget();
    eq(timeout('tt').exists, false, 'forget');
  });

  test('a timeout without a target calls a movie script handler', 'Director docs (timeout target defaults to the movie scripts)', async () => {
    const calls: string[] = [];
    const p = await play({ frames: 1, members: MEMBERS, handlers: { heartBeat: () => calls.push('beat') } });
    newTimeout('hb', 1, 'heartbeat');
    await sleep(5);
    (p as unknown as { runTimeouts(): void }).runTimeouts();
    eq(calls, ['beat']);
  });

  test('timeout("x") is a handle whether or not the timeout exists', 'Director docs (timeout("name") returns a reference)', async () => {
    await play({ frames: 1, members: MEMBERS });
    const t = timeout('later');
    eq([t.exists, t.period, t.persistent], [false, 0, false]);
    t.new(500, 'x');
    ok(timeout('later').exists, 'exists after new');
  });
});
