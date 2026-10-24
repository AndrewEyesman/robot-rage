# Handoff (updated 2026-10-24)

Read `docs/decisions.md` first: how the project got here and why. Then `port/README.md`
for the port, and `docs/notes.md` for the server protocol and the dirplayer patches.

## Where things stand

- **The port is the way forward** (decided 2026-10-23, `docs/decisions.md` §4). It lives
  in `port/` on `main`: the Training arena in TypeScript and Three.js, translated from
  the game's scripts. One robot drives with the original physics (checked tick by tick
  against the original), with collisions, the follow camera, HUD with the game's
  fonts, sounds, and the fire pit's smoke and flames. Widescreen and 60 fps drawing.
- **dirplayer** still runs the whole game (login, garage, lobby, Training) and is what
  The maintainer plays on port 8090. It stays until the port can replace it, then remains the
  reference for "what did the original do?".
- **The servers** (`server/`: login and robots API, IRC lobby, match relay) are done,
  covered by `npm test`, and don't depend on which client runs the game.
- **Adobe's player** runs under Wine in Docker on this desktop as the visual reference
  (`docs/reference.md`).

## Plan

1. Finish the arena: the explosion and breakdown smoke, weapons (one script per
   weapon, each checked against dirplayer with tick traces), damage marks on the paint
   map, the robot's saved paint map from the server.
2. A second robot and a real two-player match through the existing lobby and relay
   (keep the original wire protocol so the server work carries over).
3. The 2D screens: login, robot list, garage (workshop, paintshop, buy, sell, stats),
   lobby. Open question for the maintainer: pixel-faithful 800x600 screens, or rebuilt
   resizable UI keeping the original art.
4. The maintainer's enhancements, kept separate from the original logic: subtle UI changes,
   less clunky physics, and whatever else comes up.

Known gaps in the port: dirplayer's parser can't decode the 3D models' stored normals,
so the extractor rebuilds and smooths them (an approximation), and the arena's
inside-out barrel is lit where Adobe's player leaves it dark. Decoding the real normals
would fix both, and dirplayer too.

The maintainer judges look and feel at checkpoints; what they report becomes measurable checks.

## dirplayer (the previous plan, kept for reference)

The dirplayer work (inventory of 410 Director features, collision fix, upstream PR #244
base, backlog from the paired tour) is described in `docs/inventory.md`,
`docs/collision.md`, `docs/upstream.md` and `docs/reference.md`. Its fixes still matter
while 8090 runs on it.

## Testing gotchas

- The maintainer sometimes plays on the same local server with the same account
  (tester@home.lan / rage2005); check `.cache/server.log` for other sessions before blaming
  the emulator for changed robot data.
- Training refuses to start until the robot has an engine.
- The garage inventory row re-centres after each part is used; recompute click positions.
- The game server runs on port 8090 (`scripts/rr-restart.sh` in the old scratch folder
  restarted it; `npm start` with `PORT=8090`). The maintainer plays there: test changes on a second
  instance (`PORT=8091 PUBLIC_DIR=... DATA_DIR=...` with copies) before installing a new
  build into `public/dirplayer/`, and stop it afterwards.
- `scripts/build-dirplayer.sh` also installs into `public/dirplayer/`, which 8090 serves.
  To build without installing, run the same `docker run` and copy
  `vendor/dirplayer-rs/dist-polyfill/dirplayer-polyfill.js` yourself.
- The player takes keys only while its stage element has focus; `public/index.html`
  forwards keys to it when nothing is focused. `window.__vm.set_glyph_preference(...)` and
  `clear_font_cache()` switch text rendering paths at runtime.
- Ghidra 12.2 (JDK 25) is in `~/tools/`, with a headless project
  `~/tools/ghidra-projects/director101` holding Adobe's Director 10.1 `Dirapi.dll`,
  `Iml32.dll`, `Shockwave 3D Asset.x32`, `TextXtra.x32` and `Font Xtra.x32` (binaries from
  `~/rr-spike/fp-shockwave/`). The REA CLI is installed globally (`rea`). Never commit
  Adobe, Windows or game binaries.
- Decompiled Lingo (never commit it) and the Playwright scripts used for testing live in
  the previous thread's scratch folder:
  `~/.t3/scratch/2026-10-23-can-you-somehow-re-engineer-c31057db/`
  (`decomp/`, `scripts/pw-garage-arena.js`, `shots/`). Many `.ls` files are Latin-1:
  use `grep -a` and `iconv -f latin1 -t utf8`. Lingo can be evaluated in the page via
  `window.__vm.mcp_eval_lingo(...)` (returns JSON; wrap values in `string(...)`).
