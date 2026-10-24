// login013_ behaviors 81-87: the login, use, create, new-robot, name and quit buttons.

import { Behavior, keyPressed, sendSprite, sprite, the } from '../../director';

/** 81 "loginbtn": click, or Return. */
export class Loginbtn extends Behavior {
  mouseUp() {
    sendSprite(0, 'login', this);
  }
  exitFrame() {
    if (keyPressed(36)) sendSprite(0, 'login', this);
  }
}

/** 82 "usebtn" */
export class Usebtn extends Behavior {
  mouseUp() {
    sendSprite(0, 'StartGame', this);
  }
}

/** 83 "createbtn" */
export class Createbtn extends Behavior {
  mouseUp() {
    sendSprite(0, 'CreateMember', this);
  }
}

/** 84 "newbtn": slides the new-robot panel (sprites 24-29) in or out. */
export class Newbtn extends Behavior {
  mouseUp() {
    if (sprite(24).locV < 0) {
      for (let i = 24; i <= 29; i++) {
        sprite(i).locV = sprite(i).locV + 390;
        the.keyboardFocusSprite = 25;
      }
    } else {
      for (let i = 24; i <= 29; i++) {
        sprite(i).locV = sprite(i).locV - 390;
        the.keyboardFocusSprite = 0;
      }
    }
  }
}

/** 85 "namebtn" */
export class Namebtn extends Behavior {
  mouseUp() {
    sendSprite(0, 'CreateRobot', this);
  }
}

/** 87 "quitbtn" */
export class Quitbtn extends Behavior {
  mouseUp() {
    sendSprite(0, 'logout', this);
  }
}
