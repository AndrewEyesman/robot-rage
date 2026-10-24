// robotwars movie script 11 "purl": prepareMovie for the movies without their own
// (garage, lobby): the server URL, the version list, the part table, a sample
// opponent. Plus the empty robot every new robot starts as.

import { DColor, G, dot, member, pass, put } from '../../director';
import { LList, LPropList, TAB, item, itemCount, line, lineCount, offset, deleteChunk, propList, setItemDelimiter, sym, symbol, voidp } from '../../lingo';
import { createRobotSample2 } from './s013-robot-descriptions';
import { createPartDescription } from './s049-part-description';

export function prepareMovie() {
  put('nystart');
  // the alertHook = script("Alert"): the player already logs script errors and plays on.
  G.gUrl = dot(G.gShockplay, 'info', 'gUrl');
  if (voidp(G.gopponentdata)) {
    put('gOpponentData was void');
    G.gopponentdata = createRobotSample2();
  }
  // the exitLock only matters to a projector.
  if (voidp(G.gVersionList)) {
    // importFileInto(member("version", "robotwars"), the moviePath & "version.txt"): the
    // member already holds the text of the version.txt the game shipped with, so it is
    // left as it is.
    member('version', 'robotwars').font = 'Verdana';
    G.gVersionList = parseTabText(member('version', 'robotwars').text);
  }
  if (voidp(G.gPartDescription)) createPartDescription();
  pass();
}

export function clearRobotProplist(): LPropList {
  const rd = propList(
    sym('ram'), new LList([sym('r1')]), sym('torn'), new LList(), sym('hjul'), new LList([sym('h2')]), sym('motor'), new LList([sym('ma1')]),
    sym('batteri'), new LList([sym('b1')]), sym('vapen'), new LList(), sym('wpnPos'), new LList(), sym('special'), new LList(), sym('ammunition'), new LList(),
  );
  member('map1a').image.fill(member('map1a').image.rect, DColor.hex('0x888888'));
  member('map1b').image.fill(member('map1b').image.rect, DColor.hex('0x888888'));
  return propList(sym('robotDescription'), rd, sym('inventory'), new LList(), sym('money'), 50, sym('space'), 100, sym('spaceleft'), 10, sym('maxSpeed'), 40, sym('pansar'), 50, sym('info1'), 1112 - 50);
}

/** version.txt: "name<TAB>version" lines, as [#name: [#fname: "name102.dcr", #version: "1.02"]]. */
export function parseTabText(txt: string): LPropList {
  // Sets the itemDelimiter for good, as the original does.
  setItemDelimiter(TAB);
  const L = new LPropList();
  for (let i = 1; i <= lineCount(txt); i++) {
    const s = line(txt, i);
    let V = item(s, 2);
    const p = offset('.', V);
    if (p > 0) V = deleteChunk(V, ['char', p]);
    if (itemCount(s) > 1) {
      const name = item(s, 1);
      let fname: string;
      if (name.toLowerCase() === 'shockplay') fname = name + V + '.cct';
      else fname = name + V + '.dcr';
      L.addProp(symbol(name), propList(sym('fname'), fname, sym('version'), item(s, 2)));
    }
  }
  return L;
}
