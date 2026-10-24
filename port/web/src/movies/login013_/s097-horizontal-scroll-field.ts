// login013_ behavior "Horizontal scroll (field)" (James Newton's library behavior,
// 2000): an editable one-line field that scrolls sideways when the text is longer
// than the box, doing all its own editing.

import { Behavior, pass, sendSprite, sprite, the, type Sprite } from '../../director';
import { max, num, type LValue } from '../../lingo';
import { gameFixes } from '../fixes';

export class HorizontalScrollField extends Behavior {
  mySprite: Sprite | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  myMember: any;
  myRight = 0;
  myLeft = 0;
  myWidth = 0;
  myVisibleText = '';
  myFullText = '';
  myClippedChars = 0;
  myStartChar: number | undefined;
  myEndChar = 0;
  mySelection: [number, number] = [0, 0];

  beginSprite() {
    this.mySprite = sprite(this.spriteNum);
    this.myMember = this.mySprite.member;
    this.myRight = this.mySprite.right;
    this.myLeft = this.mySprite.left;
    this.myWidth = num(this.myMember.rect.right);
    this.myFullText = this.myMember.text;
    this.myVisibleText = this.myFullText;
    this.myClippedChars = 0;
    this.myMember.boxType = 2; // #fixed
    this.myMember.editable = true;
    this.myMember.wordWrap = false;
    this.mySelection = [0, 0];
  }

  endSprite() {
    this.myMember.text = this.myFullText;
  }

  mouseDown() {
    this.myStartChar = -1;
  }

  mouseUp() {
    this.myStartChar = undefined;
    the.selStart = this.mySelection[0] - this.myClippedChars;
    the.selEnd = this.mySelection[1] - this.myClippedChars;
  }

  mouseUpOutSide() {
    this.mouseUp();
  }

  keyDown() {
    switch (the.keyCode) {
      case 36:
        sendSprite(this.spriteNum, 'validate', this.myFullText);
        break;
      case 48:
        return pass();
      case 115:
      case 116:
      case 126:
        this.jumpToBeginning();
        break;
      case 119:
      case 121:
      case 125:
        this.jumpToEnd();
        break;
      case 123:
        this.moveBack();
        break;
      case 124:
        this.moveForward();
        break;
      case 51:
      case 117:
        this.deleteChars(the.keyCode === 117);
        break;
      default:
        this.treatAlphaNumericKey();
    }
    this.mySelection = [the.selStart + this.myClippedChars, the.selEnd + this.myClippedChars];
  }

  exitFrame() {
    if (this.myStartChar !== undefined) {
      if (this.myStartChar === -1) {
        this.myStartChar = the.selStart + this.myClippedChars;
        this.myEndChar = the.selEnd + this.myClippedChars;
        this.mySelection = [this.myStartChar, this.myEndChar];
      } else if (the.mouseH > this.myRight || the.mouseH < this.myLeft) {
        this.scrollDrag(the.mouseH > this.myRight);
      }
      this.mySelection = [the.selStart + this.myClippedChars, the.selEnd + this.myClippedChars];
    }
  }

  getText() {
    return this.myFullText;
  }

  setText(newText: string) {
    this.myFullText = newText;
    this.myVisibleText = newText;
    this.myClippedChars = 0;
    this.myMember.text = newText;
  }

  private locH(n: number): number {
    return num(this.myMember.charPosToLoc(n).locH);
  }

  jumpToBeginning() {
    this.myVisibleText = this.myFullText;
    this.myMember.text = this.myVisibleText;
    this.myClippedChars = 0;
    the.selStart = 0;
    the.selEnd = 0;
  }

  jumpToEnd() {
    this.myMember.text = this.myFullText;
    let lastChar = this.myFullText.length;
    const fullWidth = this.locH(lastChar + 1);
    this.myClippedChars = lastChar;
    while (this.myClippedChars) {
      const startWidth = this.locH(this.myClippedChars);
      if (fullWidth - startWidth > this.myWidth) break;
      this.myClippedChars = this.myClippedChars - 1;
    }
    this.showText();
    lastChar = lastChar - this.myClippedChars;
    the.selStart = lastChar;
    the.selEnd = lastChar;
  }

