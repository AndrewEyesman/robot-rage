// robotwars.cct: the external cast every movie links. Its scripts are the game's shared
// code: the IRC lobby client and room list, robot loading/saving and checksums, the
// part table, text encodings, the garage doors and buttons. Member 6 ("3D scripts")
// is translated separately (s006-3d-scripts.ts, with the Shockwave 3D layer).
//
// texter.cct (the menu texts as text members) has only two empty movie scripts; its
// members are found by name like any other.

import { Behavior, registerCast } from '../../director';
import { IRC_OBJECT } from './s001-irc-object';
import { RoomObject } from './s002-room-object';
import * as macpc from './s003-mac-pc';
import * as newInit from './s004-new-init';
import * as changes from './s005-changes';
import * as s7 from './s007-jump-movie';
import { ScrollTummen } from './s008-scroll-tummen';
import { CloseDoorsLoop } from './s009-close-doors-loop';
import { HScrollButton } from './s010-hscrollbutton';
import * as purl from './s011-purl';
import { CloseDoors } from './s012-close-doors';
import * as robotDescriptions from './s013-robot-descriptions';
import { HoldFrame } from './s014-hold';
import { Locz, Locz2 } from './s015-locz';
import { Chatlock } from './s016-chatlock';
import * as money from './s017-money-manager';
import { SaveRobot } from './s018-save-robot';
import * as netLingo from './s019-net-lingo';
import { ZoomButton } from './s020-zoombutton';
import * as reset from './s022-resetscripts';
import { ArenaTestdrive } from './s023-arena-testdrive';
import { BuildMess } from './s024-build-mess';
import { GarageStart } from './s026-garage-start';
import { FetchingRobot } from './s027-fetching-robot';
import { MessageBox } from './s028-message-box';
import * as sound from './s030-soundscript';
import * as myIP from './s034-get-my-ip';
import * as alertScript from './s038-alert';
import { InventoryBehavior } from './s041-inventory';
import { LoadRobot } from './s042-load-robot';
import { JumpMovieFramescript } from './s043-jumpmovie-framescript';
import * as parts from './s049-part-description';
import { Jump } from './s051-jump';
import { BtnRollDown, BtnRollDown14 } from './s052-btnroll-down';
import { ScrollCursor } from './s053-scrollcursor';
import { PointingCoursor } from './s054-pointing-coursor';
import { HelpPop } from './s059-help-pop';
import * as badLanguage from './s065-badlanguage';
import * as rocket from './s072-rocket-encrypt';
import * as md5 from './s098-md5';
import { StatsBehavior } from './s201-stats';
import { ShowDoorMessage } from './s237-show-door-message';
import { CloseDoor } from './s239-closedoor';
import { Hold, JumpToBackyard, JumpToGarage, JumpToLobby, JumpToQuit, JumpToWorkshop } from './s247-garage-jumps';
import { Spara } from './s253-spara';
import { OpenDoor } from './s254-opendoor';
import { MrDoktor } from './s260-mrdoktor';
import { DoorBehavior } from './s263-doorbehavior';

/** Behavior 95 is an empty script. */
class EmptyBehavior extends Behavior {}

// Script 19 repeats script 3's MacToPC / PCtoMac; script 3's are the registered ones
// (both are only reached on a Mac).
const { MacToPC: _m, PCtoMac: _p, ...netHandlers } = netLingo;
void _m;
void _p;

registerCast('robotwars', {
  scripts: {
    1: IRC_OBJECT, 2: RoomObject, 8: ScrollTummen, 9: CloseDoorsLoop, 10: HScrollButton, 12: CloseDoors, 14: HoldFrame, 15: Locz,
    16: Chatlock, 18: SaveRobot, 20: ZoomButton, 21: Locz2, 23: ArenaTestdrive, 24: BuildMess, 26: GarageStart, 27: FetchingRobot,
    28: MessageBox, 29: HoldFrame, 41: InventoryBehavior, 42: LoadRobot, 43: JumpMovieFramescript, 51: Jump, 52: BtnRollDown,
    53: ScrollCursor, 54: PointingCoursor, 55: BtnRollDown14, 59: HelpPop, 93: HoldFrame, 95: EmptyBehavior, 201: StatsBehavior,
    237: ShowDoorMessage, 239: CloseDoor, 247: JumpToWorkshop, 248: JumpToBackyard, 249: JumpToGarage, 250: JumpToLobby, 251: Hold,
    253: Spara, 254: OpenDoor, 256: JumpToQuit, 260: MrDoktor, 263: DoorBehavior,
  },
  handlers: {
    ...macpc, ...newInit, ...changes, ...s7, ...purl, ...robotDescriptions, ...money, ...netHandlers, ...reset, ...sound, ...myIP,
    ...alertScript, ...parts, ...badLanguage, ...rocket, ...md5,
  } as Record<string, (...args: never[]) => unknown>,
});

registerCast('texter', {});
