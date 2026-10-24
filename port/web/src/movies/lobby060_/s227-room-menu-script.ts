// lobby060_ behavior 227 "room menu script" (an older room list; not in the score):
// draws the room list text over a template bitmap, highlights the clicked room and
// enters it after a second.

import { Behavior, G, go, member, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { DImage, rectOf, type DRect } from '../../director/image';
import { EMPTY, lineCount, sym, type LPoint, type LSymbol, type LValue } from '../../lingo';
import type { Sprite } from '../../director';

const offsetRect = (r: DRect, h: number, v: number): DRect => rectOf(r.left + h, r.top + v, r.right + h, r.bottom + v);

export class RoomMenuScript extends Behavior {
  pState: LSymbol | undefined;
  sp = 0;
  pSprite!: Sprite;
  pLineSpace = 0;
  pSelectedRoom = 0;
  pRoomUpdateTime = 0;
  pUpdateTime = 0;
  pstartTime = 0;
  pLastRoomList: LValue;
  pItemCount = 0;
  pImg!: DImage;
  pSrcImg!: DImage;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.pSprite = sprite(this.sp);
    this.pLineSpace = 16;
    this.pSelectedRoom = 0;
    this.pRoomUpdateTime = 5000;
    this.pLastRoomList = EMPTY;
    this.pImg = sprite(this.sp).member.image;
    this.pSrcImg = this.pImg.duplicate();
    this.pItemCount = 0;
    this.pstartTime = the.milliSeconds;
    const r = rectOf(0, 0, this.pImg.width, this.pImg.height);
    this.pImg.copyPixels(member('roommenu template').image, r, r);
    this.pState = sym('init');
  }

  buildRoomMenu(s: string) {
    if (this.pLastRoomList !== s) {
      const r = rectOf(0, 0, this.pImg.width, this.pImg.height);
      this.pImg.copyPixels(member('roommenu template').image, r, r);
      const textm = member('roommenu');
      textm.text = s;
      // textm.image: text members have no image in the port (this script is unused).
      const ti = textm.image as DImage;
      const tr = rectOf(0, 0, ti.width, ti.height);
      this.pImg.copyPixels(ti, offsetRect(tr, 0, -3), tr);
      this.pSrcImg = this.pImg.duplicate();
      this.pLastRoomList = s;
      this.pItemCount = lineCount(s);
    }
    this.hiliteLine(this.pSelectedRoom);
    this.pUpdateTime = the.milliSeconds + this.pRoomUpdateTime;
  }

  hiliteLine(n: number) {
    if (this.pSelectedRoom > 0) {
      const rt = rectOf(0, this.pSelectedRoom * 16 - 16, sprite(this.sp).width, this.pSelectedRoom * 16);
      this.pImg.copyPixels(this.pSrcImg, rt, rt);
    }
    if (n === 0) return;
    sprite(this.sp + 1).locV = sprite(this.sp).top + (n - 1) * this.pLineSpace + 2;
    const rt = rectOf(0, n * 16 - 16, sprite(this.sp).width, n * 16);
    const tImg = member('hilite color' + (n % 2)).image as DImage;
    this.pImg.copyPixels(tImg, rt, rectOf(0, 0, tImg.width, tImg.height), { ink: 33 });
  }

  hideRoom() {
    this.hiliteLine(0);
    this.pSelectedRoom = 0;
    this.pLastRoomList = EMPTY;
    this.pstartTime = the.milliSeconds;
    this.pUpdateTime = the.milliSeconds + 20000;
  }

  updateRoomList() {
    this.pUpdateTime = the.milliSeconds;
  }

  selectRoomLine(n: number) {
    this.hiliteLine(n);
    this.pSelectedRoom = n;
    if (n === 0) return;
    G.gRoom.pGame = n;
  }

  mouseDown() {
    if (this.pState !== sym('idle')) return;
    const n = this.loctoline(the.mouseLoc);
    if (n === 0) return;
    this.hiliteLine(n);
    this.pSelectedRoom = n;
    this.pstartTime = the.milliSeconds;
    sendAllSprites('hideUserInfo');
    // marker("rooms2"): no such label in this version, so go() stays.
    go('rooms2');
    this.pState = sym('waitEnterRoom');
  }

  endSprite() {
    G.gRoom.LeaveRoom();
  }

  loctoline(pt: LPoint) {
    const v = Number(pt.locV) - (sprite(this.sp).top + 4);
    let n = Math.trunc(v / this.pLineSpace) + 1;
    if (n > this.pItemCount) n = 0;
    if (n < 0) n = 0;
    return n;
  }

  prepareFrame() {
    if (this.pState === sym('init')) {
      this.hiliteLine(this.pSelectedRoom);
      this.pState = sym('idle');
    } else if (this.pState === sym('idle')) {
      if (the.milliSeconds >= this.pUpdateTime) {
        G.gIRC.GetRoomList(G.gRoom.getPrefix(), 1);
        this.pUpdateTime = the.milliSeconds + 20000;
      }
    } else if (this.pState === sym('waitEnterRoom')) {
      if (the.milliSeconds > this.pstartTime + 1000) {
        if (this.pSelectedRoom === 0) {
          this.pState = sym('idle');
          return;
        }
        this.pState = sym('EnterRoom');
      }
    }
  }

  exitFrame() {
    if (this.pState === sym('EnterRoom')) {
      if (this.pSelectedRoom > 0) {
        sendSprite(0, 'EnterRoom', this.pSelectedRoom);
        this.pstartTime = the.milliSeconds - this.pRoomUpdateTime;
        go('insideroom');
      } else {
        put('pSelectedRoom = 0!!!');
      }
      this.pUpdateTime = the.milliSeconds + this.pRoomUpdateTime;
      this.pState = sym('idle');
    }
  }
}
