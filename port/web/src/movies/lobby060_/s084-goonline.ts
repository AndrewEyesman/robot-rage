// lobby060_ behavior 84 "goONline": the back button of a country (back to "inne").

import { Behavior, G, go } from '../../director';

export class GoOnline extends Behavior {
  mouseUp() {
    G.gLastroom = undefined;
    G.gRoom.LeaveRoom();
    go('inne');
  }
}
