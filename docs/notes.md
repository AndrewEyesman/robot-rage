# Notes

Findings from getting the original client running. Everything here describes behavior
observed on the wire or in the client's runtime; no game code is included.

## Client files

The robotrage.pro zip contains the original v55/v60 movies plus small fan-made wrapper
movies (`wrapper_robotragerearmed.dcr`, `login013.dcr`, `lobby060.dcr`, `netLingo.dcr`,
`ac.dcr`) that load the originals (`login013_.dcr`, `lobby060_.dcr`, ...) and point them
at the fan servers. In browser ("Plugin") mode the wrapper reads `main.ini` over HTTP,
which is how this server injects its own addresses.

The fan login wrapper builds two scripts at runtime from embedded source text (a relay
fallback wrapper around the Multiuser Xtra, plus helpers). The emulator cannot compile
Lingo, so in the browser the game uses the Multiuser Xtra directly, which is what the
relay below is designed around.

## HTTP backend (`main.asp`)

Form POSTs with an `action` field; replies are Lingo property-list literals parsed with
`value()`, e.g. `[#err: 0, #sid: "..."]`. Actions used: `createmember`, `loginmember`,
`logoutmember`, `getmyrobots`, `createrobot`, `deleterobot`, `getrobot`, `getrobotall`,
`getrobotmap`, `setrobot`, `setrobotmap`, `setrobotmapNew`, `setrobotscore`, `setrwgames`,
`gethiscore`, `PING`, `PingPayMember`, `reportabuse`.

- Field names are not consistently cased (`sessionid` / `sessionID`, `uniquecode` /
  `uniqueCode`), so the server lowercases them.

- The garage list places each robot in row `entry.count`, so entries carry an explicit
  `#count`.
- `getrobot` replies include a checksum the client verifies before loading the robot:
  MD5 of the uppercased, space-stripped concatenation of the robot's property list,
  friends list and stats, plus a fixed salt (see `robotChecksum` in `server/api.mjs`).
  Robot data is stored exactly as the client sends it so the checksum stays stable.
  The client re-serializes the parsed lists with `string()` before hashing, so the
  stored text has to be in Lingo's own `string()` form (it is, since the client sends it).
- `getrobotmap` is plain text (TAB-separated), not a property list.
- `getrobotall` needs no session: the lobby fetches any robot by id to show the
  opponent's card, 3D model and paint map (`#map`, TAB-separated like `getrobotmap`).
  Cards show `#UserLibName` as the owner; the server sends the email's local part.

## Lobby (IRC)

The client speaks raw IRC through the Multiuser Xtra in `#text` mode (`connectToNetServer`
form B, `ircip1`/`ircports` from `main.ini`). Lines it sends end in LF CR.

- Registration: `PASS `, `NICK _R<rank><name><ipcode>`, `USER Shockplay 0 * <name>`.
  `<ipcode>` is the last four characters of every nick and drives everything below.
- It reads its own address from the last `@host` of `001` (unused afterwards), the online
  count from word 7 of `265` (also sent after `LUSERS`), and shows the lobby after `376`.
- Rooms are `#rw<n><room>` (`#rw1e`, `#rw11`...). The room list is polled with
  `LIST #r*` (a mask) and read from `322` (word 4 minus `#`, word 5 count) up to `323`.
  `353` users start at word 6, the room at word 5. `JOIN`/`PART`/`QUIT` update the list.
- Everything between players is `PRIVMSG <nick> :<type> <subject> <payload>`:
  `SMUS_SendIP` (asks for address and robot id), `SMUS_GetIP 0 <ip>_<hex robot id>`,
  `Challenge 0 [#id:, #server:, #ip:, #rank:]`, `SMUS_AcceptChallenge`,
  `SMUS_DeclineChallenge`, `SMUS_AddChallenge_Busy`, `SMUS_ConnectToMe`,
  `SMUS_ReverseP2P`, `SMUS_AbortP2P`. Chat-style room messages (`G`) are not sent.
