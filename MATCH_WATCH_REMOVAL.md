# Match watch — removal checklist

Temporary NOR vs SWE friendly test. When done, delete these and revert the small hooks marked `MATCH-WATCH`.

## Delete files

- `api/match-watch.js`
- `festival/match-watch-core.js`
- `festival/match-watch-client.js`
- `festival/MatchWatch.jsx`
- `scripts/dev-with-api.sh`
- `MATCH_WATCH_REMOVAL.md` (this file)

## Revert edits

- `index.html` — remove match-watch script tags + MatchWatch.jsx
- `festival/app.jsx` — remove `matchWatchEnabled`, `watchOn`, MatchWatch route
- `festival/StepShell.jsx` — remove match watch button + `matchwatch` reachable/flow exceptions
- `festival/styles.css` — remove `/* MATCH-WATCH */` block at end
- `.env.example` — remove match-watch comment lines (optional)
- `.claude/launch.json` — restore python http.server if desired

## Optional

- `vercel.json` — keep if useful for deploy; otherwise remove

Search: `MATCH-WATCH`, `matchwatch`, `match-watch`, `MatchWatch`
