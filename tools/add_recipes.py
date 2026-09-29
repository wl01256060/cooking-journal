import json, sys
"""把一個 JSON 檔（食譜陣列）加進 data/recipes.json。用法：python3 tools/add_recipes.py <file.json>"""
import os
p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "recipes.json")
def add(new):
    rs = json.load(open(p, encoding="utf-8"))
    ids = {r["id"] for r in rs}
    for r in new:
        assert r["id"] not in ids, r["id"]
        r.setdefault("addedAt", "2026-09-29"); r.setdefault("completions", []); r.setdefault("tips", [])
        rs.append(r); ids.add(r["id"])
    json.dump(rs, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2); open(p, "a").write("\n")
    print("total", len(rs), [r["name"] for r in new])
if __name__ == "__main__":
    add(json.load(open(sys.argv[1], encoding="utf-8")))
