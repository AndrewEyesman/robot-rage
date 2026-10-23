#!/usr/bin/env python3
"""Check the arena's hidden collision test against an independent reference.

The arena moves the robot as an off-stage sprite (channel 10, member rob1) and
tests `sprite 10 intersects N` against four full-arena collision maps (channels
15-18, members KROCKM~2/~3/~4 and KR9B90~1: 32-bit, alpha = wall), stretched over
rect(822, -180, 1582, 578), all with matte ink.

Inputs:
  --sweep  JSON from dirplayer's rr_intersect_sweep (what the emulator says)
  --dump   folder with m<member>-alpha.png / m52-matte.png / m<member>-image.png
           from the native `dump_bitmap_png` test (the game's own bitmaps)
Outputs: mismatch counts against the reference, how many open-floor positions the
old algorithm (unrotated rects, white-keyed mattes) blocked, and an overlay PNG.

  tools/collision-sweep.py --sweep sweep.json --dump /tmp/dump --out overlay.png
"""
import argparse
import json
import math
from collections import deque

from PIL import Image, ImageDraw

MAPS = {15: 197, 16: 198, 17: 199, 18: 200}
MAP_RECT = (822, -180, 1582, 578)
ROBOT = {"member": 52, "w": 33, "h": 26, "reg": (17, 13)}


def load_mask(path, threshold=1):
    im = Image.open(path).convert("L")
    w, h = im.size
    px = im.load()
    return w, h, [[px[x, y] >= threshold for x in range(w)] for y in range(h)]


def white_key_matte(path):
    """The old dirplayer matte: white background flood-filled in from the edges."""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    white = lambda x, y: px[x, y] == (255, 255, 255)
    solid = [[True] * w for _ in range(h)]
    q = deque((x, y) for x in range(w) for y in (0, h - 1) if white(x, y))
    q.extend((x, y) for y in range(h) for x in (0, w - 1) if white(x, y))
    for x, y in q:
        solid[y][x] = False
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and solid[ny][nx] and white(nx, ny):
                solid[ny][nx] = False
                q.append((nx, ny))
    return w, h, solid


class Shape:
    def __init__(self, rect, loc, angle, mask, rotate=True):
        self.l, self.t, self.r, self.b = rect
        self.cx, self.cy = loc
        a = math.radians(angle if rotate else 0.0)
        self.cos, self.sin = math.cos(a), math.sin(a)
        self.mw, self.mh, self.mask = mask

    def to_sprite(self, x, y):
        dx, dy = x - self.cx, y - self.cy
        return (self.cx + dx * self.cos + dy * self.sin, self.cy - dx * self.sin + dy * self.cos)

    def bounds(self):
        pts = []
        for x, y in ((self.l, self.t), (self.r, self.t), (self.r, self.b), (self.l, self.b)):
            dx, dy = x - self.cx, y - self.cy
            pts.append((self.cx + dx * self.cos - dy * self.sin, self.cy + dx * self.sin + dy * self.cos))
        return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))

    def covers(self, x, y):
        sx, sy = self.to_sprite(x, y)
        if not (self.l <= sx < self.r and self.t <= sy < self.b):
            return False
        bx = int((sx - self.l) / (self.r - self.l) * self.mw)
        by = int((sy - self.t) / (self.b - self.t) * self.mh)
        return bx < self.mw and by < self.mh and self.mask[by][bx]


def intersects(a, b):
    al, at, ar, ab = a.bounds()
    bl, bt, br, bb = b.bounds()
    l, t, r, btm = max(al, bl), max(at, bt), min(ar, br), min(ab, bb)
    if l >= r or t >= btm:
        return False
    y = math.floor(t) + 0.5
    while y < btm:
        x = math.floor(l) + 0.5
        while x < r:
            if a.covers(x, y) and b.covers(x, y):
                return True
            x += 1.0
        y += 1.0
    return False


