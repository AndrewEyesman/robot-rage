// arena104's weapons: the "vapen vN" behaviors (initWeapons in "Arena 3D" puts one on
// each weapon's sprite) and the shots, mines and effects they and the frame script's
// createSprite / createSparkle make, plus the fire pit's fire behavior. registerCast
// merges, so the rest of the arena registers its own scripts beside these.

import { registerCast, type ScriptClass } from '../../director';
import { FireBehavior } from './s010-fire-behavior';
import { SmashBehavior } from './s011-smash-behavior';
import { SparkleBehavior } from './s015-sparkle-behavior';
import { VapenV9 } from './s024-vapen-v9';
import { ThrowfireBehavior } from './s025-throwfire-behavior';
import { LaserBehavior } from './s026-laser-behavior';
import { RocketsmokeBehavior } from './s027-rocketsmoke-behavior';
import { MineBehavior } from './s028-mine-behavior';
import { VapenV1 } from './s029-vapen-v1';
import { VapenV2 } from './s030-vapen-v2';
import { VapenV3 } from './s031-vapen-v3';
import { VapenV4 } from './s032-vapen-v4';
import { VapenV6 } from './s034-vapen-v6';
import { VapenV7 } from './s035-vapen-v7';
import { VapenV8 } from './s036-vapen-v8';
import { VapenV10 } from './s037-vapen-v10';
import { VapenV11 } from './s038-vapen-v11';
import { VapenV12 } from './s039-vapen-v12';
import { NailBehavior } from './s040-nail-behavior';
import { VapenV13 } from './s041-vapen-v13';
import { LimBehavior } from './s042-lim-behavior';
import { VapenV14 } from './s043-vapen-v14';
import { OilBehavior } from './s044-oil-behavior';
import { VapenV15 } from './s045-vapen-v15';
import { VapenV16 } from './s046-vapen-v16';
import { VapenV17 } from './s047-vapen-v17';
import { VapenV21 } from './s232-vapen-v21';
import { VapenV22 } from './s233-vapen-v22';
import { VapenV24 } from './s235-vapen-v24';
import { VapenV25 } from './s236-vapen-v25';
import { VapenV26 } from './s237-vapen-v26';
import { DiscBehavior } from './s238-disc-behavior';
import { VapenV31 } from './s243-vapen-v31';
import { VapenV32 } from './s244-vapen-v32';
import { VapenV33 } from './s245-vapen-v33';
import { VapenV34 } from './s246-vapen-v34';
import { VapenV35 } from './s247-vapen-v35';
import { VapenV36 } from './s248-vapen-v36';
import { SpearBehavior } from './s250-spear-behavior';
import { ChargeBehavior } from './s253-charge-behavior';

const scripts: Record<number, ScriptClass> = {
  10: FireBehavior,
  11: SmashBehavior,
  15: SparkleBehavior,
  24: VapenV9,
  25: ThrowfireBehavior,
  26: LaserBehavior,
  27: RocketsmokeBehavior,
  28: MineBehavior,
  29: VapenV1,
  30: VapenV2,
  31: VapenV3,
  32: VapenV4,
  34: VapenV6,
  35: VapenV7,
  36: VapenV8,
  37: VapenV10,
  38: VapenV11,
  39: VapenV12,
  40: NailBehavior,
  41: VapenV13,
  42: LimBehavior,
  43: VapenV14,
  44: OilBehavior,
  45: VapenV15,
  46: VapenV16,
  47: VapenV17,
  232: VapenV21,
  233: VapenV22,
  235: VapenV24,
  236: VapenV25,
  237: VapenV26,
  238: DiscBehavior,
  243: VapenV31,
  244: VapenV32,
  245: VapenV33,
  246: VapenV34,
  247: VapenV35,
  248: VapenV36,
  250: SpearBehavior,
  253: ChargeBehavior,
};

registerCast('arena104', { scripts });
