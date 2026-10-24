// robotwars member 6 "3D scripts" (s006-3d-scripts.ts): its handlers, registered
// apart from the rest of robotwars because they come with the Shockwave 3D layer.

import { registerCast } from '../../director';
import * as s6 from './s006-3d-scripts';

registerCast('robotwars', {
  handlers: {
    CreateShader: s6.CreateShader,
    SpringDamp: s6.SpringDamp,
    monteringsplats: s6.monteringsplats,
    resetrwcast: s6.resetrwcast,
    BuildRobot: s6.BuildRobot,
    BuildRobots: s6.BuildRobots,
    updateRobotTexture: s6.updateRobotTexture,
    InstallByggPart: s6.InstallByggPart,
    UnInstallPart: s6.UnInstallPart,
    showRobotInfo: s6.showRobotInfo,
    showRobotGroupInfo: s6.showRobotGroupInfo,
    GetMassPoint: s6.GetMassPoint,
    GetMiddlePoint: s6.GetMiddlePoint,
  } as Record<string, (...args: never[]) => unknown>,
});
