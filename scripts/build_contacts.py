"""Build docs/contacts.json: each member's Washington office phone and contact-form link.

Usage:
    python3 scripts/build_contacts.py [legislators-current.json]

Source: the public congress-legislators dataset
(https://github.com/unitedstates/congress-legislators), which covers sitting members.
Members are matched by chamber, state, last name and first name (nicknames allowed),
not by seat, so a newly elected member never inherits a predecessor's office.
Members who aren't sworn in yet get no entry; the site falls back to the Capitol switchboard.

Members of Congress don't publish email addresses. Email goes through the contact form on
each member's website, so `form` is that page:
- Senate: the dataset's contact_form, or a checked page from SENATE_FORMS below.
- House: <site>/contact, the House web platform's standard contact path. House sites block
  automated requests, so these links aren't checked by this script.
"""
import json, re, sys, unicodedata, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = "https://unitedstates.github.io/congress-legislators/legislators-current.json"

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


def main(src):
    if src:
        leg = json.loads(Path(src).read_text())
    else:
        leg = json.load(urllib.request.urlopen(SRC, timeout=60))
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
        if m["chamber"] == "Senate":
            form = t.get("contact_form") or SENATE_FORMS.get(m["name"]) or site
        else:
            form = site + "/contact" if site else ""
        out[f'{m["chamber"]}|{m["state"]}|{m["district"] or ""}|{m["name"]}'] = {"phone": t.get("phone", ""), "form": form, "site": site}

    dest = ROOT / "docs" / "contacts.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print(f"{len(out)} members with an office, {missing} not yet sworn in or undecided -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
