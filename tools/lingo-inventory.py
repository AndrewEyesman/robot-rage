#!/usr/bin/env python3
"""List the Director features the game's Lingo uses.

Reads ProjectorRays bytecode listings (*.lasm) from a decompile folder and
prints, per category, every Director name the scripts touch with a use count
and the movies that use it. Only API names are printed, never game code.

  tools/lingo-inventory.py <decomp dir> [--json] [--director-names <builtin.rs>]

A name the game also defines (handler, property, global or #symbol) counts as a game
name unless it is a Director name. Director names are read from dirplayer's built-in
symbol table (vendor/dirplayer-rs/vm-rust/src/player/symbols/builtin.rs by default).

Categories:
  call      global calls (extcall) that no game script defines: builtins
  method    method calls (objcall), e.g. copyPixels, addModifier
  prop      properties read or written on objects (getobjprop, setobjprop,
            getchainedprop), e.g. loc, worldPosition
  the       `the ...` entities and movie properties
  event     Director event handlers the scripts define (on exitFrame, ...)
  operator  sprite operators (intersects, within) and chunk/tell forms
"""
import json
import os
import re
import sys
from collections import defaultdict

EVENTS = {
    "activateapplication", "activatewindow", "beginsprite", "closewindow",
    "cuepassed", "deactivateapplication", "deactivatewindow", "endsprite",
    "enterframe", "exitframe", "idle", "keydown", "keyup", "mousedown",
    "mouseenter", "mouseleave", "mouseup", "mouseupoutside", "mousewithin",
    "movewindow", "openwindow", "prepareframe", "preparemovie",
    "resizewindow", "rightmousedown", "rightmouseup", "startmovie",
    "stepframe", "stopmovie", "streamstatus", "timeout", "zoomwindow",
    "getpropertydescriptionlist", "getbehaviordescription", "isokaytoattach",
    "runpropertydialog", "new", "on", "alerthook", "evalscript",
}

LINE = re.compile(r"^\s*\[\s*\d+\]\s+(\w+)(?:\s+\S+)?\s+\.*\s*(.*)$")
IDENT = r"[A-Za-z_][A-Za-z0-9_]*"


def movie_of(path, root):
    rel = os.path.relpath(path, root)
    return rel.split(os.sep)[0]


def defined_handlers(root):
    names = set()
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.endswith(".ls"):
                with open(os.path.join(dirpath, f), encoding="latin-1") as fh:
                    for line in fh:
                        m = re.match(r"\s*on\s+(" + IDENT + ")", line)
                        if m:
                            names.add(m.group(1).lower())
    return names


def game_names(root):
    """Names the game itself defines: handlers, script properties, globals and
    property-list keys (#name). Methods and properties with these names go
    through generic Lingo machinery (script instances, property lists)."""
    names = set()
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(".ls"):
                continue
            with open(os.path.join(dirpath, f), encoding="latin-1") as fh:
                for line in fh:
                    m = re.match(r"\s*on\s+(" + IDENT + ")", line)
                    if m:
                        names.add(m.group(1).lower())
                    m = re.match(r"\s*(?:property|global)\s+(.*)", line)
                    if m:
                        names.update(n.strip().lower() for n in m.group(1).split(","))
                    names.update(n.lower() for n in re.findall(r"#(" + IDENT + ")", line))
    return names


def scan(root):
    user = defined_handlers(root)
    uses = defaultdict(lambda: defaultdict(lambda: [0, set()]))

    def add(cat, name, movie):
        entry = uses[cat][name]
        entry[0] += 1
        entry[1].add(movie)

    for dirpath, _, files in os.walk(root):
        for f in files:
            path = os.path.join(dirpath, f)
            movie = movie_of(path, root)
            if f.endswith(".ls"):
                with open(path, encoding="latin-1") as fh:
                    for line in fh:
                        m = re.match(r"\s*on\s+(" + IDENT + ")", line)
                        if m and m.group(1).lower() in EVENTS:
                            add("event", m.group(1), movie)
                continue
            if not f.endswith(".lasm"):
                continue
            with open(path, encoding="latin-1") as fh:
                for raw in fh:
                    m = LINE.match(raw)
                    if not m:
                        continue
                    op, text = m.group(1), m.group(2).strip()
                    expr = text[1:-1] if text.startswith("<") and text.endswith(">") else text
                    if op in ("extcall", "localcall"):
                        n = re.match(r"(" + IDENT + r")\s*\(", expr)
                        if n and op == "extcall" and n.group(1).lower() not in user:
                            add("call", n.group(1), movie)
                    elif op == "objcall":
                        n = re.match(r"(?:.*?\.)?(" + IDENT + r")\s*\(", expr)
                        if n:
                            add("method", n.group(1), movie)
                    elif op in ("getobjprop", "getchainedprop"):
                        n = re.search(r"\.(" + IDENT + r")\s*$", expr)
                        if n:
                            add("prop", n.group(1), movie)
                    elif op == "setobjprop":
                        lhs = expr.split("=")[0].strip()
                        n = re.search(r"\.(" + IDENT + r")\s*$", lhs)
                        if n:
                            add("prop", n.group(1), movie)
                    elif op in ("getmovieprop", "setmovieprop", "thebuiltin", "get", "set"):
                        n = re.search(r"\bthe\s+(" + IDENT + r")", expr)
                        if n:
                            add("the", n.group(1), movie)
                    elif op == "gettoplevelprop":
                        add("the", expr.strip(), movie)
                    elif op == "ontospr":
                        n = re.search(r"\b(intersects|within)\b", expr)
                        add("operator", n.group(1) if n else "ontospr?", movie)
                    elif op in ("starttell", "tellcall"):
                        add("operator", "tell", movie)
                    elif op in ("putchunk", "deletechunk", "getchunk"):
                        add("operator", op, movie)
    return uses


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    uses = scan(sys.argv[1])
    out = {
        cat: {
            # Lingo names are case-insensitive: merge spellings.
            name: {"count": c, "movies": sorted(m)}
            for name, (c, m) in sorted(items.items(), key=lambda kv: -kv[1][0])
        }
        for cat, items in uses.items()
    }
    game = game_names(sys.argv[1])
    builtin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vendor", "dirplayer-rs",
                           "vm-rust", "src", "player", "symbols", "builtin.rs")
    if "--director-names" in sys.argv:
        builtin = sys.argv[sys.argv.index("--director-names") + 1]
    if os.path.exists(builtin):
        director = {n.lower() for n in re.findall(r'"([A-Za-z0-9_]+)"\s*=>', open(builtin).read())}
        game -= director
    merged = {}
    for cat, items in out.items():
        by_lower = {}
        for name, info in items.items():
            key = name.lower()
            if key in by_lower:
                by_lower[key]["count"] += info["count"]
                by_lower[key]["movies"] = sorted(set(by_lower[key]["movies"]) | set(info["movies"]))
            else:
                by_lower[key] = {"name": name, **info}
                if cat in ("method", "prop"):
                    by_lower[key]["game"] = key in game
        merged[cat] = sorted(by_lower.values(), key=lambda v: -v["count"])
    if "--json" in sys.argv:
        json.dump(merged, sys.stdout, indent=1)
        return
    for cat in ("call", "method", "prop", "the", "event", "operator"):
        items = merged.get(cat, [])
        print(f"## {cat} ({len(items)})")
        for v in items:
            tag = "game " if v.get("game") else ""
            print(f"{v['count']:6}  {tag}{v['name']:28} {' '.join(m.split('.')[0] for m in v['movies'])}")
        print()


if __name__ == "__main__":
    main()
