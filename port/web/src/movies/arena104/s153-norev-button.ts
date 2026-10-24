// arena104 behavior 153 "norev button" (sprite 206 after a round): no revenge, back to
// the lobby.

import { sendSprite } from '../../director';
import { sym } from '../../lingo';

export class NorevButton {
  mouseUp() {
    sendSprite(0, sym('goLobby'));
  }
}
