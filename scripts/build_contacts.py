"""Build docs/contacts.json: each member's Washington office phone and contact-form link.

Usage:
    python3 scripts/build_contacts.py [legislators-current.json [legislators-district-offices.json]]

Source: the public congress-legislators dataset
(https://github.com/unitedstates/congress-legislators), which covers sitting members.
Members are matched by chamber, state, last name and first name (nicknames allowed),
not by seat, so a newly elected member never inherits a predecessor's office.
Members who aren't sworn in yet get no entry; the site falls back to the Capitol switchboard.

Members of Congress don't publish email addresses. Email goes through the contact form on
each member's website, so `form` is that page:
- Senate: a checked page from SENATE_FORMS below, else the dataset's contact_form.
- House: a checked page from HOUSE_FORMS below, else <site>/contact, the House web platform's
  standard contact path. This script doesn't check links; on 26 Nov 2026 every form, site and
  meeting link was checked with browser-like requests and the exceptions were added below.

For in-person meetings:
- `meeting`: a senator's meeting/scheduling request page, found by scanning their site's links.
  House sites can't be scanned (they block automated requests), so House members have none.
- `offices`: district/state offices (address, phone, coordinates) from the same project's
  legislators-district-offices.json.
"""
import json, re, sys, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
OFFICES = "https://unitedstates.github.io/congress-legislators/legislators-district-offices.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
LINK = re.compile(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', re.I | re.S)


def fetch(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20)
        return r.geturl(), r.read(600000).decode("utf-8", "ignore")
    except Exception:
        return url, ""


def meeting_page(pages):
    """First link on the member's site or contact page that is a meeting/scheduling request."""
    for page in pages:
        if not page:
            continue
        base, html = fetch(page)
        for href, text in LINK.findall(html):
            label = re.sub(r"<[^>]+>|\s+", " ", text)
            both = href + " " + label
            if re.search(r"request|schedule.a.meeting", both, re.I) and re.search(r"meet|schedul", both, re.I) \
                    and not re.search(r"tour|flag|newsletter|town.?hall|event|hearing|press|mobile", both, re.I):
                return urllib.parse.urljoin(base, href)
    return ""

# Senators whose dataset entry has no contact_form (checked by hand, Nov 2026).
SENATE_FORMS = {
    "Ruben Gallego": "https://www.gallego.senate.gov/connect/",
    "Adam Schiff": "https://www.schiff.senate.gov/contact/",
    "Lisa Blunt Rochester": "https://www.bluntrochester.senate.gov/contact/",
    "Ashley Moody": "https://www.moody.senate.gov/contact-us/",
    "Jim Banks": "https://www.banks.senate.gov/contact/",
    "Angela Alsobrooks": "https://www.alsobrooks.senate.gov/contact/",
    "Elissa Slotkin": "https://www.slotkin.senate.gov/contact/",
    "Tim Sheehy": "https://www.sheehy.senate.gov/contact/",
    "Andy Kim": "https://www.kim.senate.gov/contact/",
    "Bernie Moreno": "https://www.moreno.senate.gov/contact/",
    "Dave McCormick": "https://www.mccormick.senate.gov/contact/",
    "John Curtis": "https://www.curtis.senate.gov/contact/",
    "Jim Justice": "https://www.justice.senate.gov/contact/",
}
# House members whose site doesn't use the standard /contact path (checked by hand, Nov 2026).
HOUSE_FORMS = {
    "Austin Scott": "https://austinscott.house.gov/contact-austin",
    "Jim Clyburn": "https://clyburn.house.gov/email-me/",
    "Terri Sewell": "https://sewell.house.gov/email-me",
    "Frank Pallone": "https://palloneforms.house.gov/contact/",
}
NICK = {"jim": "james", "bill": "william", "bob": "robert", "rob": "robert", "tom": "thomas", "mike": "michael",
        "hal": "harold", "maggie": "margaret", "lou": "luis", "chris": "christopher", "dan": "daniel", "dave": "david",
        "joe": "joseph", "chuck": "charles", "dick": "richard", "rick": "richard", "jack": "john", "tim": "timothy",
        "steve": "stephen", "greg": "gregory", "nick": "nicholas", "ben": "benjamin", "pat": "patrick", "andy": "andrew",
        "ken": "kenneth", "don": "donald", "ron": "ronald", "sam": "samuel", "matt": "matthew", "ed": "edward",
        "jeff": "jeffrey", "pete": "peter", "liz": "elizabeth", "debbie": "deborah"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().replace("-", " ")
    return re.sub(r"[^a-z ]", "", s)


def name_words(s):
    return [w for w in norm(re.sub(r"\(.*?\)", "", s)).split() if w not in {"jr", "sr", "ii", "iii", "iv"}]


def first_ok(first, x):
    n = x["name"]
    toks = set(norm(" ".join(str(n.get(k) or "") for k in ("first", "middle", "nickname", "official_full"))).split())
    return any(t.startswith(first) or (len(t) >= 3 and first.startswith(t)) for t in toks) or NICK.get(first) in toks


def load(path, url):
    return json.loads(Path(path).read_text()) if path else json.load(urllib.request.urlopen(url, timeout=60))


def main(src, offices_src):
    leg = load(src, SRC)
    offices = {x["id"]["bioguide"]: x["offices"] for x in load(offices_src, OFFICES)}
    data = json.loads((ROOT / "docs" / "data.json").read_text())

    by = defaultdict(dict)
    for x in leg:
        t = x["terms"][-1]
        ch = "Senate" if t["type"] == "sen" else "House"
        for s in (x["name"]["last"], x["name"].get("official_full") or x["name"]["last"]):
            w = norm(s).split()
            if w:
                by[(ch, t["state"], w[-1])][x["id"]["bioguide"]] = x

    out, missing = {}, 0
    for m in data["members"]:
        w = name_words(m["name"])
        hits = [x for x in by[(m["chamber"], m["state"], w[-1])].values() if first_ok(w[0], x)] if w else []
        if len(hits) != 1:
            missing += 1
            continue
        t = hits[0]["terms"][-1]
        site = (t.get("url") or "").rstrip("/")
        # Hand-checked pages win: some dataset links point at a homepage that refuses requests.
        if m["chamber"] == "Senate":
            form = SENATE_FORMS.get(m["name"]) or t.get("contact_form") or site
        else:
            form = HOUSE_FORMS.get(m["name"]) or (site + "/contact" if site else "")
        offs = [{"city": o.get("city", ""), "address": ", ".join(str(x) for x in (o.get("building"), o.get("address"), o.get("suite")) if x),
                 "zip": str(o.get("zip") or ""), "phone": o.get("phone", ""), "lat": o.get("latitude"), "lon": o.get("longitude")}
                for o in offices.get(hits[0]["id"]["bioguide"], []) if o.get("address")]
        out[f'{m["chamber"]}|{m["state"]}|{m["district"] or ""}|{m["name"]}'] = {
            "phone": t.get("phone", ""), "form": form, "site": site, "meeting": "", "offices": offs}

    senate = [k for k in out if k.startswith("Senate")]
    with ThreadPoolExecutor(12) as ex:
        for k, url in zip(senate, ex.map(lambda k: meeting_page([out[k]["site"], out[k]["form"]]), senate)):
            out[k]["meeting"] = url
    print(f'{sum(1 for k in senate if out[k]["meeting"])} of {len(senate)} senators have a meeting-request page')

    dest = ROOT / "docs" / "contacts.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(out)} members with an office, {missing} not yet sworn in or undecided -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None, sys.argv[2] if len(sys.argv) > 2 else None)
