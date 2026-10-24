// robotwars movie script 22 "Resetscripts": empties the robot (debugging).

import { G, sendSprite, setDot } from '../../director';
import { LList } from '../../lingo';

export function ResetAll() {
  sendSprite(1, 'usedoktor');
  setDot(G.gUserData, 'propertyList', 'robotDescription', new LList());
  setDot(G.gUserData, 'propertyList', 'inventory', new LList());
  setDot(G.gUserData, 'propertyList', 'money', 1000);
  sendSprite(1, 'makedoktor');
}
