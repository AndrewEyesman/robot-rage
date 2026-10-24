// arena104 behavior 155 "check renderer", the frame script of frames 2 and 17: with
// software 3D rendering it shows a warning for up to 20 s (a click skips it), then
// goes on. The port always renders with WebGL (the active3dRenderer is #openGL).

import { G, go, member, sendSprite, sprite, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

// global gRender

export class CheckRenderer {
  ms: number = undefined as unknown as number;
  state: LSymbol | undefined = undefined;

  beginSprite() {
    sendSprite(1, sym('usedoktor'));
    this.ms = the.milliSeconds;
    the.preferred3dRenderer = G.gRender;
    member('chat overlay').text = '';
    this.state = sym('init');
  }

  mouseUp() {
    go(the.frame + 1);
  }

  exitFrame() {
    if (this.state === sym('init')) {
      if (the.active3dRenderer === sym('software')) {
        sprite(10).locV = 200;
        if (the.machineType !== 256) {
          sprite(10).member = member('warning Mac');
        }
        this.state = sym('wait');
      } else {
        this.state = sym('done');
      }
      go(the.frame);
    } else if (this.state === sym('wait')) {
      if (the.milliSeconds > this.ms + 20000) {
        this.state = sym('done');
      }
      go(the.frame);
    } else if (this.state === sym('done')) {
      go(the.frame + 1);
    }
  }
}
