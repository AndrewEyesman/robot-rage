# Port behaviours

Everything the port does that has been checked to work, one line each, with how it's
checked. A change must not lose any of these. `node port/tools/regress.mjs` runs the
automated checks (marked with their check names; `--fast` skips the slow ones, `--full`
adds weapon-trace); the rest are checked by hand or by a tool that needs the reference
player, until they're automated.

Add a line whenever something is verified to work, and an automated check to
`port/tools/regress.mjs` when one is practical. Problems and differences go in
`docs/port-issues.md`.

## Foundation

| Behaviour | Check |
| --- | --- |
| The whole project type-checks | `typecheck` |
| Lingo values behave as in Adobe's Director 10.1 (string(), value(), comparisons, chunks, random...): 637 assertions measured against Adobe's player | `lingo-unit` |
| The Multiuser Xtra registers on the IRC lobby (on the regression fixture as a seed robot with its session as PASS, which the fixture requires) and passes SMUS messages of every Lingo value type through the relay | `multiuser` |
| P2P connections switch to a direct WebRTC DataChannel between two tabs; streams in both directions lose and reorder nothing through the switch and through a fall back mid-stream when the channel dies; `?p2p=relay` stays on the relay, a relay-only host declines, broken ICE (`?p2p=fail`) falls back after 5 s; the relay passes signalling only between clients that said hello and relays old clients as before | `multiuser-p2p`, `npm run test:server` |
| The server counts a ranked round only when both players' reports agree, for a match the host started (single, disagreeing or match-less reports count nothing); saves are checked against the robot's ledger: legal buying, selling, installing and Super Packs pass, inflated money is cut to the legal amount, unpaid or misinstalled parts are refused, reselling a pack can't mint credits, prizes come only from confirmed results, the grant tool works offline and online | `npm run test:server` |
| The server's lobby takes a nick whose IRC password is its robot's owner's session and refuses one with another member's session; without `IRC_REQUIRE_SESSION` an empty password or "nopwd" is taken, with it refused; paint map saves take the owner's session, refuse another's, and without a session are taken only from the owner's address, never with `MAP_REQUIRE_SESSION`; main.asp forms and replies are Latin-1 | `npm run test:server` |
| The translated arena world and robots render like the verified demo (pixel-identical within tolerance, 3 views) | `check3d` |
| The player runs at most one frame cycle per draw: a slow frame delays the movie instead of skipping ahead (no jumps in slide-ins) | `port/tools/motion-trace.mjs` (by hand) |
| The player keeps running frame cycles while the tab is hidden (a worker's timer; not drawing) | `match-hidden-tab` |
| The runtime's rules (score sync, frame cycle, go(), movie switching, timeouts, dispatch, mouse and keyboard routing, drawing order, inks, geometry, text layout, image ops, net): 118 unit tests in real Chrome, each naming where its rule comes from | `runtime-unit` |
| Text and fields lay out and draw like Adobe's player (18 cases, layout exact, pixels exact for aliased text) | `port/tools/text-compare.mjs` (needs the reference player) |

## Loader and login (login013_)

| Behaviour | Check |
| --- | --- |
| The loader reads main.ini and jumps to the login movie | `loader-to-login` |
| With no saved email the create-account tab opens; the screen matches Adobe's | `loader-to-login` (screenshot) |
| LOG IN tab switches; the password field shows stars while the real password is kept hidden | `login-robot-list` |
| Logging in loads the member's robots into the list ("Crusher" in yellow Impact, as in Adobe) | `login-robot-list` |
| An email address wider than its box scrolls and still logs in whole (the original sent it without its first letters; `?quirks=longemail`) | `login-long-email` |
| No caret is left blinking in a label after the fields go (the focus goes with its sprite) | `login-robot-list`, `runtime-unit` |
| Clicking a robot selects it with the highlight bar | `login-robot-list` (screenshot) |
| Settings tab opens; CHAT toggles and is saved | `login-robot-list` |
| Screen entries: the door halves (and the arena's control panel) slide all the way to their places and arrive together (the original snapped halfway; `?quirks=doors`) | `door-slides` |
| USE ROBOT goes to the garage | `garage-preview` |

## Garage (factory0604)

| Behaviour | Check |
| --- | --- |
| The workshop shows the robot's parts, bars and the 3D preview as in Adobe's player | `garage-preview` (screenshot) |
| Dragging in the preview grabs the robot (it spins with the mouse) | `garage-preview` |
| The "- Zoom +" knob is drawn above its slider and can be dragged | `garage-preview` |
| Paintshop: the grid button toggles with no chassis on the robot (the original failed; `?quirks=grid`) | `garage-grid-nochassis` |
| Paintshop: the paint map uses the map palette; the palette picks a colour; the bucket fills; painting marks the robot for saving; the grid shows the chassis outline; z undoes | `garage-paintshop` |
| Buy parts: purchase box hidden on entry; Chassis category shows the parts with a wireframe 3D preview; BUY NOW without credits shows the "not enough credits" box; Super Weapons page opens | `garage-buy` |
| Super weapons sell for credits: a weapon's page buys it for 320, a pack's page buys its 7 parts for 2100 (`?quirks=superpack`: the original's payment pages) | `garage-super-credits` |
| Credits granted by the server's admin grant arrive as the robot loads; the garage's purchases are saved and accepted by the server; money the server didn't keep (an unconfirmed prize) is taken back by the client, in step with MrDoktor (`?quirks=economy`: the original client) | `garage-super-credits` |
| Remove puts a part in the inventory; the sell room offers it with its sell box; Use this part installs it back | `garage-parts-sell` |
| STATS and HIGHSCORE tabs (clicks through their labels); the TRAINING door goes to the arena | `garage-tabs-doors` |
| The garage's paint map save (the TRAINING door, after the paintshop) carries the session, a server requiring one (`MAP_REQUIRE_SESSION=1`) keeps it, and it comes back byte for byte (Latin-1, bytes above 127 too); without the session (`?quirks=mapsession`) that server refuses it | `garage-map-session` |
| A paint job comes back pixel for pixel after a reload, every Paintshop colour included (forms and replies go as Windows-1252 bytes) | `garage-map-reload` |
| Selling and buying back really saves the robot (setrobot); the GARAGE, LOBBY and QUIT doors reach their movies | by hand |

## Arena (arena104)

| Behaviour | Check |
| --- | --- |
| Driving is the original's, tick for tick (229 ticks identical to dirplayer running the original scripts, incl. a wall hit) | `physics-trace` |
| Training: the robot is ready to drive and moves forward with the up arrow | `training` |
| No ambient wind in the arena (the maintainer's request; `?ambient=1` restores it) | `training` |
| A two-tab match starts, and your own keys act within 5 ms (the original's 300 ms ping bug fixed; `?quirks=ping` restores it) | `match-input-delay` |
| Clicks anywhere on the SURRENDER label reach the button (a Background Transparent text label with no mouse handlers lets clicks through, as in Adobe) | `match-input-delay` |
| Two-tab matches always get past the start sync (the original could hang there; `?quirks=sync` restores it) | `match-start-sync` (4 matches) |
| A two-tab match plays over the direct DataChannel; with `?p2p=relay`, or with ICE broken (`?p2p=fail`), it starts and plays over the relay | `match-transport` |
| A hidden tab keeps playing: 25 s hidden, it runs its frames and both players stay in the match; a tab switch or stall never strikes the robot for speed hacking (`?quirks=speedgear` restores the strike) | `match-hidden-tab` |
| Every weapon and its shots move, hit and spend ammo, energy and armour tick for tick as in the original (dirplayer), 11 Training scenarios covering all 27 weapons; the spear gun fires all 5 spears | `weapon-trace` (`--full`) |
| The power axe at the front or back swings forward (the original swung a front axe backwards over its own robot; `?quirks=axe`) | `axe-swings-forward-front`, `axe-swings-forward-back` |
| A spear gun at the front or back fires forward, head first (the original flew spears tail first, and a front gun's out of the robot's back; `?quirks=spear`) | `spear-head-first-front`, `spear-head-first-back`; `weapon-trace spear_front_five` (`--full`) |
| Training starts again 3 s after the robot falls into the pit, off the roof or loses its armour (the original left it lying there; `?quirks=pit` restores that) | `training-respawn` |
| A ranked two-tab match records a round once both players report it (the loser reports too; `?quirks=results` restores the winner-only report), the same for both robots | `match-ranked` |
| Match flow: countdown, mirrored driving, chat, losing a round and playing again with the score kept, draw, surrender, walkover on disconnect or silence, declining revenge, ranked score saved | `port/tools/arena-match.mjs` steps (by hand) |
| Widescreen (L) and smooth 60 fps drawing, both switchable | by hand |

## Lobby (lobby060_)

| Behaviour | Check |
| --- | --- |
| The lobby logs in to IRC and shows the country list | `lobby-entry` |
| The lobby registers on IRC with its login session as the password, on a server that requires it (`IRC_REQUIRE_SESSION=1`, as hosted); with the original's empty password (`?quirks=ircauth`) that server refuses the nick | `lobby-entry` |
| An error reply to the lobby's getrobotall for its own robot leaves the lobby waiting with its stats unchanged, no script error (the original failed every frame; `?quirks=robotreply`) | `lobby-entry` |
| Two players see each other in a room, open each other's card (with 3D robot), challenge, decline or accept; both reach the arena with the P2P connection open | by hand (two `lobby-dev.html` tabs) |
| A never-saved robot's card opens in the lobby as the empty robot, with its 3D robot and CHALLENGE, and later cards still open; a match against it plays (the original failed and stuck the lobby; `?quirks=emptyrobot`) | `lobby-fixes` |
| Clicking an incoming challenge opens the challenger's card, and CHALLENGE there accepts it (the original did nothing; `?quirks=challengecard`) | `lobby-fixes` |
| When a challenge's first P2P connection fails, the players swap server and client and the match starts (the original went back to the lobby; `?quirks=p2pswap`) | `lobby-fixes` |
| QUIT in the lobby saves and goes to the login screen; GARAGE goes to the robot list | by hand |
