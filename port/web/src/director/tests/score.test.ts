// Score sync: which channels hold which sprites and behaviors on each frame, and
// what survives from frame to frame (player.ts syncScore / applyScoreDelta).

import { puppetSprite, sprite } from '../api';
import { Behavior } from '../behavior';
import { bitmap, describe, eq, logger, ok, play, steps, test, text, textDoc } from './harness';

const MEMBERS = [bitmap(1, 10, 10), bitmap(2, 20, 20), bitmap(3, 30, 30)];

describe('score sync', () => {
  test('a span begins on its first frame and not before', 'Director docs (beginSprite: sent when the playhead enters a sprite span)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 4, members: MEMBERS, sprites: [{ ch: 2, frames: [2, 3], member: 1, scripts: [10] }], scripts: { 10: logger(log) } });
    p.stepFrame();
    eq(p.sprite(2).scriptInstanceList.length, 0, 'behaviors on frame 1');
    eq(p.sprite(2).member, null, 'member on frame 1');
    eq(log.filter((l) => l.endsWith('beginSprite')), [], 'beginSprite before the span');
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('beginSprite')), ['s2:beginSprite'], 'beginSprite on frame 2');
    ok(p.sprite(2).member?.name === 'bmp1', 'sprite 2 shows member 1 on frame 2');
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('beginSprite')).length, 1, 'beginSprite once per span');
  });

  test('beginSprite goes to sprites in channel order, then the frame script once', 'Director docs (event order: beginSprite to sprite behaviors, then frame behavior)', async () => {
    const log: string[] = [];
    const L = logger(log);
    const p = await play({
      frames: 3,
      members: MEMBERS,
      sprites: [
        { ch: 7, frames: [1, 3], member: 1, scripts: [10] },
        { ch: 3, frames: [1, 3], member: 2, scripts: [10] },
        { ch: 5, frames: [1, 3], member: 3, scripts: [10] },
      ],
      frameScripts: [{ frames: [1, 3], script: 11 }],
      scripts: { 10: L, 11: L },
    });
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('beginSprite')), ['s3:beginSprite', 's5:beginSprite', 's7:beginSprite', 'fs:beginSprite'], 'beginSprite order');
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('beginSprite')).length, 4, 'no second beginSprite within the spans');
  });

  test('every behavior of a sprite gets beginSprite, in the order attached', 'Director docs (an event goes to each behavior on the sprite in turn)', async () => {
    const log: string[] = [];
    const p = await play({
      frames: 2,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 2], member: 1, scripts: [21, 20] }],
      scripts: { 20: logger(log, 'A'), 21: logger(log, 'B') },
    });
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('beginSprite')), ['B:beginSprite', 'A:beginSprite']);
  });

  test('endSprite when the span ends; the channel empties', 'Director docs (endSprite: sent when the playhead leaves a sprite span)', async () => {
    const log: string[] = [];
    const p = await play({ frames: 4, members: MEMBERS, sprites: [{ ch: 4, frames: [1, 2], member: 1, scripts: [10] }], scripts: { 10: logger(log) } });
    steps(p, 2);
    eq(log.filter((l) => l.endsWith('endSprite')), [], 'no endSprite inside the span');
    p.stepFrame();
    eq(log.filter((l) => l.endsWith('endSprite')), ['s4:endSprite'], 'endSprite on leaving');
    eq(p.sprite(4).member, null, 'channel empty');
    eq(p.sprite(4).scriptInstanceList.length, 0, 'behaviors gone');
  });

  test('back-to-back spans in one channel: endSprite of the old, then beginSprite of the new', 'Director docs (endSprite before the next span begins)', async () => {
    const log: string[] = [];
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 2, frames: [1, 4], member: 1, spans: [{ frames: [1, 2], scripts: [20] }, { frames: [3, 4], scripts: [21] }] }],
      scripts: { 20: logger(log, 'A'), 21: logger(log, 'B') },
    });
    steps(p, 2);
    log.length = 0;
    p.stepFrame();
    eq(log.slice(0, 2), ['A:endSprite', 'B:beginSprite']);
  });

  test("a frame script's endSprite can't take the next span's new behaviors", 'Port rule from the garage (player.ts: behaviors exist from beginSprite on, after every endSprite; the Workshop frame script empties channels 100-500 when it ends)', async () => {
    const log: string[] = [];
    const Clearer = logger(log, 'fs', {
      endSprite() {
        log.push('fs:endSprite');
        sprite(2).scriptInstanceList = [];
      },
    });
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 2, frames: [3, 4], member: 1, scripts: [21] }],
      frameScripts: [{ frames: [1, 2], script: 20 }],
      scripts: { 20: Clearer, 21: logger(log, 'B') },
    });
    steps(p, 3);
    ok(log.indexOf('fs:endSprite') >= 0 && log.indexOf('fs:endSprite') < log.indexOf('B:beginSprite'), `frame script ends before sprite 2 begins (${log.join(', ')})`);
    eq(p.sprite(2).scriptInstanceList.length, 1, "sprite 2's new behavior survives");
  });

  test('a property a script set survives within the span', 'Director docs (sprite properties set by Lingo last until the sprite span ends)', async () => {
    class Mover extends Behavior {
      beginSprite() {
        this.sprite.locH = 123;
        this.sprite.ink = 36;
      }
    }
    const p = await play({ frames: 3, members: MEMBERS, sprites: [{ ch: 1, frames: [1, 3], member: 1, loc: [10, 20], scripts: [10] }], scripts: { 10: Mover } });
    steps(p, 3);
    eq([p.sprite(1).locH, p.sprite(1).locV, p.sprite(1).ink], [123, 20, 36], 'locH/ink set by the script, locV from the score');
  });

  test('score changes within a span apply to properties no script changed', 'Port rule (player.ts applyScoreDelta), for tweens and member swaps inside a span', async () => {
    class Mover extends Behavior {
      beginSprite() {
        this.sprite.locH = 123;
      }
    }
    const p = await play({
      frames: 3,
      members: MEMBERS,
      sprites: [{ ch: 1, frames: [1, 3], member: 1, loc: [10, 20], scripts: [10], at: { 2: { loc: [11, 40], member: 2, blend: 50 }, 3: { loc: [12, 60], member: 2, blend: 50 } } }],
      scripts: { 10: Mover },
    });
    steps(p, 2);
    eq([p.sprite(1).locH, p.sprite(1).locV], [123, 40], 'frame 2: locV follows the score, locH stays');
    eq(p.sprite(1).member.name, 'bmp2', 'member swap followed');
    eq(p.sprite(1).blend, 50, 'blend followed');
    p.stepFrame();
    eq([p.sprite(1).locH, p.sprite(1).locV], [123, 60], 'frame 3');
  });

  test('a member a script set survives the score swapping members', 'Port rule (player.ts applyScoreDelta: only untouched properties follow the score)', async () => {
    class Swapper extends Behavior {
      beginSprite() {
        this.sprite.member = 'bmp3';
      }
    }
    const p = await play({ frames: 2, members: MEMBERS, sprites: [{ ch: 1, frames: [1, 2], member: 1, scripts: [10], at: { 2: { member: 2 } } }], scripts: { 10: Swapper } });
    steps(p, 2);
    eq(p.sprite(1).member.name, 'bmp3');
  });

  test("a sprite's locZ outlives its span", 'Adobe measurement (player.ts: the garage zoom knob raised to 121 on the door frame stays above the rod)', async () => {
    class Raise extends Behavior {
      beginSprite() {
        this.sprite.locZ = 50;
      }
    }
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 2, frames: [1, 4], member: 1, spans: [{ frames: [1, 2], scripts: [10] }, { frames: [3, 4], scripts: [11] }] }],
      scripts: { 10: Raise, 11: class extends Behavior {} },
    });
    steps(p, 3);
    eq(p.sprite(2).locZ, 50);
  });

  test('a puppet keeps its properties when the score moves on', 'Director docs (puppetSprite: the score no longer controls the channel)', async () => {
    class Puppeteer extends Behavior {
      beginSprite() {
        puppetSprite(this.spriteNum, true);
        this.sprite.locH = 300;
      }
    }
    const log: string[] = [];
    const p = await play({
      frames: 4,
      members: MEMBERS,
      sprites: [{ ch: 3, frames: [1, 2], member: 1, scripts: [10], at: { 2: { loc: [5, 5] } } }],
      scripts: { 10: logger(log, 'P', { beginSprite: Puppeteer.prototype.beginSprite }) },
    });
    steps(p, 4);
    eq(p.sprite(3).member?.name, 'bmp1', 'member kept after the span');
    eq(p.sprite(3).locH, 300, 'locH kept');
    eq(log.filter((l) => l.endsWith('endSprite')), [], 'no endSprite for a puppet');
  });

  test('a puppet the score has nothing for is cleared when released', 'Director docs (puppetSprite(n, FALSE) returns control to the score)', async () => {
    const p = await play({ frames: 3, members: MEMBERS });
    p.stepFrame();
    puppetSprite(9, true);
    p.sprite(9).member = 'bmp2';
    p.sprite(9).locH = 40;
    p.stepFrame();
    eq(p.sprite(9).member?.name, 'bmp2', 'puppet drawn');
    puppetSprite(9, false);
    p.stepFrame();
    eq(p.sprite(9).member, null, 'released puppet cleared');
    eq(p.sprite(9).locH, 0, 'its properties reset');
  });

  test('a released puppet takes the score sprite again', 'Director docs (puppetSprite(n, FALSE) returns control to the score)', async () => {
    const p = await play({ frames: 3, members: MEMBERS, sprites: [{ ch: 2, frames: [1, 3], member: 1, loc: [7, 8] }] });
    p.stepFrame();
    puppetSprite(2, true);
    p.sprite(2).member = 'bmp3';
    p.stepFrame();
    eq(p.sprite(2).member.name, 'bmp3', 'puppet');
    puppetSprite(2, false);
    p.stepFrame();
    eq([p.sprite(2).member.name, p.sprite(2).locH], ['bmp1', 7], 'score sprite back');
  });

  test('behavior parameters from the score are set before beginSprite, case-insensitively', 'port/TRANSLATING.md (behaviors are created with no arguments, then get their score parameters, then beginSprite)', async () => {
    let seen: unknown[] = [];
    class Param extends Behavior {
      pSpeed: unknown = undefined;
      pName: unknown = undefined;
      beginSprite() {
        seen = [this.pSpeed, this.pName];
      }
    }
    const p = await play({ frames: 1, members: MEMBERS, sprites: [{ ch: 1, frames: [1, 1], member: 1, scripts: [[10, '[#pspeed: 7, #PNAME: "fast"]']] }], scripts: { 10: Param } });
    p.stepFrame();
    eq(seen, [7, 'fast']);
    eq(p.sprite(1).getProp('PSPEED'), 7, 'sprite(n).prop reads a behavior property');
  });

  test('a text member takes its box width from the score sprite', 'docs/port-issues.md "Fixed along the way" (text members take their box from the score\'s sprite size)', async () => {
    const p = await play({ frames: 1, members: [text(1, textDoc([{ text: 'hello there' }], { size: [0, 0] }))], sprites: [{ ch: 1, frames: [1, 1], member: 1, size: [123, 40] }] });
    p.stepFrame();
    eq(p.sprite(1).member.width, 123);
  });

  test(
    'a property a script set on a sprite without behaviors survives within its span',
    'Director docs (Lingo changes to sprite properties last until the end of the sprite span, scripted or not); the player treats a run of the same member as the span',
    async () => {
      class FS extends Behavior {
        beginSprite() {
          sprite(4).locH = 222;
        }
      }
      const p = await play({ frames: 3, members: MEMBERS, sprites: [{ ch: 4, frames: [1, 3], member: 1, loc: [10, 10] }], frameScripts: [{ frames: [1, 3], script: 10 }], scripts: { 10: FS } });
      steps(p, 2);
      eq(p.sprite(4).locH, 222);
    },
  );

  test(
    "sprite.visible belongs to the channel and outlasts the span",
    'Director 10 docs (visible: "This property affects all sprites in the channel, regardless of their position in the Score")',
    async () => {
      class Hide extends Behavior {
        beginSprite() {
          this.sprite.visible = false;
        }
      }
      const p = await play({
        frames: 4,
        members: MEMBERS,
        sprites: [{ ch: 2, frames: [1, 4], member: 1, spans: [{ frames: [1, 2], scripts: [10] }, { frames: [3, 4], scripts: [11] }] }],
        scripts: { 10: Hide, 11: class extends Behavior {} },
      });
      steps(p, 3);
      eq(p.sprite(2).visible, false);
    },
  );
});
