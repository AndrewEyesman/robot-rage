# dirplayer upstream comparison (2026-10-23)

Our emulator is upstream dirplayer-rs plus `patches/dirplayer.patch`. This records why
the patch now applies to an open upstream pull request rather than to `main`.

## What upstream had

- `main` was still at 68376fb, our old base. The repo was last pushed 2026-09-09.
- Seven open PRs were newer than that. The relevant ones:
  - **#244** (`cham/w3d-fullscreen`, head b9b94666): +33.6k/−3.6k lines over 264 files,
    including about 210 Shockwave 3D commits (lights, backdrops, texture layers,
    `newTexture(#fromCastMember)` from text members, transforms, keyframe players,
    `modelsUnderRay`) and large text/PFR font work.
  - **#245 / #249** (Director 8.5 engine fixes: score, sound, inks, text, input, shaders).
    #249 builds on #245 and conflicts with #244 in 9 files, so they are competing branches.
  - #252 (key events from cast member scripts), #251 (field chunk commands), #246, #247:
    small and not yet relevant.

## Result of building #244 with our patch

The patch applied with three conflicts. Two were changes #244 had made itself (chunk
edits on text members, and drawing directToStage 3D above 2D), and one was test code.

Compared with our old build and the real player (robotrage.pro screenshots and the
Boxedwine capture of Adobe's Director 10.1 projector in `~/rr-spike/shots/report/`):

| | old build (68376fb) | #244 + patch | real player |
| --- | --- | --- | --- |
| Arena sky | black | dusk gradient | dusk gradient |
| Arena buildings | dark windows | lit windows | lit windows |
| Arena floor and robot | grey, flat lit | olive, darker | olive, darker |
| Garage robot preview | small | larger, closer to reference | larger |
| `newTexture("chat", #fromCastMember)` on a text member | warning, no texture | works | works |
| 14px "Impact *" button labels | open glyphs | **counters filled in** | open glyphs |
| Keyboard | works | works | |

#244's default glyph path ("hinted", grid-fitted PFR outlines) causes the filled
counters. With the previous default ("auto") the labels render as before. Our patch sets
"auto" as the default.

The earlier report that keys didn't reach the game on #244 was a test artifact. The stage
takes keys only while its element has focus, and in one run focus had fallen back to the
page. `public/index.html` now hands keys to the stage when nothing is focused. It also
hides #244's new fullscreen button, which the game never had.

## Decision

Rebased onto #244 at b9b94666 (`scripts/build-dirplayer.sh` pins it). The 3D gains are
what single-player accuracy needs most, and we carry the glyph default ourselves. If
upstream merges #244 into `main`, move the pin to `main`. #245/#249 are worth revisiting
for input and ink fixes once they're reconciled with #244 upstream.

Still wrong in both builds (now in the inventory): the button labels sit about 3px lower
than in the real player, and `Q` is drawn without its tail.

## Useful upstream tooling

#244 has an e2e harness (`vm-rust/tests/e2e`, `scripts/run-browser-tests.mjs`). It loads
a movie in a headless browser, steps frames deterministically, evaluates Lingo and compares
stage snapshots against references. Our regression tests (collision sweep, text and
3D checks) should use it.
