// Small helpers the arena's weapon translations share (not part of the original
// scripts). The weapons reach the robots, the frame script and each other through
// sprites, as the originals do: `sprite(robotSp).angle` is a script property of the
// robot behavior on that channel, `sendSprite(0, #createSprite, ...)` goes to the
// frame script.

import { G, sprite } from '../../director';
import type { Shockwave3dMember } from '../../director/s3d';
import { lingoEquals, propList, sym, type LValue } from '../../lingo';

/** Lingo `=` (case-insensitive strings, 1 = 1.0, VOID = 0). */
export const eq = (a: LValue, b: LValue): boolean => lingoEquals(a, b);

/** `sprite(n).name`: a script property of one of the sprite's behaviors (VOID if none has it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sp(n: number, name: string): any {
  return sprite(n).getProp(name);
}

/** `sprite(n).name = v` for a script property. */
export function setSp(n: number, name: string, v: unknown) {
  sprite(n).setProp(name, v);
}

/** global world */
export const world = (): Shockwave3dMember => G.world;

/** `PI / 180`, written out where the originals write `angle * PI / 180`. */
export const DEG = Math.PI / 180;

/**
 * muInstance.sendNetMessage([#recipients: gOpponent, #subject: s, #content: c, #udp: gUseUDP]).
 * The content's keys and values are given as alternating arguments, in the original's order.
 */
export function sendToOpponent(subject: string, ...content: LValue[]) {
  const mu = G.muInstance;
  if (!mu || typeof mu.sendNetMessage !== 'function') return undefined;
  return mu.sendNetMessage(propList(sym('recipients'), G.gOpponent, sym('subject'), subject, sym('content'), propList(...content), sym('udp'), G.gUseUDP));
}
