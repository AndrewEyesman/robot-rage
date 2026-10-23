#!/usr/bin/env bash
# Download the preserved Robot Rage 2 client (robotrage.pro's zip) and unpack
# the Shockwave movies into public/game/. These files are Raketspel/Miniclip's
# and are deliberately not committed to this repository.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="https://robotrage.pro/robotrage.zip"
SHA256="3aed8e3f2ff23733284f3253cbd00089225b2a54fe05ee80615fde3209066f8b"
CACHE=.cache/download
DEST=public/game

mkdir -p "$CACHE" "$DEST"
if [ ! -f "$CACHE/robotrage.zip" ]; then
  curl -fL --retry 3 -o "$CACHE/robotrage.zip.part" "$URL"
  mv "$CACHE/robotrage.zip.part" "$CACHE/robotrage.zip"
fi
echo "$SHA256  $CACHE/robotrage.zip" | sha256sum -c -

# Only the movies and text files; skip the Windows projectors and the fan
# main.ini (the server generates its own).
unzip -o -j -q "$CACHE/robotrage.zip" 'RobotRage/*.dcr' 'RobotRage/*.cct' \
  'RobotRage/badlanguage.txt' 'RobotRage/version.txt' -d "$DEST"
ls "$DEST"
