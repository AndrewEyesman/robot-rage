// 3D transforms (s3d/vector.ts, nodes.ts) on mirrored and scaled nodes. Every model in
// the game's W3D files sits under a "Scene Root" that mirrors z, and the arena gives
// each robot part its world transform, so the weapons are mirrored nodes. The expected
// matrices were printed by Adobe's player (tools/reference/refeval.sh on a model in
// member "robot1", standalone arena104), column by column as string(transform) prints.

import { Group3D, transform, vector, type Shockwave3dMember, type Transform } from '../s3d';
import { describe, eq, ok, test } from './harness';

const SOURCE = 'Adobe measurement (refeval.sh, 2026-10-24)';

/** Nodes under a world group (the transforms don't need a member's file). */
function world() {
  const root = new Group3D('World', {} as Shockwave3dMember);
  return {
    newModel(name: string) {
      const n = new Group3D(name, {} as Shockwave3dMember);
      root.attach(n, false);
      return n;
    },
  };
}

/** scale(1, 1, -1), rotate(0, 30, 0), position (10, 20, 30): a mirrored part's transform. */
function mirrored(): Transform {
  const t = transform();
  t.scale = vector(1, 1, -1);
  t.rotate(0, 30, 0);
  t.position = vector(10, 20, 30);
  return t;
}

function scaled(): Transform {
  const t = transform();
  t.scale = vector(2, 2, 2);
  t.rotate(0, 30, 0);
  t.position = vector(10, 20, 30);
  return t;
}

function near(t: Transform, expected: number[], what: string) {
  const got = Array.from({ length: 16 }, (_, i) => t.getAt(i + 1));
  if (got.some((g, i) => Math.abs(g - expected[i]) > 1e-4)) {
    throw new Error(`${what}: expected ${expected.map((x) => x.toFixed(5))}, got ${got.map((x) => x.toFixed(5))}`);
  }
}

const vnear = (v: { x: number; y: number; z: number }, e: [number, number, number], what: string) =>
  ok(Math.abs(v.x - e[0]) < 1e-4 && Math.abs(v.y - e[1]) < 1e-4 && Math.abs(v.z - e[2]) < 1e-4, `${what}: expected ${e}, got ${[v.x, v.y, v.z]}`);

const M0 = [0.86603, 0, -0.5, 0, 0, 1, 0, 0, -0.5, 0, -0.86603, 0, 10, 20, 30, 1];

