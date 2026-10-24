# Translating the game's scripts

The whole game is being ported by translating every Lingo script of the original
movies into TypeScript, one script at a time, keeping its structure, names and numbers.
The translated scripts run on a small Director runtime (`port/web/src/director/`) that
plays each movie's score from the extracted assets, so the original screens, frame
labels, sprites and behaviors stay exactly where the original put them. Read
`docs/decisions.md` (§4-5) first for why.

## Where things are

- Decompiled Lingo (reference only, never committed, never copied into the repo):
  `~/.t3/scratch/2026-10-23-can-you-somehow-re-engineer-c31057db/decomp/<movie>/`.
  Files are Latin-1: `iconv -f latin1 -t utf8`, `grep -a`. `.lasm` next to each `.ls` is
  the bytecode, for when the decompiler's output looks doubtful.
- Extracted assets: `port/assets/<movie>/index.json` (members, score, spans with
  behavior parameters) plus bitmaps, sounds, fonts and 3D. Rebuild with
  `port/extract.sh`. Never committed.
- Runtime: `port/web/src/director/` (score player, sprites, members, inks, text and
  fields, events, net, sound, timeouts). Lingo values: `port/web/src/lingo/` (lists,
  property lists, symbols, `string()`, `value()`, chunk expressions).
- Translations: `port/web/src/movies/<cast>/`, one file per script, named after the
  script member (`s031-asp-communication-object.ts`), plus an `index.ts` that calls
  `registerCast('<cast>', { scripts: { 31: AspCommunicationObject, ... }, handlers: {...} })`.
  `<cast>` is the movie name for a movie's internal cast (`login013_`, `factory0604`,
  `lobby060_`, `arena104`, `loader002`) or the external cast's name (`robotwars`,
  `texter`). Import each cast's `index.ts` from `port/web/src/movies/index.ts`.
- Running it: `cd port/web && npm run dev`, open `http://127.0.0.1:8092/game.html`
  (`?movie=login013_&frame=login` starts a movie directly). The dev server proxies
  `/api`, `/game/main.ini` and `/ws` to a test game server (`RR_SERVER`, default
  `http://127.0.0.1:8091`). Never point it at 8090 (the shared server the maintainer plays on).
- The fan wrapper movies (`wrapper_robotragerearmed`, `login013`, `lobby060`,
  `netLingo`, `ac`) only preload files and compile relay scripts at runtime; the port
  skips them: `login013` plays `login013_`, `lobby060` plays `lobby060_`.

## How to translate

- **One class per behavior or parent script**, methods named exactly as the Lingo
  handlers (`on mouseUp me` -> `mouseUp()`); handler lookup is case-insensitive like
  Lingo's. Declare every `property` as a field (initialised to `undefined` = VOID
  unless the script sets it in `new`), with the Lingo name, so behavior parameters from
  the score and `sprite(n).pState`-style access find it. Behaviors extend `Behavior`
  (gives `spriteNum` and `sprite`).
- `on new me, a, b` becomes the constructor (`constructor(a?, b?)`); a script that
  `return me`s from `new` needs nothing extra. Behaviors are created with no arguments,
  then get their score parameters, then `beginSprite`.
- **Movie scripts** become exported functions in their file, and are also listed in
  the cast's `handlers` so the runtime can reach them (events falling through to movie
  scripts, `sendSprite(0, ...)` with no frame-script handler, timeouts with no target).
  Call them directly by import from other translated code. A movie script's `on
  prepareMovie` / `startMovie` / `stopMovie` / `exitFrame` go in `handlers` too.
- **`pass` ends the handler** in Lingo (nothing after it runs), so translate it as
  `return pass();`. `stopEvent()`/`dontPassEvent()` don't end it.
- **`go()` then `the frame`**: after `go(x)`, `the.frame` already reports x, so the
  common `go(label) ... go(the frame)` keeps the jump, as in Director.
- **Globals** live in `G` (`import { G } from '../../director'`): `global gCom` +
  `gCom.send(...)` -> `G.gCom.send(...)`. Names are case-insensitive.
- **Lingo commands and `the` properties** come from `director/api.ts`:
  `sprite(n)`, `member(name)`, `go(label)`, `go(1, 'factory0604')`, `sendSprite`,
  `sendAllSprites`, `pass()`, `stopEvent()`/`dontPassEvent()`, `call`, `timeout(name)`,
  `the.frame`, `the.milliSeconds`, `the.key`, `the.keyCode`, `keyPressed(36)`,
  `getPref`/`setPref`, `postNetText`, `netDone`... If something the game uses is
  missing, add it to the runtime in the same style (small, documented, matching
  Director), and say so in your report.
- **Values**: use the lingo library for anything that is a Lingo list, property list,
  symbol or string the game parses or serialises (server data, ini files, chat).
  1-based lists stay 1-based. `string()` must stay byte-exact (the server checksums
  robot data). Plain JS numbers are fine for arithmetic; where Lingo divides two
  integers use `Math.trunc(a / b)`; where it formats a float use the library.
- **Keep the original's structure and numbers.** Same handler names, same states, same
  constants, same order of operations, including quirks and bugs (note them with a
  comment, don't fix them; fixes for the maintainer come later as separate enhancements).
  Comments explain Director behaviour the code relies on, not what the line does.
- **Never commit** the decompiled scripts, extracted assets, game files or Adobe
  binaries. The translated TypeScript is fine to commit (the maintainer's call).

## Don't break what works

`docs/port-behaviors.md` lists every behaviour that has been verified, and
`node port/tools/regress.mjs` (`npm run test:port`) checks all the automated ones (a
few minutes; `--fast` skips the slow ones; a word filters by check name). It starts
its own game server and dev server on fresh seed data (`port/tools/regress-seed.json`)
every run, so it never depends on, or changes, the shared test server; `--live` runs
against 8091/8092 instead. A pre-commit hook (`scripts/git-hooks`, enabled with
`git config core.hooksPath scripts/git-hooks`) runs the fast checks whenever a commit
touches the port or the server. Before calling any change done,
especially to shared code (`port/web/src/director/`, `s3d/`, `lingo/`), run the full
suite: a behaviour that stops working is a failure to fix, not a side effect. When you
verify something new, add its line to the list and, where practical, a check to the
suite. Screenshot checks compare with approved images in `.cache/regress/approved/`;
approve a deliberate change with `--approve` only after looking at the diff.

## Issues

Every issue found along the way goes in `docs/port-issues.md`: original-game quirks
kept on purpose, differences between the port and Adobe's player, things that need
The maintainer's decision (faithful but bad for play), runtime fixes, and tooling problems.
Say what happens, why, and where.

## Checking

Check each screen against something real, not by eye alone:

- **dirplayer** (`http://127.0.0.1:8091/`, a test server; the original scripts running
  in the emulator): same screen side by side, and `window.__vm.mcp_eval_lingo(code)` to
  ask what a script variable or member holds at a moment (see
  `port/tools/physics-trace.mjs` for driving it with playwright-core and
  `/usr/bin/google-chrome-stable`). Test login: tester@home.lan / rage2005 on 8091 only.
- **Adobe's player** (`tools/reference/`, `docs/reference.md`) for how the real thing
  looks. One reference container at a time; coordinate before using it.
- The port exposes `window.__player` (the runtime) for scripted checks.
- Screenshots go under the repo's `.playwright-mcp/` (ignored) or `/tmp`.
