#!/usr/bin/env python3
"""Refresh data/usage.json from /workspace/tokenmax/usage.json; append history if new reading."""
import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "/workspace/tokenmax/usage.json"
DST = os.path.join(HERE, "data", "usage.json")
HIST = os.path.join(HERE, "data", "history.json")
ET = ZoneInfo("America/New_York")


def main():
    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    if not os.path.exists(SRC):
        raise SystemExit(f"missing {SRC}")
    raw = open(SRC, encoding="utf-8").read()
    usage = json.loads(raw)
    open(DST, "w", encoding="utf-8").write(json.dumps(usage, indent=2) + "\n")
    print(f"copied usage → {DST} (used_pct={usage.get('used_pct')}, checked_at={usage.get('checked_at')})")

    if not os.path.exists(HIST):
        return
    hist = json.load(open(HIST, encoding="utf-8"))
    points = hist.setdefault("points", [])
    t = usage.get("checked_at")
    used = usage.get("used_pct")
    if t is None or used is None:
        return
    # normalize compare key
    existing = {(p.get("t"), float(p.get("used_pct"))) for p in points if p.get("t") is not None}
    key = (t if "T" in str(t) else t, float(used))
    # also match if same used_pct and same clock hour loosely
    if any(float(p.get("used_pct", -1)) == float(used) and str(p.get("t", "")).startswith(str(t)[:13]) for p in points):
        print("history already has this reading")
        return
    # normalize t to ISO with offset if needed
    t_norm = t
    if isinstance(t, str) and len(t) >= 16 and t[16] in "+-" and ":" not in t[16:]:
        t_norm = t[:-2] + ":" + t[-2:]
    points.append({
        "t": t_norm,
        "used_pct": used,
        "source": "collect.py from /workspace/tokenmax/usage.json",
    })
    points.sort(key=lambda p: p.get("t") or "")
    hist["points"] = points
    hist["updated_at"] = datetime.now(ET).isoformat(timespec="seconds")
    open(HIST, "w", encoding="utf-8").write(json.dumps(hist, indent=2) + "\n")
    print(f"appended history point used_pct={used} t={t_norm}")


if __name__ == "__main__":
    main()
