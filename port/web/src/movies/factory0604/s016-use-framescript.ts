// factory0604 behavior 16 "use framescript" (the Workshop's frame script, frame 5):
// lays out the robot's parts (a framed list per category, with armour arrows, weapon
// keys and placement menus, and Remove buttons) and the inventory with "Use this
// part" buttons, all as puppet sprites from channel 100; installs (#UsePart) and
// removes (#removePart) parts with the game's rules, and keeps the 3D preview
// (sprite 6) in step.

import { Behavior, go, member, put, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { LList, LPropList, lingoString, num, point, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { EnoughRoomForPart } from '../robotwars/s013-robot-descriptions';
import { cleanUpChannels, createSprite } from './create-sprite';
import { AddcounterButtonBehavior } from './s024-addcounter-button';
import { PopupMenuBehavior } from './s025-popup-menu';
import { UseButtonBehavior } from './s180-use-button';
import { RemoveButtonBehavior } from './s181-remove-button';
import { HorizontalScrollBehavior } from './s192-horizontal-scroll';
import { inventory, parts, robotDesc, userPL } from './util';

const buildMess = (text: string) => sendSprite(84, 'buildMess', text, sym('flash'));

export class UseFramescript extends Behavior {
  state: LSymbol | undefined;
  scrollx: LValue;
  pBack = 0;

  beginSprite() {
    this.CleanUpSprites();
    sendSprite(1, 'usedoktor');
    this.UpdateAll();
    this.pBack = 0;
    for (let i = 79; i <= 82; i++) sprite(i).visible = true;
    this.state = sym('idle');
  }

  CleanUpSprites() {
    cleanUpChannels(100, 500, true);
  }

  endSprite() {
    this.CleanUpSprites();
  }

  UsePart(name: LValue, inventoryNumber: LValue) {
    if (this.state !== sym('idle')) return;
    const part = symbol(name)!;
    const typ = (parts().getProp(part) as LPropList).prop('typ');
    const rd = robotDesc();
    const rdCategory = rd.getProp(typ) as LList;
    const inv = () => inventory();
    if (typ !== sym('ram') && typ !== sym('torn')) {
      if ((rd.prop('ram') as LList).count > 0) {
        if (!EnoughRoomForPart(rd, part)) {
          buildMess("You don't have enough space!");
          return;
        }
      }
    }
    let t: LValue;
    switch (typ) {
      case sym('ram'):
      case sym('motor'):
        if (rdCategory.count >= 1) {
          if (typ === sym('ram')) buildMess('You can only have one chassi!');
          if (typ === sym('motor')) buildMess('You can only have one engine!');
        } else if (typ === sym('ram')) {
          userPL().setaProp(sym('pansar'), 50);
          rdCategory.add(part);
          inv().deleteAt(inventoryNumber);
          sendSprite(6, 'add3DPart', part);
          sendSprite(6, 'updateTexture', 'map1A', 1);
        } else if ((rd.prop('ram') as LList).count > 0) {
          rdCategory.add(part);
          inv().deleteAt(inventoryNumber);
          sendSprite(6, 'add3DPart', part);
        } else {
          buildMess('You need a chassi to install a engine!');
        }
        break;
      case sym('torn'):
        if ((rd.prop('ram') as LList).count > 0) {
          if (rdCategory.count >= 1) buildMess('You can only have one tower!');
          else {
            const vapen = rd.prop('vapen') as LList;
            for (let i = 1; i <= vapen.count; i++) {
              t = vapen.getAt(i);
              if (t === sym('v8')) {
                buildMess('You cannot install a tower when a Power-Axe is installed!');
                break;
              }
            }
            if (t !== sym('v8')) {
              const add = part === sym('t1') ? 42 : part === sym('t2') ? 62 : part === sym('t3') ? 82 : 0;
              if (add) userPL().setaProp(sym('pansar'), num(userPL().prop('pansar')) + add);
              rdCategory.add(part);
              inv().deleteAt(inventoryNumber);
              sendSprite(6, 'add3DPart', part);
              sendSprite(6, 'updateTexture', 'map1B', 2);
            }
          }
        } else buildMess('You need a chassi to install a tower!');
        break;
      case sym('hjul'):
        if ((rd.prop('ram') as LList).count > 0) {
          if (rdCategory.count >= 1) buildMess('You can only have one set of wheels!');
          else {
            rdCategory.add(part);
            inv().deleteAt(inventoryNumber);
            sendSprite(6, 'add3DPart', part);
          }
        } else buildMess('You need a chassi to install wheels!');
        break;
      case sym('batteri'):
        if ((rd.prop('ram') as LList).count > 0) {
          if (rdCategory.count >= 2) buildMess('You can only have two batteries!');
          else {
            rdCategory.add(part);
            inv().deleteAt(inventoryNumber);
            sendSprite(6, 'add3DPart', part);
          }
        } else buildMess('You need a chassi to install batteries!');
        break;
      case sym('vapen'):
        if ((rd.prop('ram') as LList).count > 0) {
          const vapen = rd.prop('vapen') as LList;
          for (let i = 1; i <= vapen.count; i++) {
            t = vapen.getAt(i);
            if (t === part) {
              buildMess('You can only use one weapon of each kind!');
              return;
            }
          }
          if (t !== part) {
            const desc = parts().getProp(part) as LPropList;
            const monteras = desc.prop('monteras') as LList;
            const tWpnPos = desc.prop('wpnPos') as LList;
            const tTower = monteras.getPos(sym('t1'));
            const wpnPos = rd.prop('wpnPos') as LList;
            if (tTower) {
              if ((rd.prop('torn') as LList).count === 0) buildMess('You need a tower to install this weapon!');
              else {
                for (let i = 1; i <= wpnPos.count; i++) {
                  t = wpnPos.getAt(i);
                  if (t === sym('t')) {
                    buildMess('A weapon is already installed in the tower.');
                    return;
                  }
                }
                if (t !== sym('t')) {
                  rdCategory.add(part);
                  wpnPos.add(tWpnPos.getAt(1));
                  inv().deleteAt(inventoryNumber);
                  sendSprite(6, 'add3DPart', part);
                }
              }
            } else if (part === sym('v1') || part === sym('v13') || part === sym('v14') || part === sym('v15')) {
              for (let i = 1; i <= wpnPos.count; i++) {
                t = wpnPos.getAt(i);
                if (t === sym('b')) {
                  buildMess('A weapon is already installed in the back.');
                  return;
                }
              }
              if (t !== sym('b')) {
                rdCategory.add(part);
                wpnPos.add(tWpnPos.getAt(1));
                inv().deleteAt(inventoryNumber);
                sendSprite(6, 'add3DPart', part);
                this.pBack = 1;
              }
            } else if (part === sym('v8')) {
              if ((rd.prop('torn') as LList).count === 0) {
                for (let i = 1; i <= wpnPos.count; i++) {
                  t = wpnPos.getAt(i);
                  if (t === sym('f')) {
                    buildMess('A weapon is already installed in the front.');
                    return;
                  }
                }
                if (t !== sym('f')) {
                  rdCategory.add(part);
                  wpnPos.add(tWpnPos.getAt(1));
                  inv().deleteAt(inventoryNumber);
                  sendSprite(6, 'add3DPart', part);
                }
              } else buildMess('You cannot install a Power-Axe when a tower is installed.');
            } else {
              // Weapons for the front or the back: the front if it's free, else the
              // back (the second of the part's places). #v37 and #v23 (keys 4 and 5)
              // take no place and have no model to show.
              if (!(part === sym('v37') || part === sym('v23'))) {
                for (let i = 1; i <= wpnPos.count; i++) {
                  t = wpnPos.getAt(i);
                  if (t === sym('f')) {
                    for (let j = 1; j <= wpnPos.count; j++) {
                      t = wpnPos.getAt(j);
                      if (t === sym('b')) {
                        buildMess('Weapons are already installed in the front and back.');
                        return;
                      }
                    }
                    if (t !== sym('b')) {
                      rdCategory.add(part);
                      wpnPos.add(tWpnPos.getAt(2));
                      inv().deleteAt(inventoryNumber);
                      sendSprite(6, 'add3DPart', part);
                    }
                    this.UpdateAll();
                    return;
                  }
                }
                this.UpdateAll();
                wpnPos.add(tWpnPos.getAt(1));
                sendSprite(6, 'add3DPart', part);
              }
              rdCategory.add(part);
              inv().deleteAt(inventoryNumber);
            }
            this.UpdateAll();
          }
        } else buildMess('You need a chassi to install weapons!');
        break;
      default:
        put('Den har ingen typ: ' + lingoString(name));
    }
    this.UpdateAll();
  }

  removePart(name: LValue) {
    const part = symbol(name)!;
    const rd = robotDesc();
    switch (part) {
      case sym('r1'):
      case sym('r2'):
      case sym('r3'):
        userPL().setaProp(sym('pansar'), 0);
        for (const q of ['ram', 'torn', 'hjul', 'motor', 'batteri', 'vapen', 'ammunition', 'special']) {
          const L = rd.getaProp(sym(q)) as LList;
          // getaProp(rd, #ammunition) is VOID on most robots: L.count is then a script error.
          if (L.count > 0) {
            for (let i = L.count; i >= 1; i--) {
              const k = L.getAt(i);
              L.deleteAt(L.getPos(k));
              inventory().add(k);
              sendSprite(6, 'remove3DPart', k);
              this.state = sym('update');
            }
          }
        }
        rd.setaProp(sym('wpnPos'), new LList());
        break;
      case sym('t1'):
      case sym('t2'):
      case sym('t3'): {
        const tabort = part === sym('t1') ? 42 : part === sym('t2') ? 62 : 82;
        if (num(userPL().prop('pansar')) - tabort >= 0) userPL().setaProp(sym('pansar'), num(userPL().prop('pansar')) - tabort);
        else userPL().setaProp(sym('pansar'), 0);
        let rdCategory = rd.getProp(sym('torn')) as LList;
        rdCategory.deleteAt(rdCategory.getPos(part));
        inventory().add(part);
        sendSprite(6, 'remove3DPart', part);
        rdCategory = rd.getProp(sym('vapen')) as LList;
        const rdPos = rd.getProp(sym('wpnPos')) as LList;
        const bort = rdPos.getOne(sym('t'));
        if (bort > 0) {
          rdPos.deleteAt(bort);
          sendSprite(6, 'remove3DPart', rdCategory.getAt(bort));
          inventory().add(rdCategory.getAt(bort));
          rdCategory.deleteAt(bort);
        }
        break;
      }
      default: {
        const typ = (parts().getProp(part) as LPropList).prop('typ');
        const rdCategory = rd.getProp(typ) as LList;
        if (typ === sym('vapen')) {
          const rdPos = rd.getProp(sym('wpnPos')) as LList;
          const bort = rdCategory.getOne(part);
          if (bort > 0) {
            rdPos.deleteAt(bort);
            sendSprite(6, 'remove3DPart', rdCategory.getAt(bort));
            inventory().add(rdCategory.getAt(bort));
            rdCategory.deleteAt(bort);
          }
        } else {
          rdCategory.deleteAt(rdCategory.getPos(part));
          inventory().add(part);
          sendSprite(6, 'remove3DPart', part);
        }
      }
    }
    this.UpdateAll();
  }

  prepareFrame() {
    if (this.state === sym('update')) {
      sendAllSprites('updateBar');
      sendAllSprites('setzoomer');
      sendAllSprites('setscrollbar', 0);
      this.state = sym('idle');
    }
  }

  exitFrame() {
    go(the.frame);
  }

  fixpos() {}

  UpdateAll() {
    this.CleanUpSprites();
    member('Money Stats').text = lingoString(userPL().prop('money'));
    let d = 0;
    let sp = 120;
    let y = 275;
    const rd = robotDesc();
    let rdPos = rd.prop('wpnPos') as LList;
    const rdCategory = rd.prop('vapen') as LList;
    // tList is the same list as wpnPos: the keys 4 and 5 (#v37, #v23) get places #s
    // and #V there, at their index in the weapon list.
    const tList = rdPos;
    let tplats = 0;
    for (let i = 1; i <= rdCategory.count; i++) {
      if (rdCategory.getAt(i) === sym('v37')) {
        if (tList.getOne(sym('s')) === 0) tList.addAt(i, sym('s'));
        continue;
      }
      if (rdCategory.getAt(i) === sym('v23')) {
        if (tList.getOne(sym('V')) === 0) tList.addAt(i, sym('V'));
        continue;
      }
      tplats = tplats + 1;
      tList.setAt(i, rdPos.getAt(i));
    }
    rd.setaProp(sym('wpnPos'), tList);
    rdPos = rd.prop('wpnPos') as LList;
    const leftPos = 40;
    for (const q of ['ram', 'torn', 'hjul', 'motor', 'batteri', 'vapen', 'special']) {
      const L = rd.getaProp(sym(q)) as LList;
      if (L.count > 0) {
        createSprite(sp, q + ' rubrik', point(leftPos, y - 4), 31);
        sp = sp + 1;
        y = y + 20;
        createSprite(sp, 'byggram1', point(leftPos, y), 30);
        sp = sp + 1;
        if (L.count > 1) {
          let rad = 0;
          for (let i = 1; i <= (L.count - 1) * 3; i++) {
            createSprite(sp, 'byggram3', point(leftPos, y + rad * 6), 30);
            sp = sp + 1;
            rad = rad + 1;
          }
        }
        createSprite(sp, 'byggram2', point(leftPos, y + 4 + (L.count - 1) * 15), 30);
        sp = sp + 1;
        for (const part of L) {
          createSprite(sp, lingoString(part) + ' text', point(leftPos + 10, y - 7), 31);
          sp = sp + 1;
          if (q === 'ram') {
            createSprite(sp, 'counter frame', point(leftPos + 242, y), 31);
            sp = sp + 1;
            createSprite(sp, 'ShowInches', point(leftPos + 220, y - 8), 31);
            sp = sp + 1;
            createSprite(sp, 'subcounterbtn', point(leftPos + 216, y - 1), 31);
            sprite(sp).scriptInstanceList = [new AddcounterButtonBehavior(sp, sym('pansar'), -1, 'subcounterbtn')];
            sp = sp + 1;
            createSprite(sp, 'addcounterbtn', point(leftPos + 267, y - 1), 31);
            sprite(sp).scriptInstanceList = [new AddcounterButtonBehavior(sp, sym('pansar'), 1, 'addcounterbtn')];
            sp = sp + 1;
            createSprite(sp, 'pansar title', point(leftPos + 146, y - 8), 31);
            sp = sp + 1;
          } else if (q === 'vapen') {
            d = d + 1;
            if (part === sym('v37') || part === sym('v23')) {
              createSprite(sp, 'key title', point(leftPos + 72, y - 8), 31);
              sp = sp + 1;
              createSprite(sp, part === sym('v37') ? 'key4' : 'key5', point(leftPos + 82, y - 8), 31);
              sp = sp + 1;
            } else {
              const j = (parts().getProp(part) as LPropList).prop('wpnPos') as LList;
              if (j.count === 1) {
                const pop = j.getAt(1) === sym('t') ? 'pop 3' : j.getAt(1) === sym('b') ? 'pop 4' : j.getAt(1) === sym('f') ? 'pop 5' : undefined;
                if (pop) createSprite(sp, pop, point(leftPos + 210, y - 7), 31);
              } else {
                const k = rdPos.getAt(d);
                // [new(script("popup menu behavior"), sp, part), 31]: the 31 isn't a
                // script instance and is dropped.
                if (k === sym('f')) {
                  createSprite(sp, 'pop 1', point(leftPos + 210, y - 7), 31);
                  sprite(sp).scriptInstanceList = [new PopupMenuBehavior(sp, part)];
                } else if (k === sym('b')) {
                  createSprite(sp, 'pop 2', point(leftPos + 210, y - 7), 31);
                  sprite(sp).scriptInstanceList = [new PopupMenuBehavior(sp, part)];
                }
              }
              sp = sp + 1;
              createSprite(sp, 'key title', point(leftPos + 72, y - 8), 31);
              sp = sp + 1;
              createSprite(sp, 'key' + d, point(leftPos + 82, y - 8), 31);
              sp = sp + 1;
              createSprite(sp, 'placering title', point(leftPos + 139, y - 8), 31);
              sp = sp + 1;
            }
          }
          createSprite(sp + 300, 'removebtn', point(leftPos + 320, y - 1), 31);
          sprite(sp + 300).scriptInstanceList = [new RemoveButtonBehavior(sp + 300, lingoString(part), 'removebtn')];
          sp = sp + 1;
          y = y + 15;
        }
      }
    }
    let n = 0;
    for (const q of inventory()) {
      const pieceName = lingoString(q);
      createSprite(sp, pieceName, point(83 + 90 * n, 110), 52);
      sprite(sp).scriptInstanceList = [new UseButtonBehavior(sp, pieceName, n + 1, 'usebtn'), new HorizontalScrollBehavior(sp, n)];
      sp = sp + 1;
      createSprite(sp, 'usebtn', point(82 + 90 * n, 145), 53);
      sprite(sp).scriptInstanceList = [new UseButtonBehavior(sp, pieceName, n + 1, 'usebtn'), new HorizontalScrollBehavior(sp, n + 100)];
      sp = sp + 1;
      n = n + 1;
    }
    this.state = sym('update');
    void tplats;
  }
}
