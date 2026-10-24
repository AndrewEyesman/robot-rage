// arena104 behavior 231 "yesabuse" (the YES button of the report-abuse question):
// reports the opponent with the chat history (reportabuse to abuse.asp), then drops
// the flag.

import { Behavior, G, cursor, member, pass, sprite } from '../../director';
import { LPropList, rgb } from '../../lingo';
import { RobotWarsSend } from '../robotwars/s019-net-lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { pget } from './util';

// global gAbuse, gUserData, gopponentdata, gVersionList, gMyIP, gOpIP

export class YesAbuse extends Behavior {
  sp: number = undefined as unknown as number;
  pname: string = undefined as unknown as string;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    cursor(280);
  }

  mouseLeave() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    cursor(-1);
  }

  mouseUp() {
    // global gMyEmail
    const infoList = new LPropList();
    infoList.addProp('action', 'reportabuse');
    infoList.addProp('user1id', pget(G.gUserData, 'robotid'));
    infoList.addProp('user2id', pget(G.gopponentdata, 'robotid'));
    infoList.addProp('user1name', pget(G.gUserData, 'robotname'));
    infoList.addProp('user2name', pget(G.gopponentdata, 'robotname'));
    infoList.addProp('user1ip', G.gMyIP);
    infoList.addProp('user2ip', G.gOpIP);
    infoList.addProp('chattext', member('chat history').text);
    infoList.addProp('myemail', G.gMyEmail);
    const pnetId = RobotWarsSend('abuse.asp', infoList);
    void pnetId;
    G.gAbuse = 0;
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
    return pass();
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
    sprite(this.sp + 1).color = rgb(128, 128, 0);
    return pass();
  }

  mouseUpOutSide() {
    this.setMember('');
    sprite(this.sp + 1).color = rgb(196, 196, 0);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }
}
