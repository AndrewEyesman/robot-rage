// factory0604 behavior 92 "jump to quit" (frame 57, after the robot is saved): back to
// the login movie's logout frame.

import { Behavior } from '../../director';
import { JumpMovie } from '../robotwars/s007-jump-movie';

export class JumpToQuit extends Behavior {
  exitFrame() {
    JumpMovie('login', 'logout');
  }
}
