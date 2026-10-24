// login013_ behavior 4: fetches the bad-language list into member "badwords1".

import { Behavior, getNetText, go, member, netDone, netTextResult, the } from '../../director';
import { EMPTY } from '../../lingo';

export class BadWords extends Behavior {
  theNetID: number | undefined;

  beginSprite() {
    const tUrl = the.moviePath + '..\\badlanguage.txt';
    this.theNetID = getNetText(tUrl);
    member('username_box').text = EMPTY;
  }

  exitFrame() {
    if (netDone(this.theNetID)) member('badwords1').text = netTextResult(this.theNetID);
    else go(the.frame);
  }
}
