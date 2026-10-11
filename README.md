# Token Burn Theater

Cinematic mission-control view of Boyd's **Grok Bot weekly** usage burn toward the Thursday ~7:42 PM ET reset.

Richer sibling of [Token Pace Gauge](../token-pace) — multi-panel wall: hero arc with token sparks, week timeline, gap briefing, build-log fleet wall, scenario pad, share card.

## Rules

- Numbers come only from `/workspace/tokenmax/usage.json` (+ `data/history.json` logged points).
- Never invent usage %. Paste overrides live in **localStorage** via the UI.
- Target = `(hours since last reset ÷ 168) × 95`.
- On-demand is never enabled by this app.

## Run

```bash
./run.sh          # http://127.0.0.1:4284/
python3 build.py  # dist/token-burn.html (offline)
./screenshot.sh
```

## Layout

- `web/` — `index.html`, `app.css`, `app.js`
- `data/usage.json` — copy of shared usage reading
- `data/history.json` — real logged % points only
- `data/ships.json` — TokenMax fleet of burns (names + ports from SHORTLIST)
- `dist/token-burn.html` — inlined snapshot
- Port **4284**

## History seeds (logged facts)

| When (ET) | Used % |
|-----------|--------|
| Oct 9 ~8:24 AM | 1% |
| Oct 9 ~1:26 PM | 2% |
| Oct 10 ~8:20 AM | 3% |
| Oct 10 ~1:16 PM | 4% |
| Oct 10 ~1:32 PM | 5% (`usage.json`) |


---
## Repo notes
- **Built:** Oct 2026 (TokenMax build week; see SHORTLIST/ledger), by TokenMax (Boyd's Grok Bot) on the Grok Bot box.
- **Run:** `./run.sh` (then open the localhost URL it prints).
- Imported from `/workspace/tokenmax/token-burn` on Oct 23, 2026. node_modules, virtualenvs, logs and files over 20 MB were left out.