- The address the game shares is `getMyIP()`, built from `getNetAddressCookie()`, which
  the emulator answers with "" (so the game's IP is `0`). The server substitutes the
  sender's relay address in `SMUS_GetIP` and `Challenge`.
- `<ipcode>` is `0000` when a cookie looks public, else a checksum of `sw1` ("behind a
  router"). The lobby only lists players with the same ipcode (or `0000`), and when both
  are `0000` neither side becomes host. So every tab gets the same `sw1`: everyone is
  "behind one router", sees everyone, and the challenged player hosts.
- The emulator never closes the socket of a dropped Multiuser instance, so after a match
  the old IRC connection still holds the nick. A new registration from the same tab
  address takes the nick over.

## Matches (port 1626)

Originally the challenged player listened (`waitForNetConnection`) and the opponent
connected straight to their IP. Here both sides open WebSockets to `server/relay.mjs`:
the patched emulator turns `waitForNetConnection` into a "listen" socket keyed by the
tab's address, and `connectToNetServer(ip, 1626)` into a "connect" socket. The relay
reads only SMUS envelopes (sender, recipients, subject) and forwards frames.

- Every player listens from lobby entry on (`userID` = robot name). Clicking a robot
  connects to it and pings (`P2P_Ping`/`P2P_Pong` x4, `P2P_Ping_Exit`, then the host
  `breakConnection`s). A challenge connects again and sends `P2P_Connected`; the host
  answers `P2P_ConnectedOK`, then both load the arena. The host posts `setrwgames`.
- If the client cannot connect within 5 s the roles swap once (`SMUS_ReverseP2P`).
- Arena messages use `sendNetMessage([#recipients:, #subject:, #content:, #udp: 0])`,
  addressed to the opponent's robot name; the host sends chat to
  `getPeerConnectionList()`. Start sync: the host repeats `ready`, the client answers
  `ready ok`. Lag is estimated from message time stamps, so the relay stamps them.
- Any message with a non-zero `errorCode` during a round makes the arena `PING`
  `main.asp`; if that works the player wins by walkover. So does 20 s of silence.
- Only the winner reports `setrobotscore` (`user1id` = own robot, `user2id` = opponent,
  `winner`), and only for ranked games; a tie is reported by the host with winner 0.
  The abuse button posts `reportabuse` to `abuse.asp`.
- `main.ini` has no `fallbackip`: the fan lobby wrapper would otherwise log on to a fan
  relay server first, using scripts it compiles at runtime.

`scripts/test-multiplayer.mjs` (`npm test`) plays this through with two simulated clients.

## dirplayer patches (`patches/dirplayer.patch`)

The patch applies to upstream PR #244 (`cham/w3d-fullscreen`, b9b94666), not to `main`;
see `docs/upstream.md` for why.

- `new(timeout(), name, ...)` (Director 10 function form) and `timeout.persistent`.
- `clearCache()` / `cacheSize()` as no-ops.
- Multiuser: `#text` / `#smus` mode given as a symbol; `waitForNetConnection` via
  `window.dirplayerResolveListenUrl`; per-peer `breakConnection` for listeners.
- `go()` issued during `beginSprite` is queued instead of running the frame change inline.
- Score parsing: 40/44/48-byte entries are only treated as sprite spans when their frame
  range is plausible (behavior initializer strings can have the same length).
- Movie switches reset every sprite channel, not just puppets.
- `sendSprite(0, ...)` reaches the frame script.
- `the selStart` / `the selEnd` read the focused field's live selection (clicks and the
  built-in editor move it), and setting them moves the caret. The login fields use a
  behavior that does its own editing based on these.
- Home, End, Page Up/Down and forward Delete get Director's Mac key codes, matched by key
  name (their JS codes collide with the char codes of `!"#$.`, which the field input sends).
- Clicking in a field whose font isn't embedded (e.g. Verdana, drawn with Canvas2D) places
  the caret using Canvas2D text measurement.
- When a behavior's `go()` moves the playhead during an event dispatch, the remaining
  behaviors of the frame that was left no longer get that event. The garage's five door
  sprites each call `go(the frame + 1)` when their animation ends; without this they
  stepped the playhead five frames on, past the workshop into "load backyard".
- Setting a property on a list of 3D objects (`model.shaderList.blend = 50`) sets it on
  each object.
- 3D sprites always draw above the 2D sprites and take clicks first, whatever the
  member's directToStage flag (PR #244 already defers directToStage 3D; the patch extends
  it to every 3D sprite). The arena keeps a full-stage frame bitmap (copy ink) above
  its 3D sprite. The garage preview member has directToStage off, yet a `locz` behavior
  raises an opaque frame bitmap (`preview2`) over it, and the robot still has to show and
  be draggable through the window.
