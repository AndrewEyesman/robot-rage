# Robot Rage 2

Miniclip's *Robot Rage 2: Rearmed* (Raketspel, 2005), ported to TypeScript so it runs
natively in the browser, without Shockwave, plugins or an emulator.

The original was a set of Shockwave (Director MX 2004) movies. Each movie's Lingo
scripts are translated to TypeScript and run on a small Director runtime written for
the port, with Shockwave 3D rebuilt on Three.js (`port/`, see `port/README.md`). The
parts of the old online service the game needs (login, robots, the lobby, matches) are
reimplemented in `server/`.

The goal is the original game as it played in 2004, with a few improvements on top:
higher frame rates, widescreen, Super Packs bought with in-game credits, and fixes for
the original's bugs. Each improvement can be switched off to get the original
behaviour back (`?quirks=` and the others in `docs/port-behaviors.md`), and the ones that
change only a player's own game (widescreen, smooth drawing, the wind...) are in the
game's Settings, next to the Privacy link.

## Status

The whole game is playable: login, the robot list, the garage (workshop, paintshop,
buying and selling, stats), the lobby, Training and ranked two-player matches. It's
new, so expect some problems; known ones are in `docs/port-issues.md`.

## Bugs and contributions

Found a bug? Please [open an issue](../../issues)
with what you did, what happened and what you expected, plus your browser and a
screenshot if you can. Pull requests are welcome too. The translated scripts follow
`port/TRANSLATING.md`, and `npm test` runs the checks (`docs/port-behaviors.md` lists
what they cover). GitHub Actions runs the ones that don't need the game's files on every
push and pull request (`.github/workflows/test.yml`).

## Setup

Requires Node 20+ and Docker. The game files aren't in this repository: you download
them and extract their assets locally.

```sh
npm install
scripts/fetch-game.sh        # game files -> public/game/ (not in this repo)
scripts/build-dirplayer.sh   # dirplayer-rs, whose parsers the extractor uses (~10 min first time)
docker build -t robotrage-wine-ref docker/wine-reference   # Windows' core fonts, for the extractor
port/extract.sh              # the game's assets and fonts -> port/assets/
PORT=8091 npm start          # the game server
(cd port/web && npm install && npm run dev)   # the port: http://127.0.0.1:8092
```

The dev server talks to the game server on port 8091 (`RR_SERVER` changes that).
Accounts and robots are stored in `data/db.json`.

