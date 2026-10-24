// arena104 behavior 160, the chat field's send button (sprite 212): sends the line.

import { cursor, sendSprite } from '../../director';
import { sym } from '../../lingo';

export class ChatSend {
  mouseEnter() {
    cursor(280);
  }

  mouseLeave() {
    cursor(-1);
  }

  mouseUp() {
    sendSprite(211, sym('ChatLineEnter'));
  }
}