- `beginSprite` reaches the frame script exactly once per span, after the sprite
  behaviors, and never falls through to the frame/movie scripts. A behavior without a
  `beginSprite` handler used to pass the event on to the frame script, so the arena's frame
  script built and scaled the robot once per such sprite (scale 8 instead of 2, which put
  the follow camera inside the chassis).
- The frame script has one instance: begin_sprites adopts channel 0's instance instead of
  creating a second. With two, `prepareFrame` went to one and `sendAllSprites` to the
  other, so the garage frame script stuck in `#update` and ignored "Use this part".
- The 3D fragment shader uses highp floats. With mediump (fp16 on some GPUs),
  `normalize(camera - position)` overflowed in the arena, which spans thousands of units,
  and all lighting came out black.
- `length(vector)` / `vector.length()` as a method, not just a property.
- A plain function call no longer reaches a frame script or sprite behavior handler when a
  builtin has that name (Director only searches movie scripts, then builtins). The arena's
  robot behavior has its own `on keyPressed me, map, tdelay`, so the frame script's
  `keyPressed(123)` got VOID and the robot never drove.
- Text renders through the "auto" glyph path by default, not PR #244's new "hinted" path,
  which fills the counters of the 14px "Impact *" button labels.
- Mattes of 32-bit images with alpha come from the alpha channel, and `intersects` places
  both sprites with their rotation and flips before comparing mattes. The arena's hidden
  collision maps are alpha images and the robot sprite rotates; see `docs/collision.md`.
- `(the systemDate).seconds` counts from midnight; the arena paces itself by waiting for it
  to grow.
- `the key` / `the keyCode` are the last key pressed, so the camera keys work while an arrow
  is held.
- `numToChar` / `charToNum` use Windows-1252 (the Stats "Ranking" em dash).
- `rgb("0xRRGGBB")` parses like `"#RRGGBB"`.
- `shader.specular` writes take effect, and `light.specular` gates highlights (default on).
- `setPixel(x, y, integer)` on an indexed image writes the palette index (paint maps).
- `scriptInstanceList` assignments skip entries that aren't script instances.
- No extra `stepFrame` on mouseDown.
- `offset(rect, h, v)` is the rect form.
- Ink 6 (Not Reverse) XORs into the framebuffer (robot list highlight).
- Clicks go to the highest channel under the point (locZ only changes drawing), and 32-bit
  alpha bitmaps honour their authored `alphaThreshold` (workshop tabs).
- The player's stage keeps its CSS size at fractional device pixel ratios (it used to snap
  scale × DPR and shrank the game to 0.8 at 125% display scaling, with black borders).
- Built-in tiles (shape patterns 57-64) are drawn through the Mac system palette, the
  palette of Director's own tile bitmaps (RT_BITMAP 20-27 in Dirapi.dll), and ScummVM's
  row-rotated pixel arrays are rotated back (about 96% of pixels now match Adobe's). The
  arena's battery shows tile 57 when it drains.
- Image `draw()` / `fill()` take float coordinates (truncated) and normalise reversed
  corners; an unknown `#shapeType` (the Paintshop pen passes `#pen`) draws a `#line`, and
  `#rect` honours `#lineSize` (Paintshop tools).
- System-font text on lines taller than its glyphs (fixedLineSpace) puts the extra space
  above the text, baseline one descent above the line's bottom (Buy parts lists).
- `rr_intersect_sweep(...)` (debug export) sweeps a sprite over a grid and reports
  `intersects` results, for the collision checks in `tools/`.
- `keyPressed(",")` and other punctuation map to their Mac key codes; they used to fall back
  to code 0, the `a` key.
- `tests/rr_score.rs`: native diagnostics: how a movie's score is decoded (`dump_score`),
  each 3D member's raw info block (`dump_w3d_info`), and a bitmap's alpha
  (`dump_bitmap_alpha`, `RR_MEMBER=n`).