def robot_shape(x, y, angle, mask, rotate=True):
    rx, ry = ROBOT["reg"]
    rect = (x - rx, y - ry, x - rx + ROBOT["w"], y - ry + ROBOT["h"])
    return Shape(rect, (x, y), angle, mask, rotate)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", required=True)
    ap.add_argument("--dump", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--samples", type=int, default=4000, help="reference checks per map")
    args = ap.parse_args()

    sweep = json.load(open(args.sweep))
    xs, ys, angles = sweep["xs"], sweep["ys"], sweep["angles"]
    robot_matte = load_mask(f"{args.dump}/m{ROBOT['member']}-matte.png", 128)
    alpha = {s: load_mask(f"{args.dump}/m{m}-alpha.png", 1) for s, m in MAPS.items()}
    old = {s: white_key_matte(f"{args.dump}/m{m}-image.png") for s, m in MAPS.items()}
    map_shape = lambda s, masks: Shape(MAP_RECT, (MAP_RECT[0], MAP_RECT[1]), 0, masks[s])

    # 1. Emulator vs reference on a deterministic subset of the sweep.
    import random
    rnd = random.Random(1)
    cells = [(ai, yi, xi) for ai in range(len(angles)) for yi in range(len(ys)) for xi in range(len(xs))]
    report = {}
    for s in MAPS:
        rows = sweep["hits"][str(s)]
        sample = rnd.sample(cells, min(args.samples, len(cells)))
        # Bias towards hits so wall edges are well covered.
        hits = [c for c in cells if rows[c[0] * len(ys) + c[1]][c[2]] == "1"]
        sample += rnd.sample(hits, min(args.samples // 2, len(hits)))
        bad = []
        for ai, yi, xi in sample:
            got = rows[ai * len(ys) + yi][xi] == "1"
            want = intersects(robot_shape(xs[xi], ys[yi], angles[ai], robot_matte), map_shape(s, alpha))
            if got != want:
                bad.append((xs[xi], ys[yi], angles[ai], got, want))
        report[s] = {"checked": len(sample), "mismatches": len(bad), "examples": bad[:5],
                     "hit_cells": len(hits), "cells": len(cells)}

    # 2. How much open floor the old algorithm blocked: positions where the old test
    #    reports a hit on a map although the reference (alpha, rotation) says none.
    phantom = {}
    for s in MAPS:
        n = blocked_old = 0
        for ai in range(len(angles)):
            for yi in range(0, len(ys), 2):
                for xi in range(0, len(xs), 2):
                    want = intersects(robot_shape(xs[xi], ys[yi], angles[ai], robot_matte), map_shape(s, alpha))
                    if want:
                        continue
                    n += 1
                    if intersects(robot_shape(xs[xi], ys[yi], angles[ai], robot_matte, rotate=False), map_shape(s, old)):
                        blocked_old += 1
        phantom[s] = {"open_positions": n, "old_blocked": blocked_old}

    # 3. Overlay at the first angle: walls (alpha) per map in colour, emulator hits as dots.
    scale = 1
    img = Image.new("RGB", (MAP_RECT[2] - MAP_RECT[0], MAP_RECT[3] - MAP_RECT[1]), (30, 30, 30))
    px = img.load()
    colours = {15: (200, 60, 60), 16: (60, 200, 60), 17: (60, 120, 230), 18: (220, 200, 60)}
    for s, (mw, mh, mask) in alpha.items():
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                if mask[int(y / img.size[1] * mh)][int(x / img.size[0] * mw)]:
                    px[x, y] = colours[s]
    d = ImageDraw.Draw(img)
    rows_any = [[any(sweep["hits"][str(s)][yi][xi] == "1" for s in MAPS) for xi in range(len(xs))] for yi in range(len(ys))]
    for yi, y in enumerate(ys):
        for xi, x in enumerate(xs):
            if rows_any[yi][xi]:
                cx, cy = x - MAP_RECT[0], y - MAP_RECT[1]
                d.ellipse((cx - 1, cy - 1, cx + 1, cy + 1), fill=(255, 255, 255))
    img.save(args.out)
    print(json.dumps({"vs_reference": report, "old_algorithm": phantom}, indent=1))


if __name__ == "__main__":
    main()
