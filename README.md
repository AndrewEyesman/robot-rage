# Robot Rage, self-hosted

A private web server that runs Miniclip's *Robot Rage 2: Rearmed* (Raketspel, 2005)
in the browser, with its lobby and multiplayer running on your own machine.

The original game is a Shockwave (Director MX 2004) movie set. Today it runs here on a
patched build of [dirplayer-rs](https://github.com/igorlira/dirplayer-rs), a Shockwave
emulator compiled to WebAssembly. The way forward is a port of the game to TypeScript
and Three.js, translated from its own scripts (`port/`, see `port/README.md`); why is
in `docs/decisions.md`. The parts of the old online service the game needs are
reimplemented in `server/` and serve both.

## Setup

Requires Node 20+ and Docker.

```sh
npm install
scripts/fetch-game.sh        # game files -> public/game/ (not in this repo)
scripts/build-dirplayer.sh   # patched emulator -> public/dirplayer/ (~10 min first time)
PORT=8080 npm start          # http://localhost:8080
```

Accounts and robots are stored in `data/db.json`.

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

The bundle (`/app/`, hashed) is cached for a year, the assets for a day, the page and the
API not at all; text, fonts and meshes go out brotli- or gzip-compressed (compressed once,
kept in memory). Players may see old assets for up to a day after `port/extract.sh` runs
again. `node port/tools/prod-test.mjs` builds and checks all of it (also in
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
To restore, stop the server and unzip a copy over `db.json`.

## Results and money (anti-cheat)

The server doesn't take the client's word for results or money.

**Ranked results** (`server/results.mjs`). The challenge host reports each match it
starts (`setrwgames`, naming both robots), and both players report every ranked round
(`setrobotscore`). A round counts (wins, losses, draws, score, prize) only when both
reports agree, arrive within 30 s of each other, and belong to a match the server saw
start (open until 2 h without activity, first to 3 wins, at most 15 rounds; never between
two robots of one account). A report from one side only, two reports that disagree, or a
report with no started match records nothing. When a player disconnects or vanishes,
their side never reports, so the round in progress doesn't count for anyone: faking a
disconnect can't win, it only voids that round (rounds already confirmed stand). A
surrender counts, since the surrendering player reports the opponent as the winner.

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

The page (`public/index.html`) gives each tab a made-up private "IP", passes it to the
game, and maps the game's socket connections onto this server's WebSocket endpoints.

`patches/dirplayer.patch` holds the emulator fixes this needed; see `docs/notes.md`.

## Status

On dirplayer: login, robot list, garage, lobby and the Training arena work in the
browser. In the port: the Training arena with one robot (`docs/handoff.md` has the
plan).

## Legal

The game belongs to Raketspel AB and Miniclip. This repository contains only original
server code, emulator patches, the port's code and tooling; the game files and the
assets extracted from them stay local, for personal use. Keep deployments private.
