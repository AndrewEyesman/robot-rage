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
`logoutmember`, `getmyrobots`, `createrobot`, `deleterobot`, `getrobot`, `getrobotmap`,
`setrobot`, `setrobotmap`, `setrobotscore`, `gethiscore`, `PING`, `PingPayMember`,
`reportabuse`.

- The garage list places each robot in row `entry.count`, so entries carry an explicit
  `#count`.
- `getrobot` replies include a checksum the client verifies before loading the robot:
  MD5 of the uppercased, space-stripped concatenation of the robot's property list,
  friends list and stats, plus a fixed salt (see `robotChecksum` in `server/api.mjs`).
  Robot data is stored exactly as the client sends it so the checksum stays stable.
- `getrobotmap` is plain text (TAB-separated), not a property list.

## Lobby (IRC)

The client speaks raw IRC through the Multiuser Xtra in `#text` mode. It reads its own
address from the last `@host` of the `001` reply, the online count from `265`, and shows
the lobby after `376`. Challenges and P2P negotiation travel as `PRIVMSG`s between players.

## Matches (port 1626)

Originally the challenged player listened (`waitForNetConnection`) and the opponent
connected straight to their IP. Here both sides open WebSockets to `server/relay.mjs`:
the patched emulator turns `waitForNetConnection` into a "listen" socket keyed by the
tab's address, and `connectToNetServer(ip, 1626)` into a "connect" socket. The relay
reads only SMUS envelopes (sender, recipients, subject) and forwards frames.

## dirplayer patches (`patches/dirplayer.patch`)

- `new(timeout(), name, ...)` (Director 10 function form) and `timeout.persistent`.
- `clearCache()` / `cacheSize()` as no-ops.
- Multiuser: `#text` / `#smus` mode given as a symbol; `waitForNetConnection` via
  `window.dirplayerResolveListenUrl`; per-peer `breakConnection` for listeners.
- `go()` issued during `beginSprite` is queued instead of running the frame change inline.
- Score parsing: 40/44/48-byte entries are only treated as sprite spans when their frame
  range is plausible (behavior initializer strings can have the same length).
- Movie switches reset every sprite channel, not just puppets.
- `sendSprite(0, ...)` reaches the frame script.
- Chunk edits (`delete char ... of member`) work on text members, not just fields.
- `tests/rr_score.rs`: native diagnostic that prints how a movie's score is decoded.
