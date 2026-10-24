// factory0604 behaviors 170 and 285 (identical, unused in the score): closes the
// browser window (a page script; the port ignores javascript: URLs) and holds the frame.

import { Behavior, go, gotoNetPage, the } from '../../director';

export class CloseWindow extends Behavior {
  exitFrame() {
    gotoNetPage('javaScript:self.window.close()');
    go(the.frame);
  }
}
