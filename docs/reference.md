# Reference player

The reference for "how the real game behaves" is Adobe's own Director 10.1 player running
the same game files we serve: Flashpoint's Shockwave projector (`SPR.exe`, Dirapi 10.1,
the Xtras the game needs) under Wine, in Docker, on a virtual X display. Decided
2026-10-23 with the maintainer, after a second opinion (GPT) and a measurement.

## Why not the real player in the browser

Boxedwine (Wine + x86 emulator in WebAssembly) runs the projector in a browser tab, but
its web build has no OpenGL/Direct3D, so Shockwave 3D falls back to its software renderer
on an emulated CPU: the arena orbit benchmark measured 1.3 fps at the arena's size
(3-4 fps at 320x240), against roughly 30 fps needed. So dirplayer stays the player, and
the real player is the reference it is compared against.

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

## First findings (robot list, 2026-10-23)

- The robot name in the list is yellow in the real player, white in dirplayer.
- Verdana text: a Chrome without Verdana falls back to a serif font; the real
  game (on any Windows) used Verdana. Line breaks and bold runs differ as a result.
