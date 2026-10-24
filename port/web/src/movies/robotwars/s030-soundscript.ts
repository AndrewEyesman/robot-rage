// robotwars movie script 30 "soundscript": plays a sound member in the first free
// channel from 3 to 8.

import { puppetSound, sound, soundBusy } from '../../director';

export function playsound(name: string, v0: number): number {
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
