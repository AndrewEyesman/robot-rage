// factory0604 behavior 26 "gridbutton": shows the chassis and tower outlines ("ram n",
// "torn n" in sprites 38 and 39) over the paint maps.

import { Behavior, member, sprite } from '../../director';
import { LList, char, lingoString, sym, type LValue } from '../../lingo';
import { gameFixes } from '../fixes';
import { robotDesc } from './util';

export class Gridbutton extends Behavior {
  sp = 0;
  srcName = '';
  tool: LValue;
  toggle = 0;
  tRam: LList = new LList();
  tTorn: LList = new LList();

  beginSprite() {
    this.sp = this.spriteNum;
    this.srcName = sprite(this.sp).member.name;
    this.tRam = robotDesc().prop('ram') as LList;
    this.tTorn = robotDesc().prop('torn') as LList;
    this.tool = sym('grid');
    this.toggle = 0;
    sprite(38).loc = sprite(25).loc;
    sprite(39).loc = sprite(26).loc;
  }

  mouseDown() {
    this.toggle = this.toggle ? 0 : 1;
    this.selectGrid();
    this.selectTool();
  }

  mouseUp() {}

  selectTool(_t?: LValue) {
    switch (this.toggle) {
      case 1:
        sprite(this.sp).member = member(this.srcName + 'D');
        break;
      case 0:
        sprite(this.sp).member = member(this.srcName);
        break;
    }
  }

  selectGrid() {
    // Quirk: reads tRam[1] before checking the list, so without a chassis this is a
    // script error (index out of range) and the grid never shows. The port skips the
    // unused early read (movies/fixes.ts; ?quirks=grid restores it).
    let g = gameFixes.gridNoChassis ? '' : lingoString(this.tRam.getAt(1));
    let h = char(g, g.length);
    if (this.toggle === 1) {
      if (this.tRam.count > 0) {
        g = lingoString(this.tRam.getAt(1));
        h = char(g, g.length);
        sprite(38).member = member('ram ' + h);
      }
      if (this.tTorn.count > 0) {
        g = lingoString(this.tTorn.getAt(1));
        h = char(g, g.length);
        sprite(39).member = member('torn ' + h);
      }
    }
    sprite(38).visible = !!this.toggle;
    sprite(39).visible = !!this.toggle;
  }
}