[dirplayer-rs](https://github.com/igorlira/dirplayer-rs) is a Shockwave emulator. Besides
reading the game files for the extractor, it runs the original game (`public/`), which
the port's checks compare against tick by tick (`docs/reference.md`).

Matches in the port connect the two players' browsers directly (WebRTC), with this
server only signalling, and fall back to relaying through it. `ICE_SERVERS` sets the
STUN servers the browsers use to find each other: comma-separated URLs, or a JSON
`RTCIceServer` list (default `stun:stun.l.google.com:19302`; empty for none, enough
on one machine or LAN). No TURN server: the relay is the fallback.

## Hosting

The port runs for players from the game server alone, without Vite. The host needs the
game files and the assets extracted from them, made locally and never put in the image:

```sh
scripts/fetch-game.sh        # game files -> public/game/
port/extract.sh              # their assets and fonts -> port/assets/ (needs Docker)
```

**Docker** (`Dockerfile`, `docker-compose.yml`): the image holds the server and the
built frontend; `port/assets` and `public/game` are mounted read-only, `db.json` lives in
the `data` volume.

```sh
docker compose up -d --build     # http://127.0.0.1:8080
```

**Plain Node:**

```sh
(cd port/web && npm ci && npm run build)      # -> port/web/dist
APP_DIR=port/web/dist PORT=8080 npm start
```

| Variable | |
| --- | --- |
| `APP_DIR` | the built frontend; set, the server serves the port (`/` is the game) instead of `public/` |
| `ASSETS_DIR` | the extracted assets, served as `/assets` (default `port/assets`) |
| `GAME_DIR` | the game files (default `public/game`); only `badlanguage.txt` is served, never the movies |
| `DATA_DIR` | where `db.json` lives (default `data`; `/data` in the image) |
| `PORT`, `ICE_SERVERS`, `ADMIN_TOKEN` | as above |
| `TRUST_PROXY=cloudflare` | take the client's address from `CF-Connecting-IP`: only behind the tunnel |

The bundle (`/app/`, hashed) is cached for a year, the assets for a day (each movie's
`index.json` is revalidated on every load), the page and the API not at all; text, fonts
and meshes go out brotli- or gzip-compressed (compressed once, kept in memory). Players
may see old images and sounds for up to a day after `port/extract.sh` runs again. `node port/tools/prod-test.mjs` builds and checks all of it (also in
`npm run test:port`).

**Cloudflare tunnel** (no open port on the host): create a tunnel in Cloudflare Zero
Trust (Networks > Tunnels, connector Docker), give its public hostname the service
`http://robotrage:8080`, put its token in `deploy/tunnel.env` (see
`deploy/tunnel.env.example`; never committed), set `TRUST_PROXY=cloudflare` in `.env`,
and start with `docker compose --profile tunnel up -d`. WebSockets (lobby, matches) go
through the tunnel as they are; the WebRTC match traffic goes directly between the
players. With `TRUST_PROXY=cloudflare` the server takes the player's address from
`CF-Connecting-IP`, so keep the published port local (`BIND`, default `127.0.0.1`):
anyone reaching it directly could fake that header.

**Backups:** the `backup` service writes a gzipped copy of `db.json` to the `backups`
volume once a day and keeps 14 days (`docker compose cp backup:/backups .` fetches
them). Without Docker, `scripts/backup-db.sh <data dir> <backup dir>` does one; from cron:
`15 4 * * * /path/to/robotrage/scripts/backup-db.sh /path/to/data /path/to/backups`.
To restore, stop the server and unzip a copy over `db.json`. To check a backup without
touching the live data, unzip it into an empty folder and start a second container on it:
`docker run --rm -d --name rr-restore-test -p 127.0.0.1:18095:8080 -v <folder>:/data robotrage`
(the folder writable by the image's `node` user), then log in or call the API on port 18095.
The backups live on the same disk as the data, so copy them off the machine as well.

## Results and money (anti-cheat)

The server doesn't take the client's word for results or money.

**Ranked results** (`server/results.mjs`). The challenge host reports each match it
starts (`setrwgames`, naming both robots), and both players report every ranked round
(`setrobotscore`). A round counts (wins, losses, draws, score, prize) only when both
reports agree, arrive within 30 s of each other (`REPORT_WINDOW_SEC`), and belong to a
match the server saw start (open until 2 h without activity, first to 3 wins, at most 15
rounds; never between two robots of one account). A report from one side only, two reports
that disagree, or a report with no started match records nothing, with one exception: a
player who quits loses. The port's match connections carry the login session, so when one
closes on its own the relay knows that player left; the survivor's arena claims the round
as a walkover, and that claim counts if the leaver never reported (the match ends there).
Closing your own connection or cutting the other side's still wins nothing, and rounds
already confirmed stand. A surrender counts, since the surrendering player reports the
opponent as the winner. Against trading wins between one person's accounts,
`RANKED_PER_PAIR_PER_DAY` limits the ranked matches two accounts play each other a day
(later ones play unranked); it's off (0) by default while there are few players.

**Money and parts** (`server/economy.mjs`). The server keeps each robot's ledger (its
money and the parts it owns) and checks every save (`setrobot`) against it, with the
game's own prices: a part costs its price, a Super Pack's seven parts 2100, a part sells
for 90% of its price (truncated), installing and removing is free. A save whose parts
can't be paid for, or whose installed parts break the workshop's rules (one chassis,
engine, tower and set of wheels, two batteries, each weapon once, one tower weapon and
only with a tower), is refused. Money above what legal buying and selling allow is cut to
that amount (with `#info1`, the client's check value, to match); armour above the
chassis's limit is cut too. The ranked prize (10 credits per round won, for a match not
lost, as the arena pays it) is paid by the server from confirmed results only, when the
robot is next loaded or saved. The port's client takes the server's money back after
each save. Robots that existed before this start from their saved state.

**Granting credits** (for testing):

```sh
node scripts/grant-credits.mjs Crusher 5000          # add 5000 (robot name or id)
node scripts/grant-credits.mjs 1003 5000 --set       # make its money exactly 5000
```

This edits `data/db.json`, so stop the server first. Credits are paid (money and
`#info1` together) when the robot is next loaded. To grant on a running server instead,
start it with `ADMIN_TOKEN=<secret>` and run the tool with that variable set and
`--url http://127.0.0.1:<port>`; the server answers that only from its own machine,
never through a proxy (`X-Forwarded-For`), and without `ADMIN_TOKEN` it has no admin
action at all. Don't set it on a public server unless you need it.

## Moderation and limits

Kicks and bans, without a UI (`scripts/moderate.mjs`); `<who>` is a login, a robot's name
or id (its owner's account), or `ip:<address>`:

```sh
node scripts/moderate.mjs list
node scripts/moderate.mjs kick <who> [--ip]                          # running server only
node scripts/moderate.mjs ban <who> [--days 7] [--reason "..."] [--ip]
node scripts/moderate.mjs unban <who>        # or: unban --id <ban id from list>
```

A kick ends the account's sessions and closes its lobby and match sockets; a ban does that
and keeps it out: a banned account can't log in or join the lobby, a banned address can't
log in, create accounts or connect at all. `--ip` adds the address the account last used
(the server keeps that in memory only). Like the credit tool, it edits `data/db.json`
(server stopped) or, with `ADMIN_TOKEN` set and `--url http://127.0.0.1:<port>`, asks the
running server, from its own machine only. Bans are stored in `db.json`. In Docker, run
the tools inside the container (from the host they'd arrive from Docker's network):
`docker compose exec robotrage node scripts/moderate.mjs kick <who> --url http://127.0.0.1:8080`.

The server also limits, per client address (`TRUST_PROXY`), logins (a growing lockout
after failures, also per account name), new accounts per day, API requests, lobby floods
and WebSocket connections and traffic; expired sessions and old matches are pruned. Every
limit and its default is in `server/limits.mjs` and the header of `server/index.mjs`. The
players' privacy note is `port/web/privacy.html`.

**Logs:** a line per request and event on stdout, and in Docker also a file per day under
`/data/logs`, kept 14 days (`LOG_DIR`, `LOG_DAYS`). Passwords and session ids never appear;
replies are shortened (a paint map shows as its length, a robot's data is cut). The game
reports its own errors from the players' browsers (`port/web/src/error-report.ts`): each
shows up once as a `client error` line with the movie, frame, handler and stack, and again
at its 10th, 100th... report (`server/clienterrors.mjs`; limited by `CLIENT_ERRORS_PER_MIN`,
off in a browser with `?reporterrors=0`). Some errors are the original game's own and
harmless (Director ignored script errors; see `docs/port-issues.md`). The stacks point
into the minified bundle: build the deployed commit with
`(cd port/web && npx vite build --sourcemap)` to look the positions up.

Two settings close what the original game left open, at the cost of the original itself
(dirplayer) and old clients, so they're off by default and on in `docker-compose.yml`:
`IRC_REQUIRE_SESSION=1` lets a lobby nick in only with the login session of its robot's
owner as the IRC password, and `MAP_REQUIRE_SESSION=1` takes paint map saves only with a
session. The port sends both (`gameFixes.ircAuth` and `gameFixes.mapSession` in
`port/web/src/movies/fixes.ts`). Without them, a session sent is still checked against the
robot, and a lobby nick without one, or a session-less paint map from the address its
robot's owner last used (within 30 minutes), is taken.

## How it fits together

| Original service | Replacement |
| --- | --- |
| Shockplay `main.asp` HTTP backend (login, robots, scores) | `server/api.mjs` (results: `results.mjs`, money: `economy.mjs`) |
| IRC lobby on ports 8777-8781 | `server/irc.mjs` over WebSocket |
| Direct peer-to-peer matches on port 1626 | the port: a WebRTC DataChannel between the browsers, signalled by `server/relay.mjs`, which relays the match over WebSocket when that fails (and always for dirplayer) |
| `main.ini` server settings | generated by `server/index.mjs` |

For the original on dirplayer, its page (`public/index.html`) gives each tab a made-up
private "IP", passes it to the game, and maps the game's socket connections onto this
server's WebSocket endpoints. `patches/dirplayer.patch` holds the emulator fixes it
needed; see `docs/notes.md`.

## Credits

- **Raketspel AB and Miniclip**, who made the game.
- **[robotrage.pro](https://robotrage.pro)**, for preserving the game client:
  `scripts/fetch-game.sh` downloads their copy.
- **[dirplayer-rs](https://github.com/igorlira/dirplayer-rs)** by @igorlira, the
  Shockwave emulator whose file parsers extract the game's assets and which runs the
  original for comparison.

## License

The game belongs to Raketspel AB and Miniclip. This repository holds none of its files:
they and the assets extracted from them stay local. The translated scripts are theirs
too and aren't open source; everything else here is MIT. See `LICENSE` for exactly
what that covers.
