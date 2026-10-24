// robotwars movie script 34: getMyIP, the address the lobby gives opponents (an
// external address cookie if there is one, else a local one, else 0).

import { MultiuserXtra, put } from '../../director';
import { EMPTY, starts, stringp, word, type LValue } from '../../lingo';
import { eq } from './util';

export function getMyIP(): LValue {
  const x = new MultiuserXtra();
  let pfoundIP: LValue = 0;
  for (let i = 1; i <= 10; i++) {
    const ip = x.getNetAddressCookie(1, i);
    if (!isRealLocalIp(ip)) pfoundIP = ip;
  }
  if (stringp(pfoundIP)) {
    put('detta Šr ett externt ip');
    return pfoundIP;
  }
  for (let i = 1; i <= 10; i++) {
    const ip = x.getNetAddressCookie(1, i);
    if (isRealLocalIp(ip) && !eq(ip, EMPTY)) pfoundIP = ip;
  }
  put('detta Šr ett internt ip');
  return pfoundIP;
}

export function isRealLocalIp(ip: string): number {
  if (eq(ip, EMPTY)) return 1;
  ip = word(ip, 2);
  if (starts(ip, 'bd8e5e342066')) return 1;
  if (starts(ip, 'bd8e53e4')) return 1;
  if (starts(ip, 'bd874ff')) return 1;
  return 0;
}
