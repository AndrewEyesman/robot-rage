// robotwars behavior 59 "HwlpPop": the help page (a page script of the fan site).

import { Behavior, gotoNetPage } from '../../director';

export class HelpPop extends Behavior {
  mouseUp() {
    gotoNetPage('javascript:openHelpPop()');
  }
}
