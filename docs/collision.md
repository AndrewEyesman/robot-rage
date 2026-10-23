# Arena collisions ("invisible walls")

## How the arena collides

The 3D arena is only a view. Movement and collisions happen in a hidden 2D map off the
stage, in the robot behavior's `handleMove`:

- The robot is sprite 10 (member `rob1`, 8-bit, 33×26, matte ink), rotated every frame.
  Map position = (1200 + x/4, 200 + y/4) from the behavior's world `x`/`y`.
- Sprites 15–18 are four **collision maps** (`KROCKM~2/~3/~4`, `KR9B90~1`): 488×487
  32-bit bitmaps with alpha, stretched over rect(822, −180, 1582, 578), matte ink. Alpha
  255 is wall and alpha 0 is floor. One map per direction: the robot bounces off 15 when
  moving in −x, 16 in +x, 17 in −y and 18 in +y.
- Sprites 25/26 are fence lines (copy ink), 5 the firepit, 6 the pit.
- Each frame the behavior tests `sprite 10 intersects N` for each of them.

## What was wrong

1. **Mattes ignored alpha.** dirplayer built every matte by flood-filling white in from
   the image edges. The maps' transparent floor is partly black, so the matte made most
   of maps 15 and 18 solid (72.8% and 41.2% of their area, against 2.5% and 2.9% of
   wall). The 11.5 Scripting Dictionary describes `createMatte()` as built from the
   image's alpha layer. dirplayer now does that for 32-bit images with alpha.
2. **`intersects` ignored rotation.** It compared unrotated rects and sampled both mattes
   as if neither sprite were rotated. It now maps every stage pixel through each sprite's
   loc, regPoint, stretch, rotation and flips, and tests the mattes there.

## Evidence

All numbers come from `tools/` against the game's own bitmaps (exported natively with
`RR_MEMBERS=197,198,199,200,201,52 ... cargo test --test rr_score dump_bitmap_png`).

- **Pixel test vs an independent reference** (`tools/collision-sweep.py`, Python, same
  geometry from the exported alpha maps): 9,000 sampled positions and angles from a full
  sweep (`rr_intersect_sweep`, 76×76 positions × 8 angles × 4 maps): **0 mismatches**.
- **The old test against the reference:** it reported a wall at 75.5% of open-floor
  positions for map 15 (7,967 of 10,549) and 48.1% for map 18 (5,166 of 10,733).
- **Driving sweep** (`tools/drive-sweep-plan.py`, `tools/arena-tests.py`): from 359
  start points and headings, hold Up and measure progress. On the 342 paths the
  reference calls clear:

  | build | blocked on a clear path |
  | --- | --- |
  | before | 124 (36%) |
  | after | **0** |

- **Real walls still stop the robot:** 24 approaches that meet a real wall 10–22 px ahead
  all bounced, within 0–2 px of the predicted contact point.

## Not yet confirmed against Adobe's code

- The alpha threshold: dirplayer uses alpha > 0. Every map here has alpha exactly 0 or
  255, so this game can't tell the difference.
- That Director's `intersects` honours rotation the same way (rotation about the regPoint,
  pixel-centre sampling). The geometry is the natural one and the fixed driving matches
  the wall art, but it hasn't been read from `Dirapi.dll` yet.
- `locH`/`locV` truncation of fractional positions (inventory: unclear). The robot's map
  loc is set from floats every frame.

## Re-running

1. Export the bitmaps (command above) to a folder, e.g. `/tmp/dump`.
2. Start a second server instance with the build under test (see the handoff), plus a
   receiver that saves POST bodies on 127.0.0.1:8099.
3. Use `tools/arena-tests.py reach` to get to Training. In the page, run
   `window.__vm.rr_intersect_sweep(10, new Int16Array([15,16,17,18]), 822, -180, 1582, 578, 10, 45)`
   and POST the result, then run `tools/collision-sweep.py --sweep ... --dump /tmp/dump`.
4. `tools/drive-sweep-plan.py --dump /tmp/dump > plan.json` (and `--walls 6`) feed
   `tools/arena-tests.py drive --plan plan.json`; expect 0 blocked and 0 passed through.
