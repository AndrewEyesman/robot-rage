// lobby060_ behavior 27: the log-off button (sprite 41).

import { Behavior, sendSprite } from '../../director';
import { sym } from '../../lingo';

export class LogoffButton extends Behavior {
  mouseUp() {
    sendSprite(0, 'setState', sym('logoff'));
  }
}
