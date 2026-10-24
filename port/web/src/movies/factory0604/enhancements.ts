// The port's changes to the garage that aren't bug fixes (those are in ../fixes.ts),
// kept apart from the translated scripts and switchable back with ?quirks=...:
//
// - Super weapons for credits (the maintainer; ?quirks=superpack restores the original): the
//   Super Weapons pages sold their weapons only as Super Packs, for real money (an SMS
//   or Miniclip's payment page; the server then put the weapons in the robot's
//   friendslist). Now each weapon's page buys that weapon for its listed price (320
//   credits) like any other part, and each pack's page buys the whole pack. A pack's
//   listed price (500) is below what its seven parts sell back for (up to 2016), which
//   would let anyone mint credits, so packs cost 2100: more than the resale, less than
//   the parts bought one by one (2220 and 2240).

import { member, type TextualMember } from '../../director';
import { LList, sym, type LSymbol } from '../../lingo';

const quirks = (new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('quirks') ?? '').split(',');

export const garageFixes = {
  superCredits: !quirks.includes('superpack'),
};

/** The Super Weapons pages (the "ammo" marker + 1-14): the part each page shows. */
export const SUPER_PAGES: Record<number, string> = {
  146: 'v1', 147: 'v9', 148: 'v4', 149: 'v16', 150: 'v17', 151: 'v3', 152: 'p1',
  153: 'v31', 154: 'v32', 155: 'v33', 156: 'v34', 157: 'v35', 158: 'v36', 159: 'p2',
};

/** What the packs hold (from their purchase texts: Super Weapons 1-6 and the Nuclear battery; 7-12 and the SpyCam) and their credit price. */
export const SUPER_PACKS: Record<string, { contents: LSymbol[]; price: number }> = {
  p1: { contents: ['v1', 'v9', 'v4', 'v16', 'v17', 'v3', 'b3'].map((p) => sym(p)), price: 2100 },
  p2: { contents: ['v31', 'v32', 'v33', 'v34', 'v35', 'v36', 'v37'].map((p) => sym(p)), price: 2100 },
};

export const packContents = (pack: string) => new LList(SUPER_PACKS[pack.toLowerCase()]?.contents ?? []);

let descriptionsDone = false;

/**
 * The super weapons' descriptions (texter cast, "<part> desc") give a yellow "Sale value"
 * (the 90% they sell back for); the other parts give their green "Price". Make the
 * super weapons' read like the others, with the credit prices they now sell for.
 */
export function restyleSuperDescriptions(priceOf: (part: string) => number) {
  if (descriptionsDone) return;
  descriptionsDone = true;
  // The green of a regular part's price ("Dagger: Price: 10 credits").
  const dagger = member('v7 desc') as TextualMember | undefined;
  const at = dagger?.text.indexOf('10') ?? -1;
  const green = dagger && at >= 0 ? dagger.styled.runAt(at).color : undefined;
  for (const part of Object.values(SUPER_PAGES)) {
    const m = member(part + ' desc') as TextualMember | undefined;
    if (!m || !('styled' in m)) continue;
    const label = m.text.indexOf('Sale value: ');
    if (label < 0) continue;
    m.styled.splice(label, label + 'Sale value: '.length, 'Price: ');
    const from = label + 'Price: '.length;
    const end = m.text.indexOf(' credits', from);
    if (end < 0) continue;
    // Packs write thousands with a space ("2 016").
    const price = priceOf(part);
    const text = price >= 1000 ? `${Math.trunc(price / 1000)} ${String(price % 1000).padStart(3, '0')}` : String(price);
    m.styled.splice(from, end, text);
    if (green) m.styled.restyle(from, from + text.length, (r) => ({ ...r, color: green }));
    m.touch();
  }
}
