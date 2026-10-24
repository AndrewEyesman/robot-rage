# Decisions

How the project got where it is: what was decided, why, and what settled it. Newest
last. Details live in the linked docs.

## 1. Run the original files in an emulator (early October 2026)

The game is a set of Shockwave (Director MX 2004) movies, and browsers dropped
Shockwave long ago. The first approach was to run the original, unmodified files in
[dirplayer-rs](https://github.com/igorlira/dirplayer-rs), an open-source Shockwave
emulator in WebAssembly, and to rebuild the dead online services (login, robots, IRC
lobby, match relay) in `server/`.

Why: the original files are the most faithful version of the game there is, and
nothing has to be reimplemented except the servers.

Outcome: login, garage, lobby and the Training arena all came up in the browser. The
server side is done and reusable whatever runs the game (`docs/notes.md`).

## 2. Never stream the real player from a server

Running Adobe's player on a server and streaming video to the browser was ruled out
by the maintainer and isn't to be proposed again.

## 3. Adobe's player as the reference, not as the game (2026-10-23)

To know what "correct" looks like, Adobe's own Director 10.1 player (the Flashpoint
projector) runs the same game files under Wine in Docker, on this desktop only. It is
driven by scripts and screenshotted next to whatever we build (`docs/reference.md`).

Running that player inside the browser instead, through Boxedwine (Wine plus an x86
emulator in WebAssembly), was tried twice and shelved:

| Attempt | Arena benchmark |
| --- | --- |
| Boxedwine's interpreter | 1.3 fps |
| Boxedwine's WebAssembly JIT, plus our flag and display fixes | 9.2 fps |
| Needed | ~30 fps |
| Native (same player, same machine) | 135 fps |

Shockwave 3D falls back to software rendering on an emulated CPU, and the realistic
ceiling with weeks more work looked like 15-20 fps. Not worth it.

## 4. Port the game instead of perfecting the emulator (2026-10-23)

The plan had been to fix dirplayer until single-player behaved like the real game,
with an inventory of 410 Director features to check (`docs/inventory.md`). The
problem was the shape of that work: emulating all of Director well enough for one
game, judged by eye, with no clear end ("a million issues"). Every fix had to stay
correct for every other Director game, too.

As an experiment, the Training arena was ported to TypeScript and Three.js, translated
directly from the game's own scripts (`port/`). It went well enough that the maintainer chose
it as the way forward:

- **It can be checked exactly.** dirplayer still runs the original scripts, so the
  port's driving can be compared with the original tick by tick
  (`port/tools/physics-trace.mjs`). First run: 229 ticks identical, including a wall
  hit and bounce.
- **It matches the real player.** Side-by-side screenshots against Adobe's player:
  lighting, sky, buildings, robot, HUD text in the game's embedded fonts, fire pit
  smoke and flames.
- **It's only as big as the game.** The port reproduces what Robot Rage does, not
  everything Director can do.
- **It leaves room to improve the game.** Widescreen, smooth 60 fps drawing (the logic
  still ticks at the original 20 fps), crisp text at any size, and later the subtle UI
  changes and gameplay tweaks the maintainer wants. None of that fits an emulator whose job is
  to behave exactly like 2004.

The port still reads the game files with dirplayer's parsers (`port/extract`), so a
parser limitation can show up in both. The known one: dirplayer can't decode the
lighting normals stored in the 3D models, so the extractor rebuilds and smooths them
(`port/README.md`).

## 5. How the port stays faithful

- Translate the original scripts directly, keeping their structure and numbers.
- Check each piece against something real: dirplayer running the original code (tick
  traces) or Adobe's player (screenshots and its Lingo REPL).
- Keep enhancements separate from the original logic, so the original behaviour stays
  available and testable.
- Commit the ported TypeScript, but never the game files, the extracted assets
  (`port/assets/`), the decompiled scripts, or Adobe/Windows binaries. The repository
  stays private.

## 6. What dirplayer is for now

dirplayer remains the playable version on port 8090 until the port can replace it.
After that it stays the yardstick: the one thing that runs the original scripts and
can answer "what did the game actually do here?".
