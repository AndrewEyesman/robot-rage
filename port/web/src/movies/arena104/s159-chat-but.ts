// arena104 behavior 159 "chat but" (the CHAT button, sprite 213): raises the chat field
// unless chat is off (gCHat) or the abuse dialog is up (gAbuse); the member's "D"
// variant is the pressed look.

import { Behavior, G, cursor, pass, sendSprite, sprite } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq } from './util';

// global gCHat, gAbuse

const chatOn = () => eq(G.gCHat, 1) && eq(G.gAbuse, 0);

export class ChatBut extends Behavior {
  sp: number = undefined as unknown as number;
  pname: string = undefined as unknown as string;
  pState: LSymbol | undefined = undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
    G.gAbuse = 0;
    if (eq(G.gCHat, 0)) {
      this.setMember('D');
    }
    this.pState = sym('idle');
  }

  mouseUp() {
    if (chatOn()) {
      this.setMember('');
      sendSprite(211, sym('ChatLineStart'));
      return pass();
    }
  }

  mouseEnter() {
    if (chatOn()) {
      cursor(280);
    }
  }

  mouseLeave() {
    if (chatOn()) {
      this.setMember('');
      cursor(-1);
    }
  }

  mouseDown() {
    if (chatOn()) {
      playsound('knappljud', 255);
      this.setMember('D');
      return pass();
    }
  }

  mouseUpOutSide() {
    if (chatOn()) {
      this.setMember('');
      this.pState = sym('idle');
    }
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }

  abuse(state: LValue) {
    if (state === sym('on')) {
      this.setMember('D');
    } else {
      this.setMember('');
    }
  }
}
