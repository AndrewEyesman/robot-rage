// factory0604: the garage. The Workshop (install and remove parts, the robot's 3D
// preview), the Paintshop (painting the paint maps), Buy parts, Sell parts, the
// stats and highscore tabs, the door frames between the rooms and the lobby, arena
// and logout, and saving the robot. Many of its sprites run robotwars' behaviors
// (load robot, doors, Jump, Spara, StatsBehavior, zoom and scroll buttons).

import { registerCast } from '../../director';
import { EmptyBehavior } from './s005-empty';
import { Hold } from './s006-hold';
import { Editor } from './s007-editor';
import { LineButton } from './s008-line-button';
import { PaletteBehavior } from './s009-palette';
import { RobotBehavior } from './s010-robot-behavior';
import { Locz } from './s011-locz';
import { FlyttaPreview } from './s012-flytta-preview';
import * as patternFill from './s013-patternfill';
import { PaintTool } from './s014-painttool';
import { PointingCursor } from './s015-pointingcursor';
import { UseFramescript } from './s016-use-framescript';
import { BuyFramescript } from './s017-buy-framescript';
import { SellFramescript } from './s018-sell-framescript';
import { Framescript } from './s019-framescript';
import { MirrorButton } from './s020-mirror-button';
import { BarBehavior } from './s021-bar';
import * as weightcalculator from './s022-weightcalculator';
import { DoorMessageFromArena } from './s023-doormessage-fromarena';
import { AddcounterButtonBehavior } from './s024-addcounter-button';
import { PopupMenuBehavior } from './s025-popup-menu';
import { Gridbutton } from './s026-gridbutton';
import { OpenDoorsHold } from './s027-open-doors-hold';
import { HoldFrame } from './s028-hold-frame';
import { MatchResult } from './s029-match-result';
import { ButtondownBehavior } from './s030-buttondown';
import { JumpToQuit } from './s092-jump-to-quit';
import { CloseDoorsOnce } from './s093-close-doors-once';
import { OpenDoorsOnce } from './s096-open-doors-once';
import { SecretDebug } from './s127-secret-debug';
import { MsgWindow } from './s130-msgwindow';
import { GotoAmmo } from './s134-goto-ammo';
import { LaktareShowhide } from './s135-laktare-showhide';
import { GoBuild } from './s136-go-build';
import { GotoMenuitemNow } from './s138-goto-menuitem-now';
import { SmsCheck } from './s158-sms-check';
import { UpdateHiscore } from './s160-updatehiscore';
import { BuyRobotBehavior } from './s163-buy-robot-behavior';
import { MouseGotoMenuitem } from './s164-mouse-goto-menuitem';
import { BuyStuff } from './s165-buystuff';
import { Zoombutton } from './s166-zoombutton';
import { MoneyBehavior } from './s167-money';
import { CloseDoorsEveryFrame } from './s169-close-doors';
import { CloseWindow } from './s170-close-window';
import { Storlek } from './s174-storlek';
import { SmsBehavior } from './s175-sms-behavior';
import { AboveAll } from './s179-above-all';
import { UseButtonBehavior } from './s180-use-button';
import { RemoveButtonBehavior } from './s181-remove-button';
import { ThanksBox } from './s187-thanks-box';
import { HorizontalScrollBehavior } from './s192-horizontal-scroll';
import { Scrollitems } from './s193-scrollitems';
import { PurchaseBox201 } from './s201-purchase-box';
import { PurchaseBox } from './s204-purchasebox';
import { HideBoxes } from './s206-hide-boxes';
import { UkOnly } from './s261-uk-only';
import { ShowPurchaseSuperPack } from './s262-showpurchase-superpack';
import { BuyTemplates } from './s263-buy-templates';
import { OldGotoMenuitem } from './s264-goto-menuitem';
import { BuyStuff265 } from './s265-buystuff';
import { Framescript270 } from './s270-framescript';
import { BtnrollDown } from './s273-btnroll-down';
import { RolloverFrames } from './s274-rollover-frames';
import { SellButtonBehavior } from './s275-sell-button';
import { SellStuffBehavior } from './s276-sellstuff';
import * as store3d from './s277-3d-store';
import { ResetAll } from './s279-resetall';
import { Spara287 } from './s287-spara';
import { Prisuppgift } from './s290-prisuppgift';
import { HideThanks } from './s295-hidethanks';
import { Vapendrop } from './s302-vapendrop';
import { SmsAutoCheck } from './s303-sms-autocheck';

registerCast('factory0604', {
  scripts: {
    5: EmptyBehavior, 6: Hold, 7: Editor, 8: LineButton, 9: PaletteBehavior, 10: RobotBehavior, 11: Locz, 12: FlyttaPreview, 14: PaintTool,
    15: PointingCursor, 16: UseFramescript, 17: BuyFramescript, 18: SellFramescript, 19: Framescript, 20: MirrorButton, 21: BarBehavior,
    23: DoorMessageFromArena, 24: AddcounterButtonBehavior, 25: PopupMenuBehavior, 26: Gridbutton, 27: OpenDoorsHold, 28: HoldFrame,
    29: MatchResult, 30: ButtondownBehavior, 91: HoldFrame, 92: JumpToQuit, 93: CloseDoorsOnce, 96: OpenDoorsOnce, 110: HoldFrame,
    126: EmptyBehavior, 127: SecretDebug, 130: MsgWindow, 132: EmptyBehavior, 134: GotoAmmo, 135: LaktareShowhide, 136: GoBuild,
    138: GotoMenuitemNow, 152: EmptyBehavior, 158: SmsCheck, 160: UpdateHiscore, 163: BuyRobotBehavior, 164: MouseGotoMenuitem,
    165: BuyStuff, 166: Zoombutton, 167: MoneyBehavior, 169: CloseDoorsEveryFrame, 170: CloseWindow, 171: CloseDoorsEveryFrame,
    173: HoldFrame, 174: Storlek, 175: SmsBehavior, 179: AboveAll, 180: UseButtonBehavior, 181: RemoveButtonBehavior, 187: ThanksBox,
    192: HorizontalScrollBehavior, 193: Scrollitems, 201: PurchaseBox201, 202: BuyStuff, 204: PurchaseBox, 206: HideBoxes,
    219: EmptyBehavior, 229: EmptyBehavior, 234: EmptyBehavior, 254: EmptyBehavior, 261: UkOnly, 262: ShowPurchaseSuperPack,
    263: BuyTemplates, 264: OldGotoMenuitem, 265: BuyStuff265, 266: Zoombutton, 267: PaintTool, 268: PointingCursor,
    269: PointingCursor, 270: Framescript270, 271: Zoombutton, 272: PaintTool, 273: BtnrollDown, 274: RolloverFrames,
    275: SellButtonBehavior, 276: SellStuffBehavior, 278: MoneyBehavior, 279: ResetAll, 282: CloseDoorsEveryFrame,
    285: CloseWindow, 286: CloseDoorsEveryFrame, 287: Spara287, 288: HoldFrame, 289: Storlek, 290: Prisuppgift, 292: LaktareShowhide,
    295: HideThanks, 302: Vapendrop, 303: SmsAutoCheck, 308: EmptyBehavior, 310: EmptyBehavior,
  },
  handlers: { ...patternFill, ...weightcalculator, ...store3d } as Record<string, (...args: never[]) => unknown>,
});
