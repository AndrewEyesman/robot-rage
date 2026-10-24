// lobby060_ behavior 229 "enter lobby": enters the game's rooms (an older lobby; not in the score).

import { Behavior, G } from '../../director';

export class EnterLobby extends Behavior {
  exitFrame() {
    G.gRoom.EnterGame();
  }
}
