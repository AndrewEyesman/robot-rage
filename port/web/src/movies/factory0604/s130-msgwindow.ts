// factory0604 behavior 130 (sprite 82, frames 1-77): Alt-click jumps to the debug frame
// "msgwindow" (a marker this movie doesn't have, so go() does nothing).

import { Behavior, go, the } from '../../director';

export class MsgWindow extends Behavior {
  mouseUp() {
    if (the.optionDown) go('msgwindow');
  }
}
