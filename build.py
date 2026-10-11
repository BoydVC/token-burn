#!/usr/bin/env python3
"""Inline web/ + data/ into dist/token-burn.html (offline snapshot)."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(HERE, "web")
D = os.path.join(HERE, "data")

subprocess.run([sys.executable, os.path.join(HERE, "collect.py")], check=False)

usage = json.load(open(os.path.join(D, "usage.json"), encoding="utf-8"))
history = json.load(open(os.path.join(D, "history.json"), encoding="utf-8"))
ships = json.load(open(os.path.join(D, "ships.json"), encoding="utf-8"))
bundle = {"usage": usage, "history": history, "ships": ships}
data_js = json.dumps(bundle, separators=(",", ":")).replace("</", "<\\/")

html = open(os.path.join(W, "index.html"), encoding="utf-8").read()
css = open(os.path.join(W, "app.css"), encoding="utf-8").read()
js = open(os.path.join(W, "app.js"), encoding="utf-8").read().replace("</script", "<\\/script")

html = html.replace('<link rel="stylesheet" href="app.css" />', "<style>\n" + css + "\n</style>")
html = html.replace(
    '<script src="app.js"></script>',
    f"<script>window.__DATA__={data_js};</script>\n<script>\n{js}\n</script>",
)
assert 'href="app.css"' not in html and 'src="app.js"' not in html

os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
out = os.path.join(HERE, "dist", "token-burn.html")
open(out, "w", encoding="utf-8").write(html)
print(f"wrote {out} ({os.path.getsize(out):,} bytes)")
