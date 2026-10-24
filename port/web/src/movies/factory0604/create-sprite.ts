// The frame scripts' shared handlers (behaviors 16, 17 and 18 each have their own copy
// of createSprite and CleanUpSprites; the copies are identical but for the channels).

import { member, puppetSprite, sprite } from '../../director';
import type { LPoint } from '../../lingo';

/** createSprite: a puppet sprite showing member `name` at `pt`, matte ink, drawn at depth `z`. */
export function createSprite(sp: number, name: string, pt: LPoint, z: number) {
  const s = sprite(sp);
  s.puppet = true;
  s.member = member(name);
  s.rect = member(name).rect;
  s.ink = 8;
  s.blend = 100;
  s.loc = pt;
  s.locZ = z;
  s.foreColor = 255;
  s.backColor = 0;
  s.visible = true;
}

/** CleanUpSprites: channels from..to lose their puppets and scripts (puppets moved off the stage first). */
export function cleanUpChannels(from: number, to: number, showAll = false) {
  for (let i = from; i <= to; i++) {
    if (sprite(i).puppet) sprite(i).locV = -1000;
    sprite(i).scriptInstanceList = [];
    puppetSprite(i, 0);
    if (showAll) sprite(i).visible = true;
  }
}

