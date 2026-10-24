// robotwars movie script 65 "Badlanguage": the chat filter, from member "badwords1"
// (line 1: words matched anywhere, line 2: " word " list matched as whole words).

import { member } from '../../director';
import { EMPTY, char, contains, length, line, word, wordCount } from '../../lingo';
import { SearchAndReplace } from './s004-new-init';

export function isBadLanguage(s: string): number {
  let badwords: string = member('badwords1').text;
  for (let i = 1; i <= wordCount(badwords); i++) {
    const w = word(badwords, i);
    if (contains(s, w)) return 1;
  }
  badwords = line(member('badwords1').text, 2);
  for (let i = 1; i <= wordCount(s); i++) {
    const w = word(s, i);
    if (contains(badwords, ' ' + w + ' ')) return 1;
  }
  return 0;
}

export function FilterBadLanguage(s: string): string {
  let badwords = line(member('badwords1').text, 1);
  for (let i = 1; i <= wordCount(badwords); i++) {
    const w = word(badwords, i);
    if (contains(s, w)) s = SearchAndReplace(s, w, replaceVocal(w));
  }
  badwords = line(member('badwords1').text, 2);
  for (let i = 1; i <= wordCount(s); i++) {
    const w = word(s, i);
    if (contains(badwords, ' ' + w + ' ')) s = SearchAndReplace(s, w, replaceVocal(w));
  }
  return s;
}

export function FilterBadLanguage2(s: string): number {
  let badwords = line(member('badwords1').text, 1);
  for (let i = 1; i <= wordCount(badwords); i++) {
    const w = word(badwords, i);
    if (contains(s, w)) return 1;
  }
  badwords = line(member('badwords1').text, 2);
  for (let i = 1; i <= wordCount(s); i++) {
    const w = word(s, i);
    if (contains(badwords, ' ' + w + ' ')) return 1;
  }
  return 0;
}

/** Vowels (Swedish ones as Mac Roman bytes) become "*". */
export function replaceVocal(w: string): string {
  let r = EMPTY;
  for (let i = 1; i <= length(w); i++) {
    if (contains('aouŒeiyŠšŸŽ', char(w, i))) {
      r = r + '*';
      continue;
    }
    r = r + char(w, i);
  }
  return r;
}
