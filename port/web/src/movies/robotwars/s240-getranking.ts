// robotwars movie script 240 "Getranking": the ranking shown for a score.

import { the } from '../../director';
import { numToChar } from '../../lingo';

export function getranking(temp_score: number): string | undefined {
  if (temp_score < 250) {
    if (the.machineType === 256) return numToChar(151);
    return numToChar(209);
  }
  if (temp_score < 500) return '+';
  if (temp_score < 1000) return '++';
  if (temp_score < 2000) return '+++';
  if (temp_score < 4000) return '++++';
  if (temp_score >= 4000) return '+++++';
  return undefined;
}
