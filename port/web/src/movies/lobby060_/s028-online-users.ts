// lobby060_ behavior 28 "onlineUsers" (sprite 9, the room's user list "rvtext"):
// clicking a name looks the robot up in the room (getOnlineRobotId), moves the marker
// (sprite 10) to it and asks the frame script to fetch it.

import { Behavior, G, cursor, pass, put, rollover, sendSprite, sprite, the } from '../../director';
import { LPropList, TAB, item, line, lineCount, setItemDelimiter, sym, type LSymbol, type LValue } from '../../lingo';
import { getOnlineRobotId } from './s004-lobby-moviescript';
import { eq, pointToLine } from './util';

export class OnlineUsers extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  lastselected: LValue;
  pDown: LValue;
  plistdone: LValue;
  content: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.spriteNum).member.text = '';
    this.state = sym('idle');
    if (rollover(this.sp)) this.SetPointingCursor(1);
    sprite(this.spriteNum).member.fixedLineSpace = 13;
  }

  HideSelection() {
    sprite(this.spriteNum + 1).locV = -1000;
    this.lastselected = 0;
    this.content = sprite(this.spriteNum).member.text;
  }

  exitFrame() {
    if (!eq(this.content, sprite(this.spriteNum).member.text)) this.fixMarker();
  }

  mouseUp() {
    if (eq(this.pDown, 1)) {
      if (sendSprite(0, 'isready')) {
        const lineNum = pointToLine(this.spriteNum, the.mouseLoc);
        if (lineNum >= 0 && lineCount(sprite(this.sp).member.text) > 0) {
          setItemDelimiter(TAB);
          this.lastselected = item(line(sprite(this.spriteNum).member.text, lineNum), 1);
          const opdata = getOnlineRobotId(this, this.lastselected);
          if (opdata !== undefined) {
            sendSprite(this.spriteNum + 1, 'select', lineNum);
            if ((G.RobotCache as LPropList).getaProp(opdata.getaProp(sym('robotname'))) === undefined) {
              sendSprite(0, 'getRobot', opdata, 1);
              put('ej cachad***************');
            } else {
              sendSprite(0, 'getRobot', opdata, 0);
              put('cachad***************');
            }
          }
        }
      }
    }
    this.pDown = 0;
  }

  mouseDown() {
    this.pDown = 1;
  }

  mouseWithin() {
    if (pointToLine(this.spriteNum, the.mouseLoc) < lineCount(sprite(this.spriteNum).member.text)) this.SetPointingCursor(1);
    else this.SetPointingCursor(0);
  }

  SetPointingCursor(q: LValue) {
    if (q) {
      if (this.state === sym('idle')) {
        this.state = sym('pointing');
        cursor(280);
      }
    } else if (this.state === sym('pointing')) {
      this.state = sym('idle');
      cursor(0);
    }
  }

  mouseLeave() {
    this.SetPointingCursor(0);
    return pass();
  }

  inactivate() {
    this.state = sym('inactive');
  }

  getUserLine(user: LValue): number | undefined {
    let i = 0;
    let ret: number | undefined;
    setItemDelimiter(TAB);
    const text = sprite(this.spriteNum).member.text;
    while (i < lineCount(text)) {
      i = i + 1;
      if (eq(user, item(line(text, i), 1))) {
        ret = i;
        break;
      }
    }
    return ret;
  }

  fixMarker() {
    const i = this.getUserLine(this.lastselected);
    if (i !== undefined) sendSprite(this.spriteNum + 1, 'select', i);
    else sendSprite(this.spriteNum + 1, 'select', 500);
  }
}
