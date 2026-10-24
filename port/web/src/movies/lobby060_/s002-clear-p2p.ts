// lobby060_ behavior 2: clears the multiuser instances, but the names are locals here
// (no global declaration), so it changes nothing.

import { Behavior } from '../../director';

export class ClearP2P extends Behavior {
  beginSprite() {
    // P2PmuInstanceListen = VOID, P2PmuInstanceConnect = VOID, SMUSmuInstance = VOID: locals.
  }
}
