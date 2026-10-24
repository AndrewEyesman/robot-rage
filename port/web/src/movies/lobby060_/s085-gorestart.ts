// lobby060_ behavior 85 "goRestart": the button of the firewall notice (frame "FWError").

import { Behavior, sendSprite } from '../../director';

export class GoRestart extends Behavior {
  mouseUp() {
    sendSprite(0, 'Relogin');
  }
}
