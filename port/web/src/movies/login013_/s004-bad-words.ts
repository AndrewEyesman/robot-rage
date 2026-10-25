// login013_ behavior 4: fetches the bad-language list into member "badwords1". With
// gameFixes.keepLogin a kept login goes on to the robot list, never showing the login screen.

import { Behavior, getNetText, go, member, netDone, netTextResult, the } from '../../director';
import { EMPTY } from '../../lingo';
import { resumeKeptLogin } from './s009-login-frame';

export class BadWords extends Behavior {
  theNetID: number | undefined;

  beginSprite() {
    const tUrl = the.moviePath + '..\\badlanguage.txt';
    this.theNetID = getNetText(tUrl);
    member('username_box').text = EMPTY;
  }

  exitFrame() {
    if (netDone(this.theNetID)) {
      member('badwords1').text = netTextResult(this.theNetID);
      if (resumeKeptLogin()) go('listrobots');
    } else go(the.frame);
  }
}
