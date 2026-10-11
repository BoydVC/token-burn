#!/usr/bin/env python3
"""Token Burn Theater — stdlib server on 127.0.0.1:4284"""
import http.server
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("TOKEN_BURN_PORT", "4284"))


class H(http.server.BaseHTTPRequestHandler):
    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            path = os.path.join(HERE, "web", "index.html")
            return self.send(200, open(path, "rb").read(), "text/html; charset=utf-8")
        if p == "/app.css":
            return self.send(200, open(os.path.join(HERE, "web", "app.css"), "rb").read(), "text/css; charset=utf-8")
        if p == "/app.js":
            return self.send(200, open(os.path.join(HERE, "web", "app.js"), "rb").read(), "application/javascript; charset=utf-8")
        if p == "/data/usage.json":
            return self.send(200, open(os.path.join(HERE, "data", "usage.json"), "rb").read(), "application/json")
        if p == "/data/history.json":
            return self.send(200, open(os.path.join(HERE, "data", "history.json"), "rb").read(), "application/json")
        if p == "/data/ships.json":
            return self.send(200, open(os.path.join(HERE, "data", "ships.json"), "rb").read(), "application/json")
        if p == "/api/health":
            return self.send(200, json.dumps({"ok": True, "app": "token-burn", "port": PORT}).encode(), "application/json")
        if p == "/api/refresh":
            r = subprocess.run([sys.executable, os.path.join(HERE, "collect.py")], capture_output=True, text=True)
            body = json.dumps({"ok": r.returncode == 0, "out": (r.stdout or "")[-400:], "err": (r.stderr or "")[-200:]}).encode()
            return self.send(200 if r.returncode == 0 else 500, body, "application/json")
        self.send(404, b"not found", "text/plain")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.chdir(HERE)
    print(f"Token Burn Theater on http://127.0.0.1:{PORT}/", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
