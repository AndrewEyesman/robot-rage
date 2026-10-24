// login013_ behavior "DodeleteRobot": confirms deleting the robot.

import { Behavior, sendSprite } from '../../director';

export class DodeleteRobot extends Behavior {
  mouseUp() {
    sendSprite(0, 'DoDeleteRobot', this);
  }
}
