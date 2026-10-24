// login013_ behaviors 90-92 and 104: the settings and robot list tabs, and the chat
// and 3D renderer settings.

import { Behavior, G, put, sendSprite, setPref, sprite, the } from '../../director';
import { LList, lingoString, num, sym, type LValue } from '../../lingo';

/** 90 "goset" */
export class Goset extends Behavior {
  mouseDown() {
    sendSprite(0, 'goset');
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
  }
  endSprite() {
    sprite(the.currentSpriteNum).cursor = 0;
  }
}

/** 91 "golist" */
export class Golist extends Behavior {
  mouseDown() {
    sendSprite(0, 'golist');
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
  }
  endSprite() {
    sprite(the.currentSpriteNum).cursor = 0;
  }
}

/** 92 "chatbut": chat on/off (gCHat, saved as a preference). */
export class Chatbut extends Behavior {
  sp = 0;
  beginSprite() {
    this.sp = this.spriteNum;
    sprite(the.currentSpriteNum).cursor = 280;
    this.setchat();
  }
  mouseDown() {
    G.gCHat = (num(G.gCHat) + 1) % 2;
    setPref('chatpref', lingoString(G.gCHat));
    this.setchat();
  }
  endSprite() {
    sprite(the.currentSpriteNum).cursor = 0;
  }
  setchat() {
    sprite(this.sp).member.text = num(G.gCHat) === 1 ? 'CHAT\tON' : 'CHAT\tOFF';
  }
}

/** 104 "renderbut": the preferred 3D renderer (only a preference in the port). */
export class Renderbut extends Behavior {
  sp = 0;
  pname: LList | undefined;
  pRender: LList | undefined;
  pNr: LValue;
  beginSprite() {
    this.sp = this.spriteNum;
    sprite(the.currentSpriteNum).cursor = 280;
    this.pRender = new LList([sym('auto'), sym('openGL'), sym('directX5_2'), sym('directX7_0')]);
    this.pname = new LList(['AUTO', 'OPENGL', 'DIRECTX 5.2', 'DIRECTX 7.0']);
    this.pNr = this.pRender.getOne(G.gRender);
    this.setchat();
  }
  mouseDown() {
    this.pNr = num(this.pNr) + 1;
    if (num(this.pNr) > 4) this.pNr = 1;
    G.gRender = this.pRender!.getAt(this.pNr);
    put(setPref('renderpref', lingoString(G.gRender)));
    this.setchat();
  }
  endSprite() {
    sprite(the.currentSpriteNum).cursor = 0;
  }
  setchat() {
    // pNr is 0 when gRender isn't in the list; Lingo's pname[0] is an error there.
    const n = num(this.pNr);
    sprite(this.sp).member.text = 'PREFERRED 3D RENDERER\t' + (n >= 1 ? String(this.pname!.getAt(n)) : '');
  }
}
