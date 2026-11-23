# Notes for Claude Code

- `site/` is plain HTML/JS with no framework and no build step. Keep it that way unless the user asks otherwise.
- `site/data.json` is generated. Change the spreadsheet and rerun `scripts/export_data.py` instead of editing it by hand.
- `generate.js` is pure (UMD: `window.Gen` / `module.exports`). Test message changes in Node: `node -e "const G=require('./site/generate.js'); ..."`
- Smoke test: serve `site/` on port 8765, then `node tests/smoke.js` (needs Playwright + Chrome).
- Messages should stay respectful and constituent-voiced, with no partisan attacks. Pause wording for Republicans stresses a verifiable deal that binds China.
- Ideology codes: PROG, DEM, MODD, POPR, MAINR, LIBR, MODR (+RELC overlay). Policy codes: RSI, OVS, PAUSE. Angles: A01–A29.
