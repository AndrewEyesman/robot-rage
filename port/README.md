# Port experiment: the arena in TypeScript and Three.js

An experiment in porting the game instead of emulating Director: the Training arena
with one drivable robot, translated from the arena movie's Lingo and drawn with
Three.js. dirplayer (`public/`, port 8090) stays the playable version.

## Running it

    scripts/fetch-game.sh          # the game files, into public/game (once)
    port/extract.sh                # their assets, into port/assets (never committed)
    cd port/web && npm install && npm run dev    # http://127.0.0.1:8092

`port/extract` is a small Rust tool built on dirplayer's file and W3D parsers. It
writes each movie's bitmaps, its Shockwave 3D members (scene graph, shaders, meshes,
textures) and its score layout. It builds inside the dirplayer builder image.

Keys: arrows drive, 1/2/3 pick the camera, L switches between the original 4:3
layout and widescreen, R restarts. The robot comes from the URL, e.g.
`?parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher` (part ids as in the game).

## What is translated

- `src/robot.ts`: the robot behavior (driving, wall/fence bounces, battery, falling off
  the roof, tipping into the pit) and BuildRobot (assembling the 3D model from parts).
- `src/collision.ts`: the hidden 2D collision map and `sprite a intersects b`, the way
  the arena really collides (see `docs/collision.md`).
- `src/camera.ts`: the follow camera (SpringDamp) and views 1-3.
- `src/arena.ts`: BuildWorld's changes to the arena scene.
- `src/director-material.ts`: Shockwave 3D's #standard shading: per-vertex lighting,
  texture layers with their blend functions, CLOD texture coordinates.
- `src/parts.ts`: the part table (names, weights, energy use, models).

The game logic ticks at the original's 20 fps; drawing runs at the display's rate and
places the robot and camera between the last two ticks. Widescreen widens the view at
the same vertical field of view.

## Checking it against the original

    node port/tools/physics-trace.mjs 8091    # needs the dev server and a test server

This drives the original robot behavior in dirplayer tick by tick (paused movie, one
`prepareFrame` per tick, keys from `tools/schedule.mjs`), then the port with the same
robot and keys, and compares position, heading, speed, velocity and spin after every
tick. First run: 229 ticks identical, including a wall hit.

## Not done yet

Weapons, the opponent, sounds, the fire pit's flames and smoke, damage marks on the
paint map, the robot's saved paint map from the server, the menus, and everything
outside the arena.
