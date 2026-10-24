# The port: the game in TypeScript and Three.js

The game's Lingo scripts translated to TypeScript, one script at a time, running on a
small Director runtime (`web/src/director/`, with Shockwave 3D on Three.js in
`web/src/director/s3d/`) that plays each movie's score from its extracted assets.
`TRANSLATING.md` has the rules. dirplayer (`public/`, port 8090) stays the playable
version until the port replaces it.

## Running it

    scripts/fetch-game.sh          # the game files, into public/game (once)
    port/extract.sh                # their assets, into port/assets (never committed)
    cd port/web && npm install && npm run dev    # http://127.0.0.1:8092

`port/extract` is a small Rust tool built on dirplayer's file and W3D parsers. It
writes each movie's bitmaps, its Shockwave 3D members (scene graph, shaders, meshes,
textures) and its score layout. It builds inside the dirplayer builder image.

- `game.html`: the whole game from the loader (`?movie=login013_&frame=login` starts a
  movie directly).
- `index.html`: the arena on its own, entered with the globals the garage or the lobby
  would leave (see below).
- `demo.html`: the first arena demo, frozen (written before the runtime existed); the
  reference `tools/check3d.mjs` compares the 3D layer against.

## The arena (arena104)

`web/src/movies/arena104/` translates every script of the arena movie: the match frame
script (start sync, countdown, the opponent's messages, results, revenge and draw,
score reporting, walkover), the robot behavior (driving, collisions on the hidden 2D map
of `docs/collision.md`, battery, damage and paint-map marks, falling and tipping), the
Training frame script, the camera, the multiuser scripts, the wheels, chat, buttons and
the frames around a match. The weapons ("vapen" behaviors and their shots) register
from `weapons.ts`; the "Arena 3D" movie script from `3d.ts`.

The arena dev page:

    index.html                                   Training, the test account's robot (tester@home.lan)
    index.html?user=rival@home.lan&pass=rage2005 another account (&robot=Name picks a robot)
    index.html?parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher
                                                 Training with a robot from part ids, no server
    index.html?match=host&opp=1005&addr=10.9.9.1 a match: this tab hosts at relay address 10.9.9.1
    index.html?match=client&host=10.9.9.1&opp=1003&user=rival@home.lan&pass=rage2005
                                                 the other tab joins it (&ranked=1: ranked)

In the arena the keys are the game's (arrows drive, Z/X/C fire, 1/2/3 cameras, T
chats). Two improvements, kept apart from the translated scripts in
`arena104/enhancements.ts`:

- Widescreen: the 3D view spans the window above the original control panel, at the
  same vertical field of view. L switches to the original 4:3 stage
  (`?layout=original`).
- Smooth drawing: the scripts run at the movie's 20 frames a second; the 3D view draws
  at the display's rate, each node placed between its last two poses (`?smooth=0`).

## Checking it against the original

    node port/tools/physics-trace.mjs 8091    # needs the dev server and a test server

Drives the original robot behavior in dirplayer tick by tick (paused movie, one
`prepareFrame` per tick, keys from `tools/schedule.mjs`), then the translated robot
behavior in the runtime (`index.html`, paused player) with the same robot and keys, and
compares position, heading, speed, velocity, spin and the map sprite after every tick:
229 ticks identical, including a wall hit. dirplayer truncates fractional sprite
locations where Adobe's player rounds them (checked in its Lingo REPL); the runtime
rounds, and the trace switches it to truncation to compare like with like
(`ROUND=1` shows the difference: a wall hit a tick apart).

`tools/check3d.mjs` compares the 3D layer with the frozen demo pixel by pixel.

## Not done yet

The garage (factory0604) and the lobby (lobby060_) are being translated; until they
land, `index.html` stands in for them.
