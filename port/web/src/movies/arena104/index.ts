// arena104, the arena movie: Training (the "backyard", frames 17-20) and matches
// (frames 1-10, then the result frames 25-37). Its "Arena 3D" movie script registers
// from 3d.ts and its weapons from weapons.ts; registerCast merges them with these.
// enhancements.ts adds the port's widescreen view and smooth drawing, apart from the
// original logic.

import { registerCast, type ScriptClass } from '../../director';
import { MainFramescript } from './s002-main-framescript';
import { RobotBehavior } from './s003-robot-behavior';
import { BackyardFramescript } from './s004-backyard-framescript';
import { CloseDoor } from './s005-closedoor';
import { CameraScript } from './s007-camera-script';
import * as multiuser from './s008-multiuser-scripts';
import { CheckConnection } from './s012-check-connection';
import { Script13 } from './s013';
import { Hold14 } from './s014';
import { InitRobotInfo } from './s016-init-robot-info';
import { Script17 } from './s017';
import { InitBackyard } from './s018-init-backyard';
import { WheelH1 } from './s019-wheel-h1';
import { WheelH2 } from './s020-wheel-h2';
import { WheelH3 } from './s021-wheel-h3';
import { WheelH4 } from './s022-wheel-h4';
import { WheelH5 } from './s023-wheel-h5';
import { Script48 } from './s048';
import { Hold83 } from './s083';
import { Script89 } from './s089';
import { ChatBehavior } from './s143-chat-behavior';
import * as debugStuff from './s144-debug-stuff';
import { SurrendButton } from './s152-surrend-button';
import { NorevButton } from './s153-norev-button';
import { DrawButton } from './s154-draw-button';
import { CheckRenderer } from './s155-check-renderer';
import { ChatBut } from './s159-chat-but';
import { ChatSend } from './s160';
import { UpdateM } from './s167-update-m';
import { LoczMinus } from './s169-locz';
import { OpenDoor178 } from './s178-opendoor';
import { Snurra } from './s179-snurra';
import { RevanschButton } from './s180-revansch-button';
import { AbuseBut } from './s217-abuse-but';
import { AbuseVis } from './s229-abusevis';
import { NoAbuse } from './s230-noabuse';
import { YesAbuse } from './s231-yesabuse';
import { AbuseFrame } from './s241-abuse';
import './enhancements';

const scripts: Record<number, ScriptClass> = {
  2: MainFramescript, 3: RobotBehavior, 4: BackyardFramescript, 5: CloseDoor, 7: CameraScript, 12: CheckConnection, 13: Script13, 14: Hold14,
  16: InitRobotInfo, 17: Script17, 18: InitBackyard, 19: WheelH1, 20: WheelH2, 21: WheelH3, 22: WheelH4, 23: WheelH5, 48: Script48,
  83: Hold83, 89: Script89, 143: ChatBehavior, 152: SurrendButton, 153: NorevButton, 154: DrawButton, 155: CheckRenderer, 159: ChatBut,
  160: ChatSend, 167: UpdateM, 169: LoczMinus, 178: OpenDoor178, 179: Snurra, 180: RevanschButton, 217: AbuseBut, 229: AbuseVis,
  230: NoAbuse, 231: YesAbuse, 241: AbuseFrame,
};

registerCast('arena104', {
  scripts,
  handlers: { ...multiuser, ...debugStuff } as Record<string, (...args: never[]) => unknown>,
});
