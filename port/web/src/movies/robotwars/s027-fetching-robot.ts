// robotwars behavior 27: "Hämtar robot" (fetching robot) on the door, every frame.

import { Behavior, sendAllSprites } from '../../director';

export class FetchingRobot extends Behavior {
  exitFrame() {
    // The text is Mac Roman bytes: on Windows the "ä" shows as "Š".
    sendAllSprites('showDoorMessage', 'HŠmtar robot');
  }
}
