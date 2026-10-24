// arena104 behavior 152 "surrend button" (SURRENDER, sprite 204 in a match): give up the
// round, which ends the match as a walkover.

import { sendSprite } from '../../director';
import { sym } from '../../lingo';

export class SurrendButton {
  mouseUp() {
    sendSprite(0, sym('walkover'));
  }
}
