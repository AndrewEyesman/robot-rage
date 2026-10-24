// factory0604 behavior 12 "flytta preview" (move preview; the PREVIEW / STATS /
// HIGHSCORE tabs, sprites 61, 63, 65): shows the 3D preview (sprite 6), the stats
// (98) or the highscore (99) by moving the others off the stage, and lights the tab.

import { Behavior, member, rgbColor, sendAllSprites, sprite } from '../../director';
import { playsound } from '../robotwars/s030-soundscript';

// Called without `me` in the original: plain handlers of this script.
function setMember(i: number, j: number, k: number) {
  sprite(i).member = member('smallbtnC');
  sprite(i + 1).color = rgbColor(196, 196, 0);
  sprite(j).member = member('smallbtn');
  sprite(j + 1).color = rgbColor(196, 196, 0);
  sprite(k).member = member('smallbtn');
  sprite(k + 1).color = rgbColor(196, 196, 0);
}

function setMember1(i: number, j: number, k: number) {
  sprite(i).member = member('smallbtnD');
  sprite(i + 1).color = rgbColor(128, 128, 0);
  sprite(j).member = member('smallbtn');
  sprite(j + 1).color = rgbColor(196, 196, 0);
  sprite(k).member = member('smallbtn');
  sprite(k + 1).color = rgbColor(196, 196, 0);
}

export class FlyttaPreview extends Behavior {
  sp = 0;
  pname: unknown;

  beginSprite() {
    this.sp = this.spriteNum;
    sprite(6).locV = 310;
    sprite(98).locV = -1000;
    sprite(99).locV = -1000;
    setMember(61, 63, 65);
  }

  mouseDown() {
    playsound('knappljud', 255);
    if (this.sp === 61) setMember1(61, 63, 65);
    if (this.sp === 63) setMember1(63, 65, 61);
    if (this.sp === 65) setMember1(65, 61, 63);
  }

  mouseUp() {
    if (this.sp === 61) {
      sendAllSprites('hidehiscore');
      sprite(6).locV = 310;
      sprite(98).locV = -1000;
      sprite(99).locV = -1000;
      setMember(61, 63, 65);
    }
    if (this.sp === 63) {
      sprite(98).locV = 210;
      sendAllSprites('hidehiscore');
      sendAllSprites('showstatsNow');
      sprite(6).locV = -1000;
      sprite(99).locV = -1000;
      setMember(63, 65, 61);
    }
    if (this.sp === 65) {
      sendAllSprites('updateHiscore');
      sprite(99).locV = 310;
      sprite(6).locV = -1000;
      sprite(98).locV = -1000;
      setMember(65, 61, 63);
    }
  }
}
