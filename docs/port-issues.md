# Port issues

Issues found while porting the whole game (`port/`), kept as we go. Each says what
happens, why, and what's decided. "Original" means the game's own scripts behave this
way (Adobe's player does the same); "port" means the port differs from the original;
"tooling" is about our own setup.

Status: **open** (needs a decision or work), **kept** (faithful to the original, left
as is on purpose), **fixed**.

## Needs the maintainer's decision

These are faithful to the original but hurt play in a browser. Fixing them changes the
game's behaviour, so they wait for the maintainer (and would go in as enhancements, separate
from the translated scripts).

| # | Issue | Where | Status |
| --- | --- | --- | --- |
| 1 | **Match start can hang.** Both players' arenas alternate between two states at 20 fps and answer the host's "ready" in only one of them. Two tabs on one machine tick in lockstep and can miss each other forever (about 2 runs in 7 in testing). Between real machines it should come unstuck eventually, possibly after a long wait. `port/tools/arena-match.mjs` says to rerun when it happens. | arena104 match start sync | open |
| 2 | **A background tab is flagged as a speed hacker.** The arena's `checkTempo` sees the 20 s gap while a tab was hidden, marks the robot `#speedgear` and busy-waits each frame. Browser players switching tabs will hit this. | arena104 robot behavior | open |
| 22 | **dirplayer's lobby is broken on 8090.** The dirplayer build installed on Oct 23 (PR #244 base) replaces the page's socket resolver (`window.dirplayerResolveSocketUrl`) with its own, driven by an empty socketProxy config, so IRC and match sockets resolve to "" and the lobby can't connect. Fix: restore the page's resolver after the polyfill loads (a 6-line change to `public/index.html`). Fixed 2026-10-24 with the maintainer's OK; verified on 8090 (the resolver returns `ws://127.0.0.1:8090/ws/irc?...`). | public/index.html (dirplayer) | fixed |
| 36 | **Every key took 300 ms in matches.** The match delays your own keys by half the measured round trip, so both robots move at the same moment on both screens. The original stamps the ping in seconds since midnight but times the pong in milliseconds, so the measured delay always hit its 300 ms cap. The maintainer noticed the lag between two tabs. Fixed as an enhancement (`movies/arena104/enhancements.ts`): the port times the ping in milliseconds; between two tabs the delay is now 0.2-0.4 ms. `?quirks=ping` restores the original. | arena104 main framescript `ping` | fixed (enhancement) |
| 37 | **The wind in matches.** Matches loop the "ambient sound" member (arena104 member 106) on channel 1 at volume 20 from the moment play starts; it's in the original. The maintainer asked for it gone: muted as an enhancement (`mutedSounds` in director/audio.ts, set by enhancements.ts); `?ambient=1` brings it back. | arena104 main framescript `Activate` | fixed (enhancement) |
| 39 | **The garage runs at 60 frames a second.** Its score tempo is 60; Adobe's player under Wine managed about 25 (software 3D), and a 2004 PC probably less than 60. The port runs the full 60, so the preview robot spins and the highscore list scrolls faster than in the reference. | factory0604 tempo | open |
| 3 | **Surrender only works on the button's edge.** The label sprite above it takes the click. Adobe's player does the same. | arena104 buttons | kept |

## Original game quirks kept

