# Handoff (2026-10-23)

Read `docs/notes.md` first: protocol findings, the emulator patch list, and how to build.

## Where things stand

- Login, robot list, garage (workshop) and the Training arena load and render in the
  browser, and the robot drives (arrows, Z/X/C weapons).
- dirplayer is now based on upstream PR #244 (much better Shockwave 3D: the arena has the
  real dusk sky and lit buildings). See `docs/upstream.md`. The pinned game build is in
  `docs/game-build.md`.
- Lobby/relay server work is done and covered by `npm test` (two simulated clients), but
  has not been tried in the real game.
- Known bugs the maintainer reported (not yet investigated unless noted):
  - Invisible walls on the rooftop (Training arena).
  - Robot list ("Choose a robot"): the selected row is a grey bar with no robot name.
  - Garage preview: the robot model looks wrong (wheel placement/orientation).
  - Workshop tabs (Paintshop, Buy parts, Sell parts) don't respond.
  - Stats tab shows "Ranking: □" (missing glyph).

## Decision (the maintainer, 2026-10-23)

Accuracy above all. Stay on dirplayer, running the original game files unmodified, and fix
dirplayer until single-player behaves like the real game. No streaming, no running the
real player for play, and no Wine/Windows-VM reference player (not approved). A
TypeScript/Three.js port was considered and dropped.

The outside reference is Adobe's own code, read with Ghidra (and the REA toolkit) for
targeted questions, e.g. "how does `intersects` handle rotated sprites?", not to read the
whole player. Real-player screenshots exist from the Flashpoint spike
(`~/rr-spike/shots/report/`, branch `spike/shockwave-in-browser`).

The maintainer's concern is whack-a-mole: "a million issues" with no visible end, judged by eye.
So issues are counted (the inventory) and each fix is checked against something real
(Adobe's code, reference screenshots, documented behaviour) and kept by a test. "Done"
is an agreed scenario matrix with tolerances, not "every feature checked once".

## Plan

1. Done: controls, upstream rebase, pinned build (`docs/upstream.md`, `docs/game-build.md`).
2. Inventory: every Director feature the game's Lingo uses (`tools/lingo-inventory.py`
   over the decompile), each classified works / wrong / unclear against dirplayer's code,
   Director's documentation, ScummVM's Director engine (2D cross-check) and Adobe's code.
   Committed as `docs/inventory.md`; its counts answer "how many issues are left?".
3. Invisible walls first. The arena does collision in a hidden 2D map: the robot is a
   rotated off-stage sprite, the walls are sprites, and the robot behavior tests
   `sprite sp intersects N`. dirplayer's `intersects`
   (`vm-rust/src/player/bytecode/sprite_compare.rs`) compares bounding rects and samples
   mattes unrotated. Confirm with a debug overlay of the collision map (the robot's true
   rotated quad) and an automated driving sweep at many angles. Check Director's real rule
   in Adobe's code, fix it, keep the sweep as a regression test, then ask the maintainer to drive
   the rooftop.
4. Work the inventory in order of impact on play: controls and collisions, robot-list text,
   workshop tabs, garage robot model, sky, Stats "Ranking" glyph. Each fix gets a test.
5. Re-check two of our patches against Adobe's code; they may be game-specific rather than
   Director behaviour: "all 3D sprites draw above 2D and take clicks first", and "stop
   delivering an event to the old frame's remaining behaviors after go() moves the
   playhead".
6. A real two-player match in two browser tabs once controls and collisions are right.
7. The maintainer playtests at checkpoints for feel; what they report becomes measurable tests.

Later, after single-player is accurate (don't start yet): an "enhanced" setting with
original mode kept exact: 3D and TrueType text at full device resolution (2D menu art
original, crisp whole-step or smooth scaling), a widescreen arena (wider 3D window and
field of view, same setting for both players), menus kept 4:3 and centred. Whole-step
canvas scaling in `public/index.html` is faithful and may be done any time.

Estimates: parity estimates are withdrawn. GPT-6.1-Sol guessed 8–16 engineering weeks for
convincing fidelity; re-estimate from the inventory.

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
