# Handoff (2026-10-23)

Read `docs/notes.md` first: protocol findings, the emulator patch list, and how to build.

## Where things stand

- Login, robot list, garage (workshop) and the Training arena load and render in the
  browser. The garage preview shows the robot and can be dragged; the arena is lit and the
  camera sits behind the robot.
- Lobby/relay server work is done and covered by `npm test` (two simulated clients), but
  has not been tried in the real game.
- Known bugs the maintainer reported (not yet investigated unless noted):
  - Can't drive the car: fixed (the frame script's `keyPressed()` calls reached the robot
    behavior's own `keyPressed` handler; see `docs/notes.md`).
  - Robot list ("Choose a robot"): the selected row is a grey bar with no robot name.
  - Garage preview: the robot model looks wrong (wheel placement/orientation).
  - Workshop tabs (Paintshop, Buy parts, Sell parts) don't respond.
  - Stats tab shows "Ranking: □" (missing glyph).

## Agreed direction (revised 2026-10-23 after an independent review)

Keep running the original files in dirplayer (no rewrite or transpile). Single-player must
work before visual polish; a real two-player match comes early, not last.

1. Controls: make the Training arena drivable (keyPressed with Mac key codes 123..126 etc.).
2. Upstream check: compare our pinned dirplayer (68376fb + patches/dirplayer.patch) with
   current upstream github.com/igorlira/dirplayer-rs. Pull in relevant fixes (especially 3D,
   text, input, events) before fixing more ourselves; re-base the patch if worthwhile.
3. Pin the reference build: record hashes and version strings of the game files we serve.
   robotrage.pro mixes v60 files with the v55 arena and modified multiplayer, so state
   which build we target. robotrage.pro screenshots and archived material are a cheap
   visual reference, but not for timing or physics.
4. Reference player (needs the maintainer's go-ahead; LAN server): use the Adobe Shockwave
   debug projector setup Flashpoint uses (Lingo console, script injection, trace logging;
   https://flashpointarchive.org/datahub/Shockwave_Curation) rather than building
   instrumentation from scratch. Match the plugin runtime/Xtra versions. Timebox Wine;
   fall back to a Windows VM with working 3D. Adobe's Multiuser Xtra uses native TCP
   sockets, while our lobby and relay speak WebSockets, so multiplayer comparison needs a
   TCP-to-WebSocket adapter.
5. Comparison, small first: targeted probes for key polling, event order, layering, text
   encoding, 3D parenting, rotation and transforms. Then checkpointed gameplay replays with
   fixed robot/database fixtures and controlled network replies. Pitfalls: the arena reads
   systemDate/milliSeconds and has a busy-wait loop (don't freeze time naively), random
   numbers, input sampling, and font/renderer differences in screenshots. Compare numbers
   with tolerances. An empty diff only covers what was tested.
6. Re-check two of our own patches against the reference; they may be game-specific
   rather than true Director semantics: "all 3D sprites draw above 2D and take clicks
   first", and "stop delivering an event to the old frame's remaining behaviors once go()
   moves the playhead".
7. A real two-client match in the browser soon after controls work. The simulated
   npm test doesn't prove in-game sync.
8. Then work through the comparison diffs: workshop tabs, robot list text, robot model
   transforms, collisions and weapons, then visual polish.
9. Use LibreShockwave (github.com/LibreShockwave/LibreShockwave) only for a bounded look at
   its debugger and input recording; nothing shows it plays this game's 3D. Intel U3D/IFX
   code and DLL disassembly are for isolated unresolved questions only.

Estimates: reference 0.5–2 days; harness prototype about half a day. Single-player and
multiplayer parity estimates are withdrawn until the reference works and one real match
has been played.

## Testing gotchas

- The maintainer sometimes plays on the same local server with the same account
  (tester@home.lan / rage2005); check `.cache/server.log` for other sessions before blaming
  the emulator for changed robot data.
- Training refuses to start until the robot has an engine.
- The garage inventory row re-centres after each part is used; recompute click positions.
- The game server runs on port 8090 (`scripts/rr-restart.sh` in the old scratch folder
  restarted it; `npm start` with `PORT=8090`).
- Decompiled Lingo (never commit it) and the Playwright scripts used for testing live in
  the previous thread's scratch folder:
  `~/.t3/scratch/2026-10-23-can-you-somehow-re-engineer-c31057db/`
  (`decomp/`, `scripts/pw-garage-arena.js`, `shots/`). Many `.ls` files are Latin-1:
  use `grep -a` and `iconv -f latin1 -t utf8`. Lingo can be evaluated in the page via
  `window.__vm.mcp_eval_lingo(...)` (returns JSON; wrap values in `string(...)`).
