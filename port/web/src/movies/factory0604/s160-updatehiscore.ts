// factory0604 behavior 160 "updateHiscore" (sprite 99): the Highscore page. Fetches the
// list (gethiscore) into member "highscores" and scrolls its image through this
// sprite's bitmap, upwards and around; drag to scroll by hand.

import { Behavior, G, cursor, dot, member, put, the, type Sprite } from '../../director';
import { DColor, DImage, rectOf, type DRect } from '../../director';
import { EMPTY, LList, LPropList, RETURN, TAB, lingoString, sym, value, type LSymbol } from '../../lingo';
import { RobotWarsReceive, RobotWarsSend } from '../robotwars/s019-net-lingo';

const offsetRect = (r: DRect, dy: number): DRect => rectOf(r.left, r.top + dy, r.right, r.bottom + dy);

export class UpdateHiscore extends Behavior {
  sp!: Sprite;
  pnetId = 0;
  srci!: DImage;
  y = 0;
  txt!: DImage;
  tr: DRect = rectOf(0, 0, 0, 0);
  lasty = 0;
  maxY = 0;
  miny = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = this.sprite;
    this.sp.cursor = 260;
    const mi = this.sp.member.image as DImage;
    this.srci = new DImage(mi.width, mi.height, 32);
    this.srci.fill(rectOf(0, 0, this.srci.width, this.srci.height), new DColor(11, 11, 11));
    this.txt = (member('highscores').image as DImage).duplicate();
    this.tr = rectOf(0, 0, this.txt.width, this.srci.height);
    this.maxY = this.txt.height + 50;
    this.miny = -this.srci.height;
    this.state = sym('idle');
    this.y = this.miny;
  }

  updateHiscore() {
    member('highscores').text = 'Loading Highscore!';
    this.txt = (member('highscores').image as DImage).duplicate();
    this.tr = rectOf(0, 0, this.txt.width, this.srci.height);
    this.maxY = this.txt.height;
    this.miny = -this.srci.height;
    this.sp.member.image = this.srci.duplicate();
    (this.sp.member.image as DImage).copyPixels(this.txt, this.tr, this.tr);
    this.y = this.miny;
    this.state = sym('send');
  }

  hidehiscore() {
    this.state = sym('idle');
  }

  updateMe() {
    this.txt = (member('highscores').image as DImage).duplicate();
    this.tr = rectOf(0, 0, this.txt.width, this.srci.height);
    this.maxY = this.txt.height + 50;
    this.miny = -this.srci.height;
    this.y = this.miny;
    this.state = sym('scroll');
  }

  mouseDown() {
    this.state = sym('drag');
    this.lasty = the.mouseV;
    this.sp.cursor = 290;
    cursor(290);
  }

  mouseUp() {
    this.state = sym('scroll');
    this.sp.cursor = 260;
    cursor(-1);
  }

  mouseUpOutSide() {
    this.mouseUp();
  }

  endSprite() {
    this.sp.cursor = -1;
  }

  prepareFrame() {
    const st = this.state;
    if (st === sym('scroll')) {
      this.sp.member.image = this.srci.duplicate();
      (this.sp.member.image as DImage).copyPixels(this.txt, this.tr, offsetRect(this.tr, this.y));
      this.y = this.y + 1;
      if (this.y > this.maxY) this.y = this.miny;
      if (this.y < this.miny) this.y = this.miny;
    } else if (st === sym('drag')) {
      this.y = this.y + this.lasty - the.mouseV;
      this.sp.member.image = this.srci.duplicate();
      (this.sp.member.image as DImage).copyPixels(this.txt, this.tr, offsetRect(this.tr, this.y));
      this.lasty = the.mouseV;
    } else if (st === sym('send')) {
      const infoList = new LPropList();
      infoList.addProp('action', 'gethiscore');
      this.pnetId = RobotWarsSend(lingoString(dot(G.gVersionList, 'mainasp', 'version')), infoList);
      this.state = sym('waitNet');
    } else if (st === sym('waitNet')) {
      const r = RobotWarsReceive(this.pnetId);
      if (r === sym('waiting')) {
        // nothing
      } else if (r === sym('error')) {
        put('time out');
        this.state = sym('error');
      } else {
        const L = value(r) as LPropList;
        const m = member('highscores');
        m.text = EMPTY;
        for (const p of L.getaProp(sym('hiscore')) as LList) {
          // p.count: the entry's #count property (its rank, which the server sends)
          // if it has one, else the number of its properties.
          const pl = p as LPropList;
          const count = pl.getaProp(sym('count')) ?? pl.count;
          m.text = m.text + lingoString(count) + TAB + lingoString(dot(p, 'robotname')) + TAB + lingoString(dot(p, 'score')) + RETURN;
        }
        this.updateMe();
        // pState = #idle: a local in the original; the state stays #scroll.
      }
    }
  }
}

