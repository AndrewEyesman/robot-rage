// arena104 member 6 "Arena 3D" (s006-arena-3d.ts): its handlers. The arena's other
// scripts register from arena104/index.ts.

import { registerCast } from '../../director';
import * as s6 from './s006-arena-3d';

registerCast('arena104', {
  handlers: {
    VectorToPoint: s6.VectorToPoint,
    PointToVector: s6.PointToVector,
    theOVerlay: s6.theOVerlay,
    BuildWorld: s6.BuildWorld,
    initWeapons: s6.initWeapons,
    rankatspel: s6.rankatspel,
    initWheels: s6.initWheels,
    Copy3DMemberToWorld: s6.Copy3DMemberToWorld,
    prepareMovie: s6.prepareMovie,
    InitFirePit: s6.InitFirePit,
    getOrtoDist: s6.getOrtoDist,
    UpdateBatteryHeight: s6.UpdateBatteryHeight,
    UpdatePansarWidth: s6.UpdatePansarWidth,
    testmotorsound: s6.testmotorsound,
    FindLineIntersection: s6.FindLineIntersection,
    uncloak: s6.uncloak,
  } as Record<string, (...args: never[]) => unknown>,
});
