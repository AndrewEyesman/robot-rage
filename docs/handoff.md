# Handoff (updated 2026-10-24)

Read `docs/decisions.md` first: how the project got here and why. Then `port/README.md`
and `port/TRANSLATING.md` for the port, and the README for running, hosting, the
anti-cheat rules and moderation.

## Where things stand

- **The whole game is ported** (`port/`): the loader, login and robot list (login013_),
  the garage (robotwars, factory0604: workshop, paintshop, buying, selling, stats), the
  lobby (lobby060_) and the arena (arena104: Training and ranked two-player matches).
  Each movie's Lingo is translated to TypeScript in `port/web/src/movies/<movie>/` and
  runs on the port's Director runtime (`port/web/src/director/`, Shockwave 3D on Three.js
  in `s3d/`). The full game is `game.html`.
- **It's hosted** for a small group of players from the game server alone
  (`docker-compose.yml`, behind a Cloudflare tunnel; README, Hosting). Real players use
  it: before a restart or redeploy, check the server's log for activity, since a restart
  drops everyone from the lobby and their matches.
- **The servers** (`server/`: login and robots API, IRC lobby, match signalling and
  relay) check results and money themselves (`results.mjs`, `economy.mjs`), limit
  abuse (`limits.mjs`), and log the game's own errors from players' browsers
  (`clienterrors.mjs`, fed by `port/web/src/error-report.ts`).
- **Matches** go directly between the two browsers over WebRTC when they can, with the
  relay as the fallback (`port/web/src/director/p2p.ts`).
- **Fixes to the original's bugs** are enhancements kept apart from the translations
  (`movies/fixes.ts`, `movies/arena104/enhancements.ts`, `movies/factory0604/enhancements.ts`),
  each switchable back with `?quirks=...` and guarded by a regression check.
- **dirplayer** isn't kept playable any more: it's only the reference that runs the
  original scripts, for the port's tick traces (`decisions.md` §6). **Adobe's player**
  under Wine in Docker is the visual reference (`docs/reference.md`).

## Where to look

| What | Where |
| --- | --- |
| Known issues, decisions on each, and the fixes to the original | `docs/port-issues.md` |
| What's verified to work, and the check guarding each | `docs/port-behaviors.md` |
| Translation rules | `port/TRANSLATING.md` |
| The server protocol (main.asp, lobby, matches) | `docs/notes.md` |
| Hosting, backups, logs, results and money, moderation | `README.md` |

## Checking changes

- `npm test` runs the server tests and the port's regression suite (`port/tools/regress.mjs`,
  usage in its header). The suite starts its own game and dev servers on free ports from
  `port/tools/regress-seed.json`, so it never touches a running server.
- `node port/tools/regress.mjs --fast` skips the slow checks (a couple of minutes); the
  pre-commit hook (`scripts/git-hooks/pre-commit`) runs it for commits touching `port/` or
  `server/`. `--full` adds the weapon and two-robot traces against dirplayer (20-45 minutes): only
  after arena, weapon or physics changes.
- `npm run test:server` alone for server changes.
- GitHub Actions (`.github/workflows/test.yml`) runs only what needs no game files: the
  server tests, typecheck, unit tests (without text layout, which needs the extracted
  fonts) and the multiuser checks. Never give CI the game files or extracted assets:
  the repository is public, and fork pull requests can read its caches.
- Every newly verified behaviour gets a line in `docs/port-behaviors.md` and, where
  practical, a check; every issue found gets an entry in `docs/port-issues.md`.

## Open work

From `docs/port-issues.md`, the parts that matter most:

- **Server (#56):** weapon placement and space aren't checked on save; the Super Pack
  SMS check (only with `?quirks=superpack`) reloads the robot without taking its money.
  Rage-quitting now loses the round. Win trading has a per-pair daily limit, off by
  default (`RANKED_PER_PAIR_PER_DAY`) while there are few players.
- **Fidelity gaps:** ink approximations (#16, #17), anti-aliased text greys (#9), text
  features not yet checked against Adobe (#10), the Super Pack 1 box text (#43), extra
  garage 3D models (#41), paintshop lines a pixel off (#42), rebuilt 3D normals (#14).
- **Not yet compared with the original:** the lobby door behavior in Adobe (#25).
- **Players' errors:** `client error` lines in the hosted server's log (#70 was the first).

The maintainer judges look and feel; what they report becomes measurable checks.

## Testing gotchas

- Development: `cd port/web && npm run dev` (127.0.0.1:8092) proxies the API, `main.ini`
  and WebSockets to a test game server on 8091 (`RR_SERVER` to change it); run one with
  `PORT=8091 DATA_DIR=<a copy> npm start`. Test accounts: see `regress.mjs`'s header.
- Several agents testing as one account at once collide on the lobby's IRC nick
  ("Nickname is already in use").
- In Playwright only the front tab reliably gets clicks: bring a page to the front
  before clicking it in multi-tab tests.
- Training refuses to start until the robot has an engine.
- Ghidra 12.2 (JDK 25) is in `~/tools/`, with a headless project
  `~/tools/ghidra-projects/director101` holding Adobe's Director 10.1 binaries. Never
  commit Adobe, Windows or game binaries.
- Decompiled Lingo (never commit it) lives in the first thread's scratch folder:
  `~/.t3/scratch/2026-10-23-can-you-somehow-re-engineer-c31057db/decomp/`. Many `.ls`
  files are Latin-1: use `grep -a` and `iconv -f latin1 -t utf8`.
- The dirplayer-era notes (feature inventory, collision fix, upstream PR, paired tour)
  are in `docs/inventory.md`, `docs/collision.md`, `docs/upstream.md` and
  `docs/reference.md`.
