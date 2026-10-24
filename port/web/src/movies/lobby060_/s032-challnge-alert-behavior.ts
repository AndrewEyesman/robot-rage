// lobby060_ behavior 32 "Challnge_alert_behavior" (sprite 38): while a challenge is
// waiting, flashes the sprite once a second with the challenge sound.

import { Behavior, sprite, the } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq } from './util';

export class ChallngeAlertBehavior extends Behavior {
  pState: LSymbol | undefined;
  sp = 0;
  adder: LValue;
  id: LValue;
  /** VOID (0 in arithmetic) until the first flash. */
  lastsecond = 0;

  prepareFrame() {
    if (this.pState === sym('Alarm')) {
      if (Math.trunc(the.milliSeconds / 1000) - this.lastsecond >= 1) {
        playsound('challegeSound', 255);
        this.lastsecond = Math.trunc(the.milliSeconds / 1000);
        sprite(this.sp).blend = 100;
      }
      sprite(this.sp).blend = 100 - Math.trunc((the.milliSeconds - this.lastsecond * 1000) / 10);
    } else if (this.pState === sym('NoAlarm')) {
      sprite(this.sp).blend = 0;
    }
  }

  beginSprite() {
    this.sp = this.spriteNum;
    this.pState = sym('NoAlarm');
  }

  SetChallengeAlarm(bool: LValue) {
    this.pState = eq(bool, 1) ? sym('Alarm') : sym('NoAlarm');
  }
}
