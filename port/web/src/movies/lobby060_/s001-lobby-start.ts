// lobby060_ behavior 1 (frame 2's script): marks the player as in the lobby and
// creates the IRC client (gIRC) and the room object (gRoom) the first time.

import { Behavior, G, go, put, script, sendSprite, the } from '../../director';
import { sym, voidp } from '../../lingo';
import { ensureEmptyWorld } from './shim-empty-world';

export class LobbyStart extends Behavior {
  theNetID: unknown;

  beginSprite() {
    ensureEmptyWorld('robot'); // TEMPORARY SHIM, see shim-empty-world.ts
    sendSprite(1, 'usedoktor');
    put('läser');
    // the preferred3dRenderer = #openGL: the port has one 3D renderer.
    G.gGamePlace = sym('lobby');
    if (voidp(G.gIRC)) {
      const Irc = script('IRC_OBJECT');
      const Room = script('room object');
      G.gIRC = Irc ? new Irc() : undefined;
      G.gRoom = Room ? new Room() : undefined;
    }
  }

  exitFrame() {
    put(G.gShockplay);
    go(the.frame + 1);
  }
}
