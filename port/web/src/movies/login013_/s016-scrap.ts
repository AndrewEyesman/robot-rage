// login013_ behavior "scrap": asks to delete the selected robot.

import { Behavior, sendSprite } from '../../director';

export class Scrap extends Behavior {
  mouseUp() {
    sendSprite(0, 'DeleteRobot', this);
  }
}