describe('3d transforms', () => {
  test('a mirror reads as a negative z scale, the rest as rotation', SOURCE, () => {
    const a = transform();
    a.scale = vector(-1, 1, 1);
    near(a, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 'matrix');
    vnear(a.scale, [1, 1, -1], 'scale');
    const r = a.rotation;
    vnear(vector(Math.abs(r.x), r.y, Math.abs(r.z)), [180, 0, 180], 'rotation');
    near(mirrored(), M0, 'mirrored()');
    vnear(mirrored().scale, [1, 1, -1], 'scale');
    vnear(mirrored().rotation, [0, 30, 0], 'rotation');
  });

  test('rotate (#self) turns about the unmirrored axes', SOURCE, () => {
    const w = world();
    const m = w.newModel('t1');
    m.transform = mirrored();
    m.rotate(40, 0, 0);
    near(m.transform, [0.86603, 0, -0.5, 0, 0.32139, 0.76604, 0.55667, 0, -0.38302, 0.64279, -0.66341, 0, 10, 20, 30, 1], 'rotate(40, 0, 0)');
    m.transform = mirrored();
    m.rotate(0, 0, 40);
    near(m.transform, [0.66341, 0.64279, -0.38302, 0, -0.55667, 0.76604, 0.32139, 0, -0.5, 0, -0.86603, 0, 10, 20, 30, 1], 'rotate(0, 0, 40)');
  });

  test('rotate(point, axis, angle) pivots about an unscaled, unmirrored point', SOURCE, () => {
    const w = world();
    const m = w.newModel('t1');
    m.transform = mirrored();
    m.rotate(vector(0, 0, 100), vector(1, 0, 0), 40);
    near(m.transform, [0.86603, 0, -0.5, 0, 0.32139, 0.76604, 0.55667, 0, -0.38302, 0.64279, -0.66341, 0, 21.69778, 84.27876, 50.26115, 1], 'mirrored');
    m.transform = scaled();
    m.rotate(vector(0, 0, 100), vector(1, 0, 0), 40);
    near(m.transform, [1.73205, 0, -1, 0, 0.64279, 1.53209, 1.11334, 0, 0.76604, -1.28558, 1.32683, 0, 21.69778, 84.27876, 50.26115, 1], 'scaled');
  });

  test('translate (#self) moves along the unscaled, unmirrored axes', SOURCE, () => {
    const w = world();
    const m = w.newModel('t1');
    m.transform = mirrored();
    m.translate(1, 2, 3);
    vnear(m.transform.position, [12.36602, 22, 32.09808], 'mirrored');
    m.transform = scaled();
    m.translate(1, 2, 3);
    vnear(m.transform.position, [12.36602, 22, 32.09808], 'scaled');
  });

  test('transform.rotation keeps a mirror; transform.scale replaces it', SOURCE, () => {
    const w = world();
    const m = w.newModel('t1');
    m.transform = mirrored();
    m.transform.rotation = vector(0, -90, 0);
    near(m.transform, [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 20, 30, 1], 'rotation');
    m.transform = mirrored();
    m.transform.scale = vector(2, 3, 4);
    near(m.transform, [1.73205, 0, -1, 0, 0, 3, 0, 0, 2, 0, 3.4641, 0, 10, 20, 30, 1], 'scale');
    m.transform = mirrored();
    m.scale(2, 3, 4);
    near(m.transform, [1.73205, 0, -1, 0, 0, 3, 0, 0, -2, 0, -3.4641, 0, 10, 20, 30, 1], 'node scale()');
  });

  test('pointAt keeps the world mirror, its rotation facing the target', SOURCE, () => {
    const w = world();
    const m = w.newModel('t1');
    m.transform = mirrored();
    m.pointAt(vector(100, 20, 30));
    near(m.transform, [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 20, 30, 1], 'mirrored');
    const c = w.newModel('t2');
    m.transform = mirrored();
    m.addChild(c, 'preserveParent');
    c.transform = transform();
    c.transform.position = vector(5, 0, 0);
    c.pointAt(vector(100, 20, 30));
    near(c.transform, [-0.52505, 0, -0.85107, 0, 0, 1, 0, 0, 0.85107, 0, -0.52505, 0, 5, 0, 0, 1], 'under a mirrored parent (local)');
    near(c.getWorldTransform(), [-0.02917, 0, 0.99957, 0, 0, 1, 0, 0, 0.99957, 0, 0.02917, 0, 14.33013, 20, 27.5, 1], 'under a mirrored parent (world)');
    c.transform = transform();
    c.transform.scale = vector(2, 3, 4);
    c.pointAt(vector(100, 20, 30));
    near(c.getWorldTransform(), [0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0, 0, 10, 20, 30, 1], 'scaled, under a mirrored parent (world)');
  });

  test('relative to a mirrored node: its matrix axes', SOURCE, () => {
    const w = world();
    const a = w.newModel('t1');
    const b = w.newModel('t2');
    a.transform = mirrored();
    b.transform = scaled();
    b.translate(0, 0, 10, a);
    vnear(b.transform.position, [5, 20, 21.33975], 'translate');
    b.transform = scaled();
    b.rotate(40, 0, 0, a);
    near(b.transform, [1.73205, 0, -1, 0, -0.64279, 1.53209, -1.11334, 0, 0.76604, 1.28558, 1.32683, 0, 10, 20, 30, 1], 'rotate');
    eq(String(a.transform.zAxis), String(vector(-0.5, 0, -0.86603)), 'zAxis');
  });
});
