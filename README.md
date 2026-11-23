# Contact Congress on AI

A static site that finds your two senators and House representative from your address. It then drafts an email, a call script or an in-person meeting plan aimed at that member's ideology and AI record. You choose which asks to include (RSI limits, independent evaluators/oversight, an international pause) and which arguments to use.

## Layout

```
docs/            the deployable site (no build step)
  index.html     page + styles
  app.js         UI: address lookup, member cards, checkboxes, copy button
  generate.js    pure message generator (email / call / meeting, short / long); works in Node too
  data.json      angles, ideology defaults, 535 members, state hooks (generated, don't hand-edit)
scripts/
  export_data.py         research spreadsheet (.xlsx) -> docs/data.json
  research_snapshot.xlsx copy of the research Sheet this data came from
tests/
  smoke.js, kind.js      Playwright smoke tests against a local server
```

## Run locally

```
cd docs && python3 -m http.server 8000   # then open http://localhost:8000
```

Opening index.html as a `file://` page won't work, because the page has to `fetch("data.json")`.

## Updating the data

1. Edit the research Sheet (tabs: Angles, Ideology defaults, Senate, House (120th), Governors, State hooks).
2. Download it as .xlsx.
3. Run `python3 scripts/export_data.py path/to/file.xlsx`. This rewrites `docs/data.json`.

The exporter reads columns by header name, so renaming a header will break it.

## Address lookup: caveats

- It uses the U.S. Census geocoder through JSONP (no API key needed). Some hosts or CSPs block it. When it fails, the page falls back to a state + district picker plus a link to house.gov.
- Six states redrew their maps for 2026: CA, TX, MO, NC, OH and UT. Census data may lag, so the page warns users in those states to check their district. A more robust option is a district lookup that knows the 120th-Congress lines, such as Geocodio's `cd` field (needs a key, and calling it from a backend keeps the key private).
- DC and the territories aren't covered.

## Data caveats (as of 23 Nov 2026)

- LA-5 and LA-6 go to runoffs on Dec 12. Those cards stay disabled until the result rows are filled in.
- MN-1 may go to a recount.
- Ideology tags are heuristics for picking arguments, not ratings. "Confidence" means how much AI record we found.

## Hosting

Any static host works: GitHub Pages, Netlify, Cloudflare Pages. Point it at `docs/` (GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/docs`).

## Ideas for next steps

- Email delivery: congressional web forms can't be pre-filled, so the page tells users to copy and paste. Communicating with Congress (CWC) API access would allow direct submission.
- Add a mailing-list signup and an "I contacted them" counter (both need a backend).
- Add governors and state legislators (the governor data is already in the sheet).
