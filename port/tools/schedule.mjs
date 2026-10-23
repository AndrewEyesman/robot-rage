// A drive for the physics comparison: keymaps per 20 fps tick (left, right, up, down,
// z, x, c, unused). Accelerates north, turns, hits the wall, reverses and spins.
const run = (map, n) => Array(n).fill(map);
export const SCHEDULE = [
  ...run('00000000', 2),
  ...run('00100000', 40),
  ...run('10100000', 12),
  ...run('00100000', 60),
  ...run('01000000', 15),
  ...run('00010000', 30),
  ...run('01100000', 40),
  ...run('00000000', 30),
];
