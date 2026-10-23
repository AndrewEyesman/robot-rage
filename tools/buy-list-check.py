#!/usr/bin/env python3
"""Check the vertical placement of the Buy parts list text (Verdana 10 on 15px lines).

  tools/buy-list-check.py .playwright-mcp/buy-list.png

The game centres its dropdown header (rows 213-227) and its per-row click boxes
(line 2: rows 242-258) on text whose baseline sits the font's descent above the
bottom of each 15px line. Text drawn at the top of its line lands 6px high, under
the header. Checks that the header text and list line 2 sit inside those boxes.
"""
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert("L")


def text_rows(y0, y1, thresh):
    # 3+ lit pixels in a row, but not a full-width rule (the selection box edges).
    counts = {y: sum(1 for x in range(60, 140) if im.getpixel((x, y)) > thresh) for y in range(y0, y1)}
    return [y for y, n in counts.items() if 3 <= n < 60]


ok = True
for name, (y0, y1), (lo, hi), thresh in [
    ("header 'Chassis'", (205, 228), (214, 226), 200),
    ("list line 2 'Medium Chassi'", (238, 256), (243, 255), 140),
]:
    rows = text_rows(y0, y1, thresh)
    good = bool(rows) and rows[0] >= lo and rows[-1] <= hi
    ok &= good
    print(f"{name}: glyph rows {rows[0] if rows else None}-{rows[-1] if rows else None}, expected within {lo}-{hi}: {'ok' if good else 'WRONG'}")
sys.exit(0 if ok else 1)
