#!/usr/bin/env python3
"""Plan a driving sweep for the Training arena: open-floor start points and, per
heading, how far the robot can go before it reaches a wall in the real collision
maps (alpha), per the reference in collision-sweep.py.

  tools/drive-sweep-plan.py --dump /tmp/dump --step 60 > plan.json
"""
import argparse, importlib.util, json, math, os

spec = importlib.util.spec_from_file_location("cs", os.path.join(os.path.dirname(__file__), "collision-sweep.py"))
cs = importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)

# heading (deg) -> collision map that stops motion in that direction (robot behavior:
# 15 when dx < 0, 16 when dx > 0, 17 when dy < 0, 18 when dy > 0)
HEADINGS = {0: 16, 90: 18, 180: 15, 270: 17}
FENCES = [(1390, 299, 1391, 468), (1382, 299, 1383, 468)]   # sprites 25/26, copy ink
AVOID = [(921, 403, 999, 475), (1179, 47, 1223, 139)]       # firepit (5), pit (6)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", required=True)
    ap.add_argument("--step", type=int, default=60)
    ap.add_argument("--reach", type=int, default=90, help="map px to look ahead")
    ap.add_argument("--walls", type=int, default=0,
                    help="instead: N random starts per heading whose path meets a real wall 12-24 px ahead")
    a = ap.parse_args()
    robot = cs.load_mask(f"{a.dump}/m52-matte.png", 128)
    maps = {s: cs.Shape(cs.MAP_RECT, cs.MAP_RECT[:2], 0, cs.load_mask(f"{a.dump}/m{m}-alpha.png", 1)) for s, m in cs.MAPS.items()}
    solid = lambda r: cs.Shape(r, r[:2], 0, (1, 1, [[True]]))
    fences = [solid(r) for r in FENCES]
    avoid = [solid((l - 30, t - 30, r + 30, b + 30)) for l, t, r, b in AVOID]
    samples = []
    if a.walls:
        import random
        rnd = random.Random(2)
        for heading, wall in HEADINGS.items():
            found = tries = 0
            while found < a.walls and tries < 4000:
                tries += 1
                mx, my = rnd.randrange(860, 1560), rnd.randrange(-150, 560)
                r0 = cs.robot_shape(mx, my, heading, robot)
                if any(cs.intersects(r0, m) for m in maps.values()) or any(cs.intersects(r0, f) for f in fences + avoid):
                    continue
                hit = None
                for d in range(2, 31, 2):
                    x = mx + d * math.cos(math.radians(heading)); y = my + d * math.sin(math.radians(heading))
                    r = cs.robot_shape(x, y, heading, robot)
                    if any(cs.intersects(r, f) for f in fences + avoid):
                        hit = "other"; break
                    if cs.intersects(r, maps[wall]):
                        hit = d; break
                if isinstance(hit, int) and 12 <= hit <= 24:
                    samples.append({"mx": mx, "my": my, "heading": heading, "clear": hit - 2}); found += 1
        json.dump(samples, __import__("sys").stdout)
        return
    for my in range(-120, 540, a.step):
        for mx in range(880, 1540, a.step):
            for heading, wall in HEADINGS.items():
                rob = cs.robot_shape(mx, my, heading, robot)
                if any(cs.intersects(rob, m) for m in maps.values()) or any(cs.intersects(rob, f) for f in fences + avoid):
                    continue
                clear = a.reach
                for d in range(2, a.reach + 1, 2):
                    x = mx + d * math.cos(math.radians(heading)); y = my + d * math.sin(math.radians(heading))
                    r = cs.robot_shape(x, y, heading, robot)
                    if cs.intersects(r, maps[wall]) or any(cs.intersects(r, f) for f in fences + avoid):
                        clear = d - 2; break
                samples.append({"mx": mx, "my": my, "heading": heading, "clear": clear})
    json.dump(samples, __import__("sys").stdout)

main()
