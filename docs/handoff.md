# Handoff (2026-10-23)

Read `docs/notes.md` first: protocol findings, the emulator patch list, and how to build.

## Where things stand

- Login, robot list, garage (workshop) and the Training arena load and render in the
  browser. The garage preview shows the robot and can be dragged; the arena is lit and the
  camera sits behind the robot.
- Lobby/relay server work is done and covered by `npm test` (two simulated clients), but
  has not been tried in the real game.
- Known bugs the maintainer reported (not yet investigated unless noted):
  - Can't drive the car. The arena polls `keyPressed(123..126)` (Mac arrow key codes);
    dirplayer probably doesn't map browser arrow keys to those.
  - Robot list ("Choose a robot"): the selected row is a grey bar with no robot name.
  - Garage preview: the robot model looks wrong (wheel placement/orientation).
  - Workshop tabs (Paintshop, Buy parts, Sell parts) don't respond.
  - Stats tab shows "Ranking: □" (missing glyph).

## Agreed direction

Single-player must match the original before any multiplayer work.

The maintainer doesn't want to hand-list every difference. Plan proposed (awaiting his go-ahead):

1. Run Adobe's real Shockwave 12 player as a reference on the LAN server (Wine first, a
   Windows VM if Wine can't do Shockwave 3D), pointed at our own server.
2. Build a comparison harness: drive the same inputs through the real player and our
   browser build, capture screenshots plus a Lingo-side state dump (sprites, text, layers,
   3D node transforms, event order), and diff automatically. The diff is the bug list.
3. Fix in order of what blocks play (controls, tabs, robot list, preview), re-run until the
   diff is empty for every single-player screen and a scripted training match.
4. For subtle behaviour (lighting, event order), consult the real runtime: disassembly of
   the Shockwave player, and possibly Intel's U3D reference code (said to derive from the
   IFX engine behind Shockwave 3D; verify before relying on it).

Estimates given: reference player half a day to 2 days, harness about half a day,
single-player parity about a week of agent work, multiplayer 1–3 days after.
Subagents help about 1.5–2x (shared Docker build, one Playwright browser, shared emulator
code); use worktrees per area.

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
