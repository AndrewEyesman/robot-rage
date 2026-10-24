# Glyph grids and metrics for Windows' core fonts (port/assets/fonts/system/*.ttf),
# as Adobe's Director 10.1 player draws them through the system's GDI (measured
# against the reference player, docs in port/web/src/director/fonts.ts):
#
# - aliased text: TrueType-hinted monochrome glyphs (FreeType's mono rasteriser with
#   the bytecode interpreter: identical, pixel for pixel, to the reference);
# - advances: the outline advance scaled to the pixel size in 26.6 and rounded
#   (not the hinted/hdmx widths);
# - line ascent/descent: the font's VDMX entry for the pixel size, plus the hhea line
#   gap (rounded) below; anti-aliased runs put their baseline at the rounded
#   winAscent instead;
# - kerning pairs from the 'kern' table (Director kerns from kerningThreshold up).
#
#   python3 system-fonts.py <fonts/system dir>      writes <dir>/glyphs/
#
# Needs freetype-py and fonttools (extract.sh installs them into a venv in .cache).
import json
import os
import sys

import freetype
import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image

SIZES = range(6, 41)
FIRST = 32
# Windows-1252 code points 32..255 (undefined ones map to '?').
CP1252 = [bytes([c]).decode('cp1252', errors='replace') for c in range(FIRST, 256)]


def mul_fix_round(units, ppem, upm):
    """FreeType's FT_MulFix(units, x_scale) rounded to whole pixels (26.6 -> int)."""
    scale = (ppem * 64 * 65536 + upm // 2) // upm  # FT_DivFix(ppem << 6, upm)
    v26 = (units * scale + 0x8000) >> 16
    return (v26 + 32) >> 6


def build(path, out_dir):
    tt = TTFont(path)
    upm = tt['head'].unitsPerEm
    cmap = tt.getBestCmap()
    hmtx = tt['hmtx']
    os2 = tt['OS/2']
    vdmx = tt['VDMX'].groups[0] if 'VDMX' in tt else {}
    face = freetype.Face(path)
    name = os.path.splitext(os.path.basename(path))[0]
    doc = {'upm': upm, 'sizes': {}, 'kern': []}

    glyph_of = {}
    for i, ch in enumerate(CP1252):
        g = cmap.get(ord(ch))
        if g is not None:
            glyph_of[FIRST + i] = g

    if 'kern' in tt:
        rev = {g: c for c, g in glyph_of.items()}
        for sub in tt['kern'].kernTables:
            if getattr(sub, 'format', 0) != 0:
                continue
            for (a, b), v in sub.kernTable.items():
                if a in rev and b in rev and v:
                    doc['kern'].append([rev[a], rev[b], v])

    for px in SIZES:
        face.set_pixel_sizes(0, px)
        if px in vdmx:
            ascent, descent = vdmx[px][0], -vdmx[px][1]
        else:
            ascent, descent = mul_fix_round(os2.usWinAscent, px, upm), mul_fix_round(os2.usWinDescent, px, upm)
        glyphs = {}
        advances = []
        hinted = []
        for code in range(FIRST, 256):
            # DEL has no glyph in these fonts: its slot holds .notdef (the box GDI
            # draws for characters a font lacks, and for TAB in fields).
            g = '.notdef' if code == 127 else glyph_of.get(code)
            if g is None:
                advances.append(0)
                hinted.append(0)
                continue
            advances.append(mul_fix_round(hmtx[g][0], px, upm))
            face.load_glyph(tt.getGlyphID(g), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_MONO)
            gl = face.glyph
            hinted.append((gl.advance.x + 32) >> 6)
            b = gl.bitmap
            if b.rows and b.width:
                raw = np.array(b.buffer, np.uint8).reshape(b.rows, b.pitch)
                bits = np.unpackbits(raw, axis=1)[:, : b.width].astype(bool)
                glyphs[code] = (gl.bitmap_left, gl.bitmap_top, bits)
        # One cell per glyph: the pen origin at (ox, base) in every cell.
        ox = max([0] + [-l for l, _, _ in glyphs.values()])
        base = max([ascent] + [t for _, t, _ in glyphs.values()])
        right = max([1] + [l + bits.shape[1] for l, _, bits in glyphs.values()])
        bottom = max([descent] + [bits.shape[0] - t for _, t, bits in glyphs.values()])
        cw, ch = ox + right, base + bottom
        cols = 16
        rows = (256 - FIRST + cols - 1) // cols
        img = np.zeros((rows * ch, cols * cw), np.uint8)
        for code, (l, t, bits) in glyphs.items():
            i = code - FIRST
            x = (i % cols) * cw + ox + l
            y = (i // cols) * ch + base - t
            img[y : y + bits.shape[0], x : x + bits.shape[1]] |= bits.astype(np.uint8) * 255
        rgba = np.zeros(img.shape + (4,), np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = img
        png = f'{name}-{px}.png'
        Image.fromarray(rgba, 'RGBA').save(os.path.join(out_dir, png), optimize=True)
        doc['sizes'][str(px)] = {
            'png': png, 'cell': [cw, ch], 'columns': cols, 'firstChar': FIRST,
            'originX': ox, 'baseline': base, 'ascent': ascent, 'descent': descent, 'advances': advances,
            # Line gap (hhea), added below each line: Arial from 16 px up.
            # Hinted advances (hdmx): how GDI spaces a field's glyphs when it draws them,
            # though Director lays fields out with `advances`.
            'hinted': hinted,
            'leading': mul_fix_round(tt['hhea'].lineGap, px, upm),
            # Anti-aliased runs sit this far below the line's top instead (Director's
            # own renderer: the unhinted winAscent, rounded).
            'aaAscent': mul_fix_round(os2.usWinAscent, px, upm),
        }
    with open(os.path.join(out_dir, f'{name}.json'), 'w') as f:
        json.dump(doc, f, separators=(',', ':'))


def main():
    src = sys.argv[1]
    out_dir = os.path.join(src, 'glyphs')
    os.makedirs(out_dir, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.lower().endswith('.ttf'):
            build(os.path.join(src, f), out_dir)
            print('glyphs:', f)


main()
