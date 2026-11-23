"""Turn the research spreadsheet into site/data.json.

Usage:
    python3 scripts/export_data.py path/to/research.xlsx

Download the Sheet as .xlsx (Sheets page > download) and point this script at it.
It reads these tabs by their header names, so columns can be reordered:
Angles, Ideology defaults, Senate 120th, House 120th, State hooks.
"""
import json, re, sys
from pathlib import Path
import openpyxl

def table(wb, name):
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    head = [str(h).strip() if h is not None else "" for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(r):
            continue
        out.append({head[i]: ("" if v is None else str(v).strip()) for i, v in enumerate(r) if i < len(head) and head[i]})
    return out

def ids(s):
    return [x.strip() for x in re.split(r"[,;]", s or "") if re.fullmatch(r"A\d\d", x.strip())]

def main(src, dest):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    angles = [{
        "id": a["ID"], "name": a["Angle"],
        "policies": [p.strip() for p in a["Policies"].split(";") if p.strip()],
        "lines": {"RSI": a["RSI script line"], "OVS": a["Oversight script line"], "PAUSE": a["Pause script line"]},
        "receptive": a["Most receptive tags"], "evidence": a["Evidence / hook"],
    } for a in table(wb, "Angles")]
    ideo = {r["Tag"]: {"name": r["Meaning"], "defaults": ids(r["Default-checked angles"]), "avoid": r["Avoid / caution"], "notes": r["Notes"]}
            for r in table(wb, "Ideology defaults")}
    members = []
    for r in table(wb, "Senate 120th"):
        members.append({
            "chamber": "Senate", "state": r["State"], "district": None, "name": r["Senator"], "party": r["Party"],
            "status": r["Status"], "tag": r["Ideology tag"], "angles": ids(r["Default-checked angles"]),
            "specific": ids(r["Member-specific angles"]), "role": r.get("Role (119th unless noted)", ""),
            "record": r["AI record"], "ask": r["Suggested ask"], "confidence": r["Confidence"], "stance": "",
        })
    for r in table(wb, "House 120th"):
        st, _, num = r["District"].partition("-")
        members.append({
            "chamber": "House", "state": st, "district": int(num), "name": r["Member"], "party": r["Party"],
            "status": r["Status"], "tag": r["Ideology tag"], "angles": ids(r["Default-checked angles"]),
            "specific": ids(r["Member-specific angles"]), "role": "", "record": r["AI record"],
            "ask": r["Suggested ask"], "confidence": r["Confidence"], "stance": r.get("AI stance (tracker)", ""),
        })
    hooks = {}
    for r in table(wb, "State hooks"):
        st = r["State"].split(" ")[0]
        hooks.setdefault(st, []).append({"type": r["Type"], "text": r["What's happening"], "use": r["How to use it"], "angles": ids(r["Angles"])})
    data = {"generated_from": Path(src).name, "angles": angles, "ideology": ideo, "members": members, "hooks": hooks}
    Path(dest).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(angles)} angles, {len(members)} members, {len(hooks)} states with hooks -> {dest}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent / "site" / "data.json"))
