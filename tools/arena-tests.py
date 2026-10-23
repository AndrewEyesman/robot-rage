#!/usr/bin/env python3
"""Write Playwright (MCP `browser_run_code_unsafe`) scripts for the Training
arena collision tests.

  tools/arena-tests.py reach --port 8091 > reach.js       # log in, open Training
  tools/arena-tests.py drive --port 8091 --plan plan.json > drive.js

`plan.json` comes from tools/drive-sweep-plan.py (a sweep of open-floor starts, or
--walls for approaches that end at a real wall). The drive script places the robot
at each start, holds Up, records how far it got along its heading, and POSTs the
rows to http://127.0.0.1:8099/<name>-<port>.json (any local receiver that saves the
body). Its return value summarises: blocked on clear paths (should be 0) and
passed through a wall (should be 0). Test logins use tester@home.lan; run them on
a second server instance, not the shared one on 8090.
"""
import argparse, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("kind", choices=["reach", "drive"])
ap.add_argument("--port", type=int, default=8091)
ap.add_argument("--plan")
ap.add_argument("--steps", type=int, default=8, help="90 ms samples while Up is held")
ap.add_argument("--name", default="drive")
a = ap.parse_args()
if a.kind == "reach":
    print(open(os.path.join(HERE, "arena-tests-reach.js.tmpl")).read().replace("__PORT__", str(a.port)))
else:
    t = open(os.path.join(HERE, "arena-tests-drive.js.tmpl")).read()
    print(t.replace("__PLAN__", json.dumps(json.load(open(a.plan)))).replace("__PORT__", str(a.port))
           .replace("__STEPS__", str(a.steps)).replace("__NAME__", a.name))
