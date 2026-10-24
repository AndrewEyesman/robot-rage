# Reference player

The reference for "how the real game behaves" is Adobe's own Director 10.1 player running
the same game files we serve: Flashpoint's Shockwave projector (`SPR.exe`, Dirapi 10.1,
the Xtras the game needs) under Wine, in Docker, on a virtual X display. Decided
2026-10-23 with the maintainer, after a second opinion (GPT) and a measurement.

## Why not the real player in the browser

Boxedwine (Wine + x86 emulator in WebAssembly) runs the projector in a browser tab, but
its web build has no OpenGL/Direct3D, so Shockwave 3D falls back to its software renderer
on an emulated CPU: the arena orbit benchmark measured 1.3 fps at the arena's size
(3-4 fps at 320x240), against roughly 30 fps needed. A later try with Boxedwine's
WebAssembly JIT reached 9.2 fps and was shelved too (`docs/decisions.md` §3). So the real
player is the reference that what we build (now the port, `port/`) is compared against.

## Running it

    docker build -t robotrage-wine-ref docker/wine-reference   # once (Wine, Xvfb, xdotool, MS core fonts)
    PORT=8091 PUBLIC_DIR=... DATA_DIR=... node server/index.mjs # a test server, never 8090
    tools/reference/ref-start.sh 8091                           # waits for the login screen
    tools/reference/refctl.sh click 480 222                     # stage coordinates (800x600)
    tools/reference/refctl.sh type 'tester@home.lan'
    tools/reference/refctl.sh shot /tmp/x.png

- The projector files come from `$REF_PROJECTOR` (default `~/rr-spike/app/stage/spr`, from
  Flashpoint). They are Adobe binaries: never commit them.
- The game files are copied from `public/game`, and `main.ini` from the test server, so the
  reference talks to our server exactly like the browser client does.
- Microsoft's core fonts are installed in the Wine prefix: the game asks for Verdana, which
  every 2004 Windows had. Without them Wine substitutes a font and the text layout differs.
- 3D renders through Wine's Direct3D on Mesa's software OpenGL (no GPU in the container),
  so 3D comparisons need a tolerance; 2D should match closely.

## Asking Adobe's player questions (Lingo)

    tools/reference/ref-movie.sh arena104.dcr                   # one movie, with ref-repl installed
    tools/reference/refeval.sh 'member("arena").model.count'    # prints string(expression)
    tools/reference/refeval.sh -s 'global gM' 'gM = member("arena").model(1)'   # statements

`ref-repl.ls` is installed through the projector's `--do` arguments and polls
`ref-cmd.txt` every 200 ms. It only works in a movie that stays put: it dies when the
movie switches, so the full login-to-arena flow can't be scripted this way (start the
movie directly instead; the arena then has its 3D member but no game state). Any Lingo
error stops it for good: restart with `ref-movie.sh`, and send statements one at a time
when unsure. In standalone arena104 sprite 2 is empty: puppet it with the `arena` member,
and use `member("arena").camera(1)` (not `sprite(2).camera`).

For dirplayer, `tools/reference/emu-driver.mjs` keeps a session open in Chrome and takes
the same kind of commands over HTTP (`/login`, `/click`, `/eval`, `/shot`; see its header).
In its `/eval`, `a.b.c = v` is a comparison: assign through a variable (`g = a.b` then
`g.c = v`) or `set the c of a.b to v`.

## First findings (robot list, 2026-10-23)

- The robot name in the list is yellow in the real player, white in dirplayer.
- Verdana text: a Chrome without Verdana falls back to a serif font; the real
  game (on any Windows) used Verdana. Line breaks and bold runs differ as a result.

## Paired tour

    tools/reference/ref-start.sh 8091
    node tools/reference/tour.mjs /tmp/rrwork/tour/<run> 8091     # both players, same steps
    tools/reference/tour-report.py /tmp/rrwork/tour/<run>         # index.html: reference | dirplayer | diff

dirplayer runs in Chrome with the GPU at device scale 1.25 (a common display scaling).
The arena checkpoints aren't synchronised yet: the reference loads the arena more slowly,
so its drive/turn steps start later.

## Backlog from the first tour (2026-10-23), most visible first

1. ~~Arena: the player's car top is see-through.~~ Fixed: mirrored models were culled
   inside out (every model here is mirrored by the W3D's "Scene Root"; Adobe's player
   culls by the mesh's own winding whatever the handedness, checked with a box drawn
   `#front`/`#back` with and without a mirror). This also fixed the arena's buildings,
   the glass pyramid and the garage preview's car. The car roof is still lit flatter
   than in the reference.
2. Text at device scale 1.25: Verdana lists with fixedLineSpace 15 step 12px (Buy lists,
   category dropdown). Correct at scale 1.
3. Verdana is missing in Chrome on Linux; the fallback is a serif font.
4. Text colour: robot name yellow in the robot list and green in the arena (reference),
   white in dirplayer.
5. Tab stops ignored: Stats ("Won/Lost/Ties" values column) and Highscore rows.
6. Ink 6 robot-list highlight: the reference shows a lighter olive row, not navy.
7. Garage preview robot: different camera angle, flat shading, wheel texture.
8. Buy parts: the part's 3D wireframe preview is blank.
9. The "- Zoom +" bar under the workshop/paintshop preview is missing.
10. Smaller: Ranking dash missing, Impact tab labels 1-3px low, battery cap blue, stray
    "SE" text at the login screen's bottom left.
