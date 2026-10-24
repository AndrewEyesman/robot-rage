// arena104 behavior 143 "chat behavior", on the chat field (sprite 211): T or the CHAT
// button raises the field (with its frame, 210 and 212) and gives it the keyboard;
// RETURN sends the line (#sendChatMessage) and lowers it again. Every chat line also
// goes into "chat history" and the last three into "chat overlay", which is drawn over
// the 3D view as a texture. While the field is up (state not #hidden) the robot gets no
// keys (getKeyMap).

import { Behavior, G, member, pass, sendSprite, sprite, the } from '../../director';
import { LPoint, RETURN, TAB, chars, line, point, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { theOVerlay } from './s006-arena-3d';
import { n, setLinesFontSize, world } from './util';

// global world, gUserData, gWonGames, gLostGames

export class ChatBehavior extends Behavior {
  sp: number = undefined as unknown as number;
  state: LSymbol | undefined = undefined;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp).member.editable = 0;
    member('chat overlay').fontSize = 50;
    this.state = sym('hidden');
  }

  initChatLine() {
    if (n(G.gWonGames) + n(G.gLostGames) === 0) {
      member('chat overlay').text = RETURN + RETURN + RETURN;
    }
    let t1;
    if (world().texture('chat') === undefined) {
      t1 = world().newTexture('chat', sym('fromCastMember'), member('chat overlay'));
    } else {
      t1 = world().texture('chat');
    }
    t1.quality = sym('high');
    t1.renderFormat = sym('rgba8888');
    world().camera(1).addOverlay(t1, point(15, 10), 0);
    world().camera(1).overlay(theOVerlay('chat')!).scale = 0.27;
    world().camera(1).overlay(theOVerlay('chat')!).loc = point(15, 10);
  }

  keyDown() {
    if (the.key === RETURN) {
      this.ChatLineEnter();
    } else {
      return pass();
    }
  }

  ChatLineStart() {
    if (this.state === sym('hidden')) {
      sprite(this.sp - 1).locV = sprite(this.sp - 1).locV - 120;
      sprite(this.sp).locV = sprite(this.sp).locV - 120;
      sprite(this.sp + 1).locV = sprite(this.sp + 1).locV - 120;
      sprite(this.sp).member.editable = 1;
      the.keyboardFocusSprite = 211;
      this.state = sym('active1');
    } else {
      return pass();
    }
  }

  prepareFrame() {
    if (this.state === sym('active1')) {
      the.keyboardFocusSprite = 211;
      this.state = sym('Active');
    }
  }

  addChatLine(txtline: LValue, bo?: LValue) {
    // the machineType is 256 (Windows): no Mac character conversion.
    const text = String(txtline ?? '');
    let history = member('chat history').text as string;
    history = history + text + RETURN;
    member('chat history').text = history;
    playsound('chatsnd', 255);
    const overlayText = member('chat overlay');
    setLinesFontSize(overlayText, 1, 3, 50);
    // line[1..3].fixedLineSpace = 50: line spacing is per member in the runtime; the
    // lines keep their font's spacing.
    overlayText.text = line(overlayText.text, 2, 3) + RETURN + TAB + text;
    if (n(bo)) {
      setLinesFontSize(overlayText, 3, 3, 100);
    }
    if (world().texture('Chat') !== undefined) {
      world().deleteTexture('Chat');
    }
    const t1 = world().newTexture('Chat', sym('fromCastMember'), member('chat overlay'));
    t1.quality = sym('high');
    t1.renderFormat = sym('rgba8888');
    // The overlay still shows the deleted texture; the new one isn't attached to it.
    world().camera(1).overlay(theOVerlay('chat')!).loc = point(15, 10) as LPoint;
  }

  ChatLineEnter() {
    if (this.state !== sym('Active')) {
      return;
    }
    sprite(this.sp - 1).locV = sprite(this.sp - 1).locV + 120;
    sprite(this.sp).locV = sprite(this.sp).locV + 120;
    sprite(this.sp + 1).locV = sprite(this.sp + 1).locV + 120;
    let str = sprite(this.sp).member.text as string;
    if (str.length > 90) {
      str = chars(str, 1, 90);
    }
    sendSprite(0, sym('sendChatMessage'), str);
    sprite(this.sp).member.text = '';
    the.keyboardFocusSprite = 0;
    this.state = sym('hidden');
  }
}
