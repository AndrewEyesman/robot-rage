# Game build we target

Everything we test against is the robotrage.pro "Robot Rage 2: Rearmed" client, as fetched
by `scripts/fetch-game.sh`:

- `https://robotrage.pro/robotrage.zip`,
  sha256 `3aed8e3f2ff23733284f3253cbd00089225b2a54fe05ee80615fde3209066f8b`
  (zip entries dated 2019-08-28 to 2025-01-01).
- Its `main.ini` says `version = "version 1.9"` and loads `arena104.dcr`,
  `factory0604.dcr`, `lobby060.dcr`, `login013.dcr`, `robotwars.cct`, `texter.cct`.
  The server writes its own `main.ini` with the same file list.

This is not a pristine Miniclip release. The fan wrappers (`login013.dcr`, `lobby060.dcr`,
`wrapper_robotragerearmed.dcr`, `netLingo.dcr`, `ac.dcr`) load the original movies (the
`_` files) and redirect them to fan servers, and `arena104.dcr` / `robotwars.cct` are dated
later than the other originals. The handoff's "v60 files with the v55 arena" comes from the
previous thread; nothing in the files confirms or refutes those numbers.

## Files

Director version is the `Fver` string in each movie: 10.1r11 is Director MX 2004, 10.1.1r16
its 10.1.1 update.

| File | Size | Zip date | Director | sha256 | Role |
| --- | ---: | --- | --- | --- | --- |
| `arena104.dcr` | 1856772 | 2019-11-23 | 10.1#11 | `f503082735a3ac6ce0ce8925f2fdb44918d242b40d941acfe93881ecfab5ae7d` | arena (original, later date) |
| `factory0604.dcr` | 1535887 | 2019-08-28 | 10.1#11 | `5d74f0ef1c5f4e40e9335b68ffcb00cd0e83fb8196e604ebdb7f9bfe14682c29` | garage/workshop |
| `lobby060_.dcr` | 697374 | 2019-08-28 | 10.1#11 | `9b794a166d0419778107d742ad571d7676708c1f0a31dd7755fff4e96477e4ed` | lobby (original) |
| `login013_.dcr` | 486082 | 2019-08-28 | 10.1#11 | `82be8e55d79e724fbfa29893256dbe37e17721da28f00300aeea739922097b2f` | login (original) |
| `robotwars.cct` | 1433956 | 2019-11-23 | 10.1#11 | `91ea9def04916979cba8660e3494499b54229f72d42509769a4657e7f63944db` | shared cast (later date) |
| `texter.cct` | 171327 | 2019-08-28 | 10.1#11 | `e7fa3f84da0b6aac4b3ba9a284468d6be4fe1a39b68236aa4035120d63ae7bf7` | language cast |
| `loader002.dcr` | 141126 | 2019-08-28 | 8.5#321 | `9e8ba8c78d327ae8121241339fccd4758302c5af5a438881219480cb4ddbf2f6` | original loader (unused: not in the file list) |
| `login013.dcr` | 15132 | 2021-08-28 | 10.1.1#16 | `da01b2b059c6bcbc249bca449ad3b89b6a6a85a4860808e10e3b53a81217271e` | fan wrapper |
| `lobby060.dcr` | 8493 | 2021-08-22 | 10.1.1#16 | `a609e8adeb3f82a4da97eb976cd1d32703d1fb6ae0c8c0f6912d1dc4209b3b5d` | fan wrapper |
| `wrapper_robotragerearmed.dcr` | 182866 | 2021-08-29 | 10.1.1#16 | `0cba25caf2066a93642aea53553bf667c12d93a631208990929da1bdc88b7f8b` | fan entry movie |
| `netLingo.dcr` | 4185 | 2021-01-21 | 10.1.1#16 | `32f7d75177afc7ad96522e0eaa6a0e33665e9276e3fe679d249390d036e2f7f7` | fan helper |
| `ac.dcr` | 36685 | 2021-01-21 | 10.1.1#16 | `db23c6e2e212731841b7e29517ce95bddd8c8e6a533fea8b8abeaecdb2cdc05b` | fan helper |
| `version.txt` | 289 | 2019-08-28 | | `b829efb7b969fa0e1bbc98ad3781843569dc77ca147ad627fb563688dde18cc6` | `gVersionList` |
| `badlanguage.txt` | 757 | 2019-08-28 | | `0bbadf657d62735ec6ea420d178aea255f8ba2efc3db6bace8c95c763d84af9e` | chat filter |

`version.txt` (read into `gVersionList`) lists `main 1.02, arena 0.61, factory 0.41,
store 0.23, lobby 0.41, login 0.10`. These don't match the file names (`arena104`,
`lobby060`, `login013`). The game only reads its non-version entries (`mainasp`, `laktare`,
`minor`, ...), so treat the version numbers as stale.

## Xtras

From the Xtra lists inside the movies:

- Original movies: Shockwave 3D (Asset), Multiuser (`Multiusr.x32`), NetLingo, NetFile,
  INetURL, TextXtra/Text Asset, Font Asset/Font Xtra, Sound Control, DirectSound, MacroMix,
  SWA decompression.
- Fan wrappers add FileIO, Mix Services, JPEG Agent, QuickTime Agent/QTAuth, and two
  non-Adobe Xtras: `UPnP.x32` and `LeechProtectionRemovalHelp.x32`.

The zip also has two Windows projectors (`robotragerearmed.exe`, sha256
`3d9255dc181fbf702e935188dcf9c83efb6dcc6ce46990de13c365205bf579c2`, and a fullscreen twin).
They are Director MX 2004 10.1.1r16 projectors and bundle those Xtras, including
Shockwave 3D Asset, Multiusr, UPnP and LeechProtectionRemovalHelp. That makes the
projector a ready-made reference player candidate (plan step 4) alongside the Flashpoint
debug projector. It still talks to the fan servers through its `main.ini`.

## Visual reference

robotrage.pro's screenshots (`img/screens/1-3.jpg`) and its history page
(`?page=history`, with Miniclip-era screenshots) are a cheap visual reference. Use them
for layout and look only, not for timing or physics.
