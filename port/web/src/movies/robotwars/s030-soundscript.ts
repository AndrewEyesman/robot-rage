// robotwars movie script 30 "soundscript": plays a sound member in the first free
// channel from 3 to 8.

import { member, playOneShot, puppetSound, sound, soundBusy, SoundMember } from '../../director';
import { touchMode } from '../../mobile';
import { gameFixes } from '../fixes';

export function playsound(name: string, v0: number): number {
  // gameFixes.touchClick: on a touch screen the button click plays outside the channels,
  // where the release's stops (the doors, a movie switch) can't cut it (fixes.ts).
  if (gameFixes.touchClick && touchMode() && name.toLowerCase() === 'knappljud') {
    const m = member(name);
    if (m instanceof SoundMember) {
      playOneShot(m, v0);
      return 0;
    }
  }
  let ch = 3;
  while (soundBusy(ch) && ch < 8) {
    ch = ch + 1;
    if (sound(ch).volume === 0) sound(ch).stop();
  }
  if (ch <= 8) {
    sound(ch).volume = v0;
    puppetSound(ch, name);
  }
  return ch;
}
