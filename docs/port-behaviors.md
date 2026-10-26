# Port behaviours

Everything the port does that has been checked to work, one line each, with how it's
checked. A change must not lose any of these. `node port/tools/regress.mjs` runs the
automated checks (marked with their check names; `--fast` skips the slow ones, `--full`
adds weapon-trace and robots-trace); the rest are checked by hand or by a tool that needs the reference
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
| The server counts a ranked round only when both players' reports agree, for a match the host started (single, disagreeing or match-less reports count nothing), except a walkover claim against a player whose session-checked match connection closed on its own (a leave without a session, the claimant leaving first, or a disputed claim still count nothing); such a connection can't be taken over by another account; with `RANKED_PER_PAIR_PER_DAY` (off by default; 2 in the test) two accounts get that many ranked matches a day, then unranked; saves are checked against the robot's ledger: legal buying, selling, installing and Super Packs pass, inflated money is cut to the legal amount, unpaid or misinstalled parts are refused, reselling a pack can't mint credits, prizes come only from confirmed results, the grant tool works offline and online | `npm run test:server` |
| The server's lobby takes a nick whose IRC password is its robot's owner's session and refuses one with another member's session; without `IRC_REQUIRE_SESSION` an empty password or "nopwd" is taken, with it refused; paint map saves take the owner's session, refuse another's, and without a session are taken only from the owner's address, never with `MAP_REQUIRE_SESSION`; main.asp forms and replies are Latin-1 | `npm run test:server` |
| The translated arena world and robots render like the verified demo (pixel-identical within tolerance, 3 views) | `check3d` |
| The player runs at most one frame cycle per draw: a slow frame delays the movie instead of skipping ahead (no jumps in slide-ins) | `port/tools/motion-trace.mjs` (by hand) |
| The player keeps running frame cycles while the tab is hidden (a worker's timer; not drawing) | `match-hidden-tab` |
| The runtime's rules (score sync, frame cycle, go(), movie switching, timeouts, dispatch, mouse and keyboard routing, drawing order, inks, geometry, text layout, image ops, net): 118 unit tests in real Chrome, each naming where its rule comes from | `runtime-unit` |
| Text and fields lay out and draw like Adobe's player (18 cases, layout exact, pixels exact for aliased text) | `port/tools/text-compare.mjs` (needs the reference player) |
| Typing on a touch screen: a tap on a field (or a tap whose script focuses one, the robot list's NEW) opens the on-screen keyboard through a hidden input (an email keyboard for the email box, a password one for passwords); inserted text, key presses (once each), Android's keyless input (keydown 229, composed words, Backspace) and Enter reach the fields' scripts as typed keys; the keyboard closes when the field goes or a tap lands elsewhere; the stage moves up while the keyboard would cover the field. The mouse and a physical keyboard never make the input | `touch-text`, `login-field-delete` |

## Loader and login (login013_)

| Behaviour | Check |
| --- | --- |
| The loader reads main.ini and jumps to the login movie | `loader-to-login` |
| With no saved email the create-account tab opens; the screen matches Adobe's | `loader-to-login` (screenshot) |
| LOG IN tab switches; the password field shows stars while the real password is kept hidden | `login-robot-list` |
| Logging in loads the member's robots into the list ("Crusher" in yellow Impact, as in Adobe) | `login-robot-list` |
| An email address wider than its box scrolls and still logs in whole (the original sent it without its first letters; `?quirks=longemail`) | `login-long-email` |
| Backspace in the login's fields: the password field deletes star after star, and the email box deletes the selection Tab makes (`?quirks=scrollselect` for the email box's original) | `login-field-delete` |
| The remembered email opens the LOG IN tab; Backspace deletes one character of it, typing adds to it, and logging in with it untouched works (the original's first key replaced it; `?quirks=scrolltext`) | `login-remembered-email` |
| A login is kept in the browser: a reload goes straight to the robot list; QUIT forgets it; a dead session is forgotten and the login screen stays (`?quirks=keeplogin` keeps nothing) | `login-keep` |
| The player's Settings (game.html): a "Settings" link beside Privacy in the black bar (none with no bar, none in the arena) opens a dialog of the switches that change only this browser's game (widescreen, smooth drawing, the flames' look, the wind, Training's restart, staying logged in, touch controls, and the direct connection, whose off keeps matches on the relay as `?p2p=relay` does); a choice applies at once (touch controls from the next load) and is kept in the browser (`rr-settings`), no key reaches the game while it's open, Escape closes it and gives the keyboard back, an address flag (`?layout=`, `?quirks=`, `?ambient=`, `?touch=`...) still decides for its page and shows as set there, L in the arena keeps the layout as the setting, and Reset to defaults puts every one back | `settings` |
| On a touch device (`?touch=1`) the bars hold only a small dim gear for Settings (no credit, Privacy or text); the dialog's foot then has Privacy (a panel over the game, not a new page) and the Raketspel / Miniclip credit; the back gesture closes the Privacy panel, then Settings, and never leaves the game while either is open; a desktop session keeps the text links and has no foot | manual (phone screenshots) |
| No caret is left blinking in a label after the fields go (the focus goes with its sprite) | `login-robot-list`, `runtime-unit` |
| Clicking a robot selects it with the highlight bar | `login-robot-list` (screenshot) |
| Settings tab opens; CHAT toggles and is saved | `login-robot-list` |
| Screen entries: the door halves (and the arena's control panel) slide all the way to their places and arrive together, as the original's bytecode does (docs/port-issues.md #47); the lobby's bottom buttons are hidden until they slide in with the doors (the original showed them for a frame and never slid them; `?quirks=doorbuttons`, #85) | `door-slides` |
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
| Two robots meeting are the original's, tick for tick (dirplayer running the original scripts, both robots real, in Training): head-on and side rams, glancing blows, a long shove (6 bumps, the push apart on the fifth), the spike, drill, saw and roller driven in (bumps and damage), spears (damage), the grenade's and rockets' recoil and blast on the shooter, the hammer, minigun, EMP and claw going off, mines, nails, glue and oil driven over (thrown up, slipping), flames, laser and discs; 12 scenarios. Not covered: what only a match does (the claw catching, the EMP stunning, grenades and rockets hitting the other robot: gGamePlace), and the opponent's network updates | `robots-trace` (`--full`) |
| The bump (`hit`) gives what Adobe's player gives for the same two robots, the fifth bump's push apart included (real robot behaviors on two sprites in the reference player, four cases) | refeval (by hand, docs/port-issues.md #80) |
| Training: the robot is ready to drive and moves forward with the up arrow | `training` |
| No ambient wind in the arena (the maintainer's request; `?ambient=1` restores it) | `training` |
| A two-tab match starts, and your own keys act within 5 ms (the original's 300 ms ping bug fixed; `?quirks=ping` restores it) | `match-input-delay` |
| Clicks anywhere on the SURRENDER label reach the button (a Background Transparent text label with no mouse handlers lets clicks through, as in Adobe) | `match-input-delay` |
| Two-tab matches always get past the start sync (the original could hang there; `?quirks=sync` restores it) | `match-start-sync` (4 matches) |
| A two-tab match plays over the direct DataChannel; with `?p2p=relay`, or with ICE broken (`?p2p=fail`), it starts and plays over the relay | `match-transport` |
| A hidden tab keeps playing: 25 s hidden, it runs its frames and both players stay in the match; a tab switch or stall never strikes the robot for speed hacking (`?quirks=speedgear` restores the strike) | `match-hidden-tab` |
| Every weapon and its shots move, hit and spend ammo, energy and armour tick for tick as in the original (dirplayer, with the port splitting mirrors as dirplayer does: `?s3d=dirplayer`), 11 Training scenarios covering all 27 weapons; the spear gun fires all 5 spears | `weapon-trace` (`--full`) |
| Mirrored parts (every weapon, wheel and claw half: the files' Scene Root mirrors z) turn, move and aim as in Adobe's player: rotate, translate, pointAt, transform.rotation and .scale split the matrix with the mirror on z (docs/port-issues.md #71) | `runtime-unit` ("3d transforms") |
| The power axe at the front swings forward | `axe-swings-forward-front` |
| The claw at the front reaches out ahead of the chassis while it opens and closes | `claw-reaches-forward` |
| The laser cannon's beam goes forward from the cannon | `laser-fires-forward` |
| The flame thrower's flames stream ahead of the robot (the original mirrored them in z; `?quirks=flame`) | `flame-streams-forward` |
| A spear gun fires head first out of its muzzle: forward from the front, backward from the back | `spear-head-first-front`, `spear-head-first-back`; `weapon-trace spear_front_five` (`--full`) |
| Training starts again 3 s after the robot falls into the pit, off the roof or loses its armour (the original left it lying there; `?quirks=pit` restores that) | `training-respawn` |
| A ranked two-tab match records a round once both players report it (the loser reports too; `?quirks=results` restores the winner-only report), the same for both robots | `match-ranked` |
| A page frozen in a phone's background for 25 s mid-match (blocked, as headless Chrome can't freeze one): the relay closes its connection after 20 s silent, the opponent takes the round as a walkover, and the page, back, gives the round up with a chat line saying why, no speed-hack strike; the server counts it once, for both (the original claimed it too and the round counted for nobody; `?quirks=away`) | `match-background` |
| A page whose match connections die while it's frozen 6 s finds them gone on waking and gives the round up instead of claiming it too, which the server counts once, for both (`?quirks=away`) | `match-background` |
| A page that stops mid-match (frozen) is taken as leaving: the relay closes a match connection's socket that said it keeps alive and then went silent (`RELAY_SILENT_SEC`, 20 s), and the opponent's walkover claim counts; sockets that keep alive, never said they would, or listen alone (the lobby), stay | `npm run test:server` |
| Match flow: countdown, mirrored driving, chat, losing a round and playing again with the score kept, draw, surrender, walkover on disconnect or silence, declining revenge, ranked score saved | `port/tools/arena-match.mjs` steps (by hand) |
| Widescreen (L) and smooth 60 fps drawing, both switchable | by hand |
| Touch controls on a phone (844x390, emulated): up while Training is played, clear of the control panel, a button per weapon with a key (Z, X, C, showing only the letter, the panel's weapon name as its aria-label; none for a passive part), the stick and a fire button held at once drive diagonally and fire, every key is let go after, the camera button steps the view; with a mouse and keyboard there's no touch mode and no controls (`?touch=1`, `?touch=0` force it) | `training-touch`, `training` |
| On a phone or tablet (emulated touch), taps alone go from login through the garage, Training, the lobby and a challenge to a match; the touch controls drive in the match and are up only while it's played (from the countdown), never in the menus, lobby or garage; either way up plays (held upright, the 4:3 stage fills the width and the controls sit under it; no prompt to turn the phone), a full screen button sits in the top left corner while the page could go full screen and isn't (only the button goes full screen, never a tap on the game) (the `training-touch` check covers it), an upright tablet plays the 4:3 stage with the controls under it | by hand |
| On a touch screen a button's click is heard to its end even when its release stops every sound channel (the TRAINING door opening the doors), as it is with a mouse button held for a moment | `garage-touch-click` |
| The production build serves the web app manifest (fullscreen, either orientation) and its icon | `prod-build` |

## Lobby (lobby060_)

| Behaviour | Check |
| --- | --- |
| The lobby logs in to IRC and shows the country list | `lobby-entry` |
| The lobby registers on IRC with its login session as the password, on a server that requires it (`IRC_REQUIRE_SESSION=1`, as hosted); with the original's empty password (`?quirks=ircauth`) that server refuses the nick | `lobby-entry` |
| An error reply to the lobby's getrobotall for its own robot leaves the lobby waiting with its stats unchanged, no script error (the original failed every frame; `?quirks=robotreply`) | `lobby-entry` |
| Two players see each other in a room, open each other's card (with 3D robot), challenge, decline or accept; both reach the arena with the P2P connection open | by hand (two `lobby-dev.html` tabs) |
| A never-saved robot's card opens in the lobby as the empty robot, with its 3D robot and CHALLENGE, and later cards still open; a match against it plays (the original failed and stuck the lobby; `?quirks=emptyrobot`) | `lobby-fixes` |
| Clicking a robot in the lobby pings it once round (four pings, four pongs) even when its connection opens late, with no script error (the original pinged twice over and failed on the leftover pong; `?quirks=lobbyping`) | `lobby-fixes` |
| Clicking an incoming challenge opens the challenger's card, and CHALLENGE there accepts it (the original did nothing; `?quirks=challengecard`) | `lobby-fixes` |
| When a challenge's first P2P connection fails, the players swap server and client and the match starts (the original went back to the lobby; `?quirks=p2pswap`) | `lobby-fixes` |
| A lobby whose IRC connection and match listener die (a phone's background) enters again, back into its room, connected and listed, saying the connection was lost (the original stayed on screen dead; `?quirks=lobbylost` keeps that) | `lobby-connection-lost` |
| QUIT in the lobby saves and goes to the login screen; GARAGE goes to the robot list | by hand |