  moveBack() {
    if (the.selStart !== the.selEnd) the.selEnd = the.selStart;
    else if (the.selStart) {
      the.selStart = the.selStart - 1;
      the.selEnd = the.selStart;
    } else if (this.myClippedChars) {
      this.myClippedChars = this.myClippedChars - 1;
      this.showText();
    }
  }

  moveForward() {
    const theStart = the.selStart;
    if (theStart !== the.selEnd) the.selStart = the.selEnd;
    else if (this.locH(theStart + 2) < this.myWidth) the.selStart = theStart + 1;
    else if (this.myClippedChars < this.myFullText.length) {
      let thisChar = theStart + 2;
      while (thisChar) {
        if (this.locH(thisChar) < this.myWidth) break;
        this.myClippedChars = this.myClippedChars + 1;
        this.showText();
        thisChar = thisChar - 1;
      }
    }
  }

  deleteChars(deleteKey: boolean | number) {
    let theStart = the.selStart;
    let startChar = theStart + this.myClippedChars;
    const endChar = the.selEnd + this.myClippedChars;
    if (startChar === endChar) {
      if (deleteKey) {
        startChar = startChar + 1;
        if (startChar > this.myFullText.length) return;
        theStart = theStart + 1;
      }
      if (!startChar) return;
      this.myFullText = this.myFullText.slice(0, startChar - 1) + this.myFullText.slice(startChar);
      switch (theStart) {
        case 0:
          this.myClippedChars = num(max(0, this.myClippedChars - 2));
          theStart = theStart + (this.myClippedChars !== 0 ? 1 : 0);
          break;
        case 1:
          if (this.myClippedChars) this.myClippedChars = this.myClippedChars - 1;
          else theStart = theStart - 1;
          break;
        default:
          theStart = theStart - 1;
      }
    } else {
      // gameFixes.scrollSelect: the field's selection, which mySelection only matches
      // when the behavior saw it made (not after Tab selects the field).
      const [a, b] = gameFixes.scrollSelect ? [startChar, endChar] : this.mySelection;
      this.myFullText = this.myFullText.slice(0, a) + this.myFullText.slice(b);
      deleteKey = 1;
    }
    this.showText(theStart);
    // The original compares a point with a number here: a point is never <= a
    // number in Lingo, so this branch doesn't run.
  }

  treatAlphaNumericKey() {
    const startChar = the.selStart + this.myClippedChars;
    const endChar = the.selEnd + this.myClippedChars;
    const t = this.myFullText;
    if (startChar === endChar) this.myFullText = t.slice(0, startChar) + the.key + t.slice(startChar);
    else this.myFullText = t.slice(0, startChar) + the.key + t.slice(endChar);
    this.showText();
    the.selEnd = the.selStart;
    this.moveForward();
  }

  showText(insertPoint?: LValue) {
    this.myVisibleText = this.myFullText;
    if (this.myClippedChars) this.myVisibleText = this.myVisibleText.slice(this.myClippedChars);
    this.myMember.text = this.myVisibleText;
    if (typeof insertPoint === 'number') {
      the.selStart = insertPoint;
      the.selEnd = insertPoint;
    }
  }

  scrollDrag(toRight: boolean) {
    if (toRight) {
      if (!(this.locH(this.myFullText.length + 1) <= this.myWidth)) this.myClippedChars = this.myClippedChars + 1;
      this.showText();
      the.selStart = (this.myStartChar ?? 0) - this.myClippedChars;
      the.selEnd = the.selEnd + 1;
      this.mySelection = [this.myStartChar ?? 0, the.selEnd + this.myClippedChars];
    } else if (this.myClippedChars) {
      this.myClippedChars = this.myClippedChars - 1;
      this.showText();
      the.selStart = 0;
      the.selEnd = this.myEndChar - this.myClippedChars;
      this.mySelection = [this.myClippedChars, this.myEndChar];
    }
  }
}

