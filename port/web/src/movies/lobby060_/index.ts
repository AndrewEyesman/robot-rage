// lobby060_: the multiplayer lobby. Logs on to the IRC lobby (frame 3), lists the
// countries and their rooms and the players in the room you're in, shows a clicked
// robot's card and 3D model (getrobotall plus a P2P ping), sends and answers
// challenges, and sets up the P2P connection of a match before jumping to the arena
// (frame 76). Shared code (the IRC client, the room object, doors, 3D robots) is in
// robotwars.

import { registerCast } from '../../director';
import { LobbyStart } from './s001-lobby-start';
import { ClearP2P } from './s002-clear-p2p';
import { ShowRobot1Button } from './s003-show-robot-1';
import * as lobbyMovieScript from './s004-lobby-moviescript';
import { ShowRobot2Button } from './s005-show-robot-2';
import { SendChallenge } from './s006-sendchallenge';
import { AddToFriends } from './s007-addtofriends';
import { Logout } from './s008-logout';
import { JumpToLocal } from './s009-jumptolocal';
import { Scrollbut } from './s011-scrollbut';
import { ChallengeGfx } from './s012-challenge-gfx';
import { Jump } from './s013-jump';
import { BtnrollDown } from './s014-btnroll-down';
import { Scroll } from './s015-scroll';
import { OpenDoors16 } from './s016-open-doors';
import { SpriteNum18 } from './s018-sprite-num';
import { GoToMovieLocal } from './s019-gotomovielocal';
import { CloseWindow } from './s020-close-window';
import { UpdateGamesList } from './s021-updategameslist';
import { Hold22 } from './s022-hold';
import { ConnectToGame } from './s023-connecttogame';
import { DeclineChallengeButton } from './s024-declinechallenge';
import { Hold25 } from './s025-hold';
import { Beta } from './s026-beta';
import { LogoffButton } from './s027-logoff';
import { OnlineUsers } from './s028-online-users';
import { AcceptChallengeButton } from './s029-acceptchallenge';
import { OnlineFramescript } from './s030-online-framescript';
import { GoToRoomBehavior } from './s031-gotoroombehavior';
import { ChallngeAlertBehavior } from './s032-challnge-alert-behavior';
import { P2PConnectFramescript } from './s033-p2pconnect-framescript';
import { LogonButton } from './s035-logon';
import { IncommingChallenge } from './s036-incomming-challenge';
import { Showmessage } from './s037-showmessage';
import { MarkerScript } from './s038-marker-script';
import { LaktareBlend } from './s039-laktare';
import { ShowGames } from './s040-showgames';
import { Hold41 } from './s041-hold';
import { OpenDoorsHold42 } from './s042-open-doors-hold';
import { Spara50 } from './s050-spara';
import { PointingCoursor } from './s054-pointing-coursor';
import { Doorbehavior } from './s065-doorbehavior';
import { ReloginFrame } from './s067-relogin-frame';
import { Hold68 } from './s068-hold';
import { RobotBehavior } from './s069-robot-behavior';
import { OpenDoorsHold75 } from './s075-open-doors-hold';
import { Spara78 } from './s078-spara';
import { RobotsBehavior } from './s079-robots-behavior';
import { GoOnline } from './s084-goonline';
import { GoRestart } from './s085-gorestart';
import { Country } from './s087-country';
import { MouseCatch } from './s181-mouse-catch';
import { IrcLoginFramescript } from './s224-irc-login-framescript';
import { RoomMenuScript } from './s227-room-menu-script';
import { RoomsFramescript } from './s228-rooms-framescript';
import { EnterLobby } from './s229-enter-lobby';
import { InitRoomSprite } from './s244-init-room-sprite';

registerCast('lobby060_', {
  scripts: {
    1: LobbyStart, 2: ClearP2P, 3: ShowRobot1Button, 5: ShowRobot2Button, 6: SendChallenge, 7: AddToFriends, 8: Logout, 9: JumpToLocal,
    11: Scrollbut, 12: ChallengeGfx, 13: Jump, 14: BtnrollDown, 15: Scroll, 16: OpenDoors16, 18: SpriteNum18, 19: GoToMovieLocal,
    20: CloseWindow, 21: UpdateGamesList, 22: Hold22, 23: ConnectToGame, 24: DeclineChallengeButton, 25: Hold25, 26: Beta,
    27: LogoffButton, 28: OnlineUsers, 29: AcceptChallengeButton, 30: OnlineFramescript, 31: GoToRoomBehavior, 32: ChallngeAlertBehavior,
    33: P2PConnectFramescript, 35: LogonButton, 36: IncommingChallenge, 37: Showmessage, 38: MarkerScript, 39: LaktareBlend, 40: ShowGames,
    41: Hold41, 42: OpenDoorsHold42, 50: Spara50, 54: PointingCoursor, 65: Doorbehavior, 67: ReloginFrame, 68: Hold68, 69: RobotBehavior,
    75: OpenDoorsHold75, 78: Spara78, 79: RobotsBehavior, 84: GoOnline, 85: GoRestart, 87: Country, 181: MouseCatch,
    224: IrcLoginFramescript, 227: RoomMenuScript, 228: RoomsFramescript, 229: EnterLobby, 244: InitRoomSprite,
  },
  handlers: { ...lobbyMovieScript } as Record<string, (...args: never[]) => unknown>,
});
