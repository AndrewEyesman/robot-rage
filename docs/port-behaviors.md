# Port behaviours

Everything the port does that has been checked to work, one line each, with how it's
checked. A change must not lose any of these. `node port/tools/regress.mjs` runs every
automated check (marked with its check name); the rest are checked by hand or by a
tool that needs the reference player, until they're automated.

Add a line whenever something is verified to work, and an automated check to
`port/tools/regress.mjs` when one is practical. Problems and differences go in
`docs/port-issues.md`.

## Foundation

| Behaviour | Check |
| --- | --- |
| The whole project type-checks | `typecheck` |
| Lingo values behave as in Adobe's Director 10.1 (string(), value(), comparisons, chunks, random...): 637 assertions measured against Adobe's player | `lingo-unit` |
| The Multiuser Xtra registers on the IRC lobby and passes SMUS messages of every Lingo value type through the relay | `multiuser` |
| The translated arena world and robots render like the verified demo (pixel-identical within tolerance, 3 views) | `check3d` |
| The runtime's rules (score sync, frame cycle, go(), movie switching, timeouts, dispatch, mouse and keyboard routing, drawing order, inks, geometry, text layout, image ops, net): 118 unit tests in real Chrome, each naming where its rule comes from | `runtime-unit` |
| Text and fields lay out and draw like Adobe's player (18 cases, layout exact, pixels exact for aliased text) | `port/tools/text-compare.mjs` (needs the reference player) |

## Loader and login (login013_)

| Behaviour | Check |
| --- | --- |
| The loader reads main.ini and jumps to the login movie | `loader-to-login` |
| With no saved email the create-account tab opens; the screen matches Adobe's | `loader-to-login` (screenshot) |
| LOG IN tab switches; the password field shows stars while the real password is kept hidden | `login-robot-list` |
| Logging in loads the member's robots into the list ("Crusher" in yellow Impact, as in Adobe) | `login-robot-list` |
| No caret is left blinking in a label after the fields go (the focus goes with its sprite) | `login-robot-list`, `runtime-unit` |
| Clicking a robot selects it with the highlight bar | `login-robot-list` (screenshot) |
| Settings tab opens; CHAT toggles and is saved | `login-robot-list` |
| USE ROBOT goes to the garage | `garage-preview` |

## Garage (factory0604)

| Behaviour | Check |
| --- | --- |
| The workshop shows the robot's parts, bars and the 3D preview as in Adobe's player | `garage-preview` (screenshot) |
| Dragging in the preview grabs the robot (it spins with the mouse) | `garage-preview` |
| The "- Zoom +" knob is drawn above its slider and can be dragged | `garage-preview` |
| Paintshop: the paint map uses the map palette; the palette picks a colour; the bucket fills; painting marks the robot for saving; the grid shows the chassis outline; z undoes | `garage-paintshop` |
| Buy parts: purchase box hidden on entry; Chassis category shows the parts with a wireframe 3D preview; BUY NOW without credits shows the "not enough credits" box; Super Weapons page opens | `garage-buy` |
| Remove puts a part in the inventory; the sell room offers it with its sell box; Use this part installs it back | `garage-parts-sell` |
| STATS and HIGHSCORE tabs (clicks through their labels); the TRAINING door goes to the arena | `garage-tabs-doors` |
| Selling and buying back really saves the robot (setrobot); the GARAGE, LOBBY and QUIT doors reach their movies | by hand |

## Arena (arena104)

| Behaviour | Check |
| --- | --- |
| Driving is the original's, tick for tick (229 ticks identical to dirplayer running the original scripts, incl. a wall hit) | `physics-trace` |
| Training: the robot is ready to drive and moves forward with the up arrow | `training` |
| No ambient wind in the arena (the maintainer's request; `?ambient=1` restores it) | `training` |
| A two-tab match starts, and your own keys act within 5 ms (the original's 300 ms ping bug fixed; `?quirks=ping` restores it) | `match-input-delay` |
| Match flow: countdown, mirrored driving, chat, losing a round and playing again with the score kept, draw, surrender, walkover on disconnect or silence, declining revenge, ranked score saved | `port/tools/arena-match.mjs` steps (by hand) |
| Widescreen (L) and smooth 60 fps drawing, both switchable | by hand |

## Lobby (lobby060_)

| Behaviour | Check |
| --- | --- |
| The lobby logs in to IRC and shows the country list | `lobby-entry` |
| Two players see each other in a room, open each other's card (with 3D robot), challenge, decline or accept; both reach the arena with the P2P connection open | by hand (two `lobby-dev.html` tabs) |
