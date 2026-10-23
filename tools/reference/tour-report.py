#!/usr/bin/env python3
"""Compare a paired tour's screenshots and write <outdir>/index.html.

  tools/reference/tour-report.py <outdir>

For each checkpoint: the reference (Adobe's player), dirplayer scaled to 800x600, and a
diff map (red where the two differ by more than a blurred per-channel threshold). The
score is the share of stage pixels that differ, worst first. A low score is not proof
of a match; read the pictures.
"""
import html
import json
import os
import sys
from PIL import Image, ImageChops, ImageFilter

out = sys.argv[1]
rows = []
for f in sorted(os.listdir(out)):
    if not f.endswith(".ref.png"):
        continue
    name = f[: -len(".ref.png")]
    emu_path = os.path.join(out, name + ".emu.png")
    if not os.path.exists(emu_path):
        continue
    ref = Image.open(os.path.join(out, f)).convert("RGB")
    emu = Image.open(emu_path).convert("RGB").resize(ref.size, Image.LANCZOS)
    emu.save(os.path.join(out, name + ".emu800.png"))
    a = ref.filter(ImageFilter.BoxBlur(1))
    b = emu.filter(ImageFilter.BoxBlur(1))
    d = ImageChops.difference(a, b)
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl).point(lambda v: 255 if v > 40 else 0)
    score = 100.0 * sum(1 for v in m.getdata() if v) / (ref.width * ref.height)
    heat = Image.blend(emu, Image.new("RGB", emu.size, (0, 0, 0)), 0.6)
    heat.paste((255, 40, 40), mask=m)
    heat.save(os.path.join(out, name + ".diff.png"))
    rows.append((score, name))

rows.sort(reverse=True)
json.dump([{"checkpoint": n, "diff_pct": round(s, 2)} for s, n in rows], open(os.path.join(out, "scores.json"), "w"), indent=1)
parts = ["<!doctype html><meta charset=utf-8><title>Tour</title><style>body{background:#111;color:#ddd;font:14px sans-serif}"
         "img{width:400px;image-rendering:pixelated;margin-right:6px}h2{margin:18px 0 4px}</style>",
         "<p>Reference (Adobe) | dirplayer | differences (red)</p>"]
for s, n in rows:
    parts.append(f"<h2>{html.escape(n)}: {s:.1f}% differs</h2>"
                 f"<a href='{n}.ref.png'><img src='{n}.ref.png'></a>"
                 f"<a href='{n}.emu800.png'><img src='{n}.emu800.png'></a>"
                 f"<a href='{n}.diff.png'><img src='{n}.diff.png'></a>")
errs = os.path.join(out, "emu-errors.txt")
if os.path.exists(errs) and open(errs).read().strip():
    parts.append("<h2>dirplayer console errors</h2><pre>" + html.escape(open(errs).read()) + "</pre>")
open(os.path.join(out, "index.html"), "w").write("\n".join(parts))
for s, n in rows:
    print(f"{s:6.2f}%  {n}")