| # | Issue | Where |
| --- | --- | --- |
| 31 | Lobby dead code and script errors, translated as written: `GetRobotPing` returns 50 before its lookup and `SetRobotPing` empties the ping table each time; assignments to undeclared locals do nothing (`gOpponentstate`, `getOpponentRobot = #init`, `state = #init`, all of behavior 2); `changeroom` uses SMUSmuInstance, never set; `addChatWindow`/`addChatWindowResult` don't exist; IncommingChallenge's mouseUp sends a robot id where opponent data is expected; `sendSprite(#addtofriends)` has no sprite number; init room sprite calls `gRoom.setupSprite`/`hideScrollBar`, which don't exist; `showrobot` puts the whole paint map into map2A; `doordone` is never sent; the room menu goes to labels that don't exist ("rooms2", "insideroom"); scripts 40, 50, 78, 79, 227-229 and 244 aren't in the score. | lobby060_ |
| 40 | Garage quirks translated as written: gridbutton reads ram[1] before checking it (script error with no chassis); the Spara (287) and SMS (175/204) buttons build javascript: payment pages; the buy preview spins a multi-model part about the origin because Lingo's `vector > 0` is always false (checked in Adobe); InstallStorePart shows only the first wheel; behavior 261 hides its sprites even for the UK; the editor's map-2 state stays VOID when the robot has a tower; just entering the Paintshop sets #saveMap; the hiscore's `pState` is a local, not the property; robotwars Spara 253 sends setrobotmap without a session id. | factory0604, robotwars |
| 29 | A robot that was never saved has no data, and the original errors when showing its card in the lobby. | lobby060_ |
| 4 | `gText` and `gDialog` are never created by any script; their few calls (`gText.get("badlogout")`, `gText.associate`, `gDialog.open`) are script errors the original's alertHook swallows. The port ends the handler there too. | login013_ user object, robotwars IRC_OBJECT |
| 5 | `formatPayedTimeLeft` is called but defined nowhere. | login013_ user object |
| 6 | `Buttonscript`'s `new` calls `createButton`, which no script defines. | login013_ Buttonscript |
| 7 | Falling into the pit in Training just stops the robot: the lose handler exits early there. | arena104 |
| 8 | Smaller ones, translated as written: the blob loader scales `sF` instead of `p`; `fuser` adds the ipcode twice (so you're never filtered from your own room list); `removeUser` skips the entry after one it deletes; saving times out from the previous send (`gStartSendTime` is local); the door's close passes 0 instead of the closed position; "B" (getinfo) private messages are ignored; the horizontal-scroll field compares a point with a number (never true in Lingo). | various |

## Port differences (open)

| # | Issue | Where | Status |
| --- | --- | --- | --- |
| 9 | Anti-aliased text (14 px and up) has the right positions but slightly different grey levels (mean error 3-5/255): the browser's rasteriser isn't Director's. | director/fonts.ts | open |
| 10 | Not yet checked against Adobe: push buttons (#button), synthetic bold, decimal tabs, underline position, fixed line space with Arial 16 px and up. | text rendering | open |
| 11 | Chat lines in the arena use the font's normal line spacing (per-line spacing isn't supported). | arena104 chat | open |
| 12 | Adobe stores sprite rotation in hundredths of a degree; the port keeps full precision. | director/sprite.ts | open |
| 13 | 3D features stored but not drawn: wrap texture modes (#wrapPlanar...), particle wind, #gaussian distribution, emitter region and path, camera rootNode other than the world, spot lights (drawn as point lights), modifiers other than meshDeform, non-bitmap #fromCastMember textures, renderFormat/quality. The game's arena scenes don't need them so far. | director/s3d | open |
| 14 | The 3D normals are rebuilt and smoothed (dirplayer can't decode the stored ones), and the arena's inside-out barrel is lit where Adobe leaves it dark. | port/extract, s3d | open |
| 15 | 8-bit bitmaps got the system palette instead of their cast's palette (e.g. robotwars map1A/map1B with "map palette"), so paint maps didn't round-trip. Fixed: bitmaps carry their palette (paletteId/clutCastLib) and indexed images keep indices. | port/extract, director | fixed |
| 16 | The robot list's selected-row highlight (ink 6 Not Reverse, ink 34 Add) is approximated with canvas compositing; ~6000 px differ from Adobe on that screen. | director/render.ts | open |
| 17 | Inks with no canvas equivalent are approximated: Add (34) clamps like Add Pin, Subtract (38/35) and Reverse (2/6) use 'difference', Lighten/Darken (40/41) use screen/multiply. | director/render.ts | open |
| 23 | (Fixed by the garage agent: empty 3D members are now extracted as Director's default empty world.) The lobby's empty 3D world member "robot" (lobby060_ 70, also factory0604 111) has no W3D data, so the extractor writes it as a plain member without the 3D API; a shim gives it Director's default empty world. The proper fix belongs in the extractor and s3d. | lobby060_ shim-empty-world.ts | open |
| 24 | The lobby's CHALLENGE label sprite (23) has a script, so it takes clicks over the middle of the button and nothing happens; the arrow end works. Same pattern as the arena's SURRENDER (#3), where Adobe behaves the same; not yet confirmed for this button. | lobby060_ | open |
| 25 | The lobby door behavior (script 65) sets `sprite.visibility`, which isn't a sprite property, so it's treated as a script error and the bottom buttons never slide. To confirm in Adobe's player. | lobby060_ | open |
| 26 | `ReplaceWord` with one argument returns the text unchanged, assuming Director's offset of an empty string is 0 (otherwise the original loop never ends). Unconfirmed. | lobby060_ | open |
| 27 | The lobby's room menu (227) uses a text member's `.image`, which the runtime doesn't provide; the script isn't in the score, so unused. | lobby060_ | open |
| 32 | The lobby's ChallengeWait and P2P connect frames weren't compared with the original (port against port only). | lobby060_ | open |
| 28 | Not yet exercised in the lobby: the P2P role swap (SMUS_ReverseP2P), the firewall frame, logging off. A port-versus-dirplayer cross test hung on the dirplayer side (see #22). | lobby060_ | open |
| 38 | **Fixed** (garage agent, checked in Adobe): 3D sprites take clicks first and locZ outlives a span change; now guarded by the `garage-preview` check. Originally: **Garage preview: the robot can't be dragged and the zoom bar is hidden** (reported by the maintainer). The frame bitmap over the 3D preview (preview2, sprite 7) takes the clicks because hit-testing now goes by channel, and the zoom knob (sprite 21) is drawn under the rod (sprite 18) because a locz behavior raised the rod's locZ to 118. Adobe's player draws the knob on top of the rod, which suggests it ignores locZ set on score sprites for drawing as it does for clicks; and 3D sprites, drawn on top of everything, should take clicks first. Passed to the garage agent to verify in Adobe and fix. | director/player.ts (spriteAt, render) | open |
| 41 | In the garage's 3D preview, cloneModelFromCastmember leaves 6 extra models without a parent (navHB.4, Pik.1...): dirplayer has 12 models, the port 18. | director/s3d, robotwars s006 | open |
| 42 | Paintshop: thick lines and rect sides are a pixel off against Adobe (752 map pixels differ after the same painting sequence). | director/image.ts | open |
| 43 | The buy room's "Ships with Super Pack 1" box shows only its first line, with glyph errors; the workshop's text is a little narrow (Impact rendering); the 'pris txt' read 750 on the Small Chassi page (not investigated). | factory0604, text | open |
| 44 | Not pinned yet (from the unit tests): when a sprite's handler calls `pass`, dirplayer still forwards sendAllSprites to the frame script, the runtime doesn't; the runtime sends endSprite to sprites before the frame script, dirplayer the reverse; image copyPixels treats ink 40 as Lightest (Director's Lightest is 37; the game only uses 33 and 39 there). | director | open |
| 18 | The login screen's country text shows "SE" (the game server's ip2country answer); Adobe's player can't reach that URL and leaves it empty. Expected, not a bug. | login013_ behavior 72 | kept |

## Fixed along the way

Found by comparing with Adobe's player (or dirplayer), fixed in the runtime:

- `pass` ends the handler (translated as `return pass()`).
- After `go(x)`, `the frame` already reports x; otherwise every `go(label) ... go(the frame)` undid the jump.
- `netTextResult` turns LF / CR LF into CR (measured in Adobe); main.ini parsed wrong without it.
- `symbol()` skips leading whitespace and reads one name (`symbol(LF & "filelist")` is `#filelist`).
- Shape borders are stored one-based (1 = none): the login's newsletter box drew a stray black outline.
- Text members take their box from the score's sprite size; empty text members keep their own default style (the robot list's names in yellow Impact).
- A script error ends only the failing handler, as Director's alertHook does, instead of the whole frame.
- Text layout: per-glyph rounded advances, line height including the line's RETURN, paragraph spacing (dirplayer's parser read the wrong fields), field +1 px lines and clipping, tabs.
- Sprite positions round to the nearest pixel like Adobe (dirplayer truncates; this settles the open question in docs/collision.md).
- Setting a text member's colour stored an rgb() value the renderer couldn't read (the lobby's room list drew black); it stores `#rrggbb` now.
- Garage, measured in Adobe: sprite loc and image coordinates round; locZ survives a span change; a release over another sprite sends mouseUpOutSide to the pressed one and mouseUp to the one under the pointer; Background Transparent text labels with no mouse handlers let clicks through; ink 36 doesn't colourise 8-bit bitmaps; copy-ink text fills with its bgColor; text members' real box size is extracted; new behaviors are created after the endSprites (a frame script's endSprite wiped the buy room's behaviors); `member.image = img` writes into the existing image; image draw/fill follow Adobe's line, outline and brush rules.
- From the unit tests: a script-set property on a sprite without behaviors now lasts its span (the player treats a run of the same member as the span); `sprite.visible` belongs to the channel and outlasts spans; a released puppet takes the score sprite back in full.
- Server: the garage saves the paint map without a session (robot id and name only), which the test server refused with err 18 (the client then logs you out); `setrobotmap` now accepts that (a given session must still own the robot). The 8091 test server needs a restart to pick it up.
- A caret blinked in the robot list's SCRAP ROBOT label (the maintainer): the keyboard focus stayed on the channel after the password field there was replaced by the label. The focus now goes with its sprite (unit test and `login-robot-list` check).
- `rgb("0x...")` parses as hex; `vector * vector` is the dot product.

## Tooling

| # | Issue | Status |
| --- | --- | --- |
| 35 | The 8091 test server's PUBLIC_DIR (`/tmp/rrwork/pub-up`) symlinks `index.html` and `game/` to the repo's `public/`, so editing the test page edits the page 8090 serves. Copy the file before changing it for a test. | open |
| 19 | Parallel reference containers all used host networking and X display `:5`, so two at once drew on the same screen. Fixed: rr-ref keeps :5, other containers get a display derived from their name (or REF_DISPLAY). | fixed |
| 20 | The text extractor's font step (`port/extract/system-fonts.py`) installs Python packages from PyPI into `.cache/fontvenv` on first run, so it needs network once. | kept |
| 33 | dirplayer's page stops responding once it's in a lobby room with a port player, so a port-versus-dirplayer challenge hasn't completed. Cause not investigated. | open |
| 34 | In playwright, only the front tab reliably gets clicks: bring a page to the front before clicking it in multi-tab tests. | kept |
| 45 | regress.mjs used fixed ports for its own servers, so concurrent runs killed each other's; it now picks free ports. Its match check returned NaN instead of retrying when the start sync hung; fixed. | fixed |
| 30 | Test accounts created on 8091 for two-player testing: rival@home.lan / rage2005 (robot "Rival", id 1005) and lobbytest@home.lan / rage2005 ("Lobbyist", id 1007). Agents testing as tester@home.lan at once collide on the IRC nick ("Nickname is already in use"). | kept |
| 21 | The paragraph-spacing fix is in dirplayer's parser (`vendor/dirplayer-rs`, a separate repo); `patches/dirplayer.patch` must be regenerated from it before committing or the fix is lost on the next rebuild. | open |
