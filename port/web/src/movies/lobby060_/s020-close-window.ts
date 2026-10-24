// lobby060_ behavior 20: closes the browser window (not in the score).

import { Behavior, go, gotoNetPage, the } from '../../director';

export class CloseWindow extends Behavior {
  exitFrame() {
    gotoNetPage('javaScript:self.window.close()');
    go(the.frame + 1);
  }
}
