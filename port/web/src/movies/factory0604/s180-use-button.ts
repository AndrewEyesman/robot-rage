// factory0604 script 180 "use button behavior": a parent script on the workshop's
// inventory icons and their "Use this part" buttons (puppet sprites): describes the
// part through sprite 84, and installs it on mouseDown (#UsePart to every sprite).

import { cursor, member, sendAllSprites, sendSprite, the } from '../../director';
import { EMPTY, lingoString, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

export class UseButtonBehavior {
  sp: number;
  name: LValue;
  state: LSymbol;
  n: LValue;
  part: LValue;
  x: LValue;

  constructor(sp0: number, part0: LValue, n0: LValue, name0: LValue) {
    this.sp = sp0;
    this.name = name0;
    this.n = n0;
    this.part = part0;
    this.state = sym('idle');
  }

  mouseEnter() {
    if (the.mouseH < 25 || the.mouseH > 410) cursor(-1);
    else {
      sendSprite(84, 'buildMess', member(lingoString(this.part) + ' text').text, sym('noflash'));
      cursor(280);
    }
  }

  mouseLeave() {
    sendSprite(84, 'buildMess', EMPTY);
    cursor(-1);
  }

  mouseDown() {
    playsound('knappljud', 255);
    sendSprite(1, 'usedoktor');
    sendAllSprites('UsePart', this.part, this.n);
    sendSprite(1, 'makedoktor');
  }
}
