#!/usr/bin/env python3
"""標記一道料理完成：壓縮照片 → 存到 images/ → 在 recipes.json 新增一筆完成紀錄。

用法：
  python3 tools/complete.py <recipe_id> <照片路徑> [--date 2026-10-05]
      [--note 心得] [--improve 下次想改進] [--variation 自己的改良] [--rating 1-5]
"""
import argparse, datetime, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "recipes.json")

p = argparse.ArgumentParser()
p.add_argument("recipe_id")
p.add_argument("photo", nargs="?")
p.add_argument("--date", default=datetime.date.today().isoformat())
p.add_argument("--note", default="")
p.add_argument("--improve", default="")
p.add_argument("--variation", default="")
p.add_argument("--rating", type=int)
a = p.parse_args()

recipes = json.load(open(DATA, encoding="utf-8"))
r = next((x for x in recipes if x["id"] == a.recipe_id), None)
if not r:
    sys.exit(f"找不到 recipe id：{a.recipe_id}\n可用：" + ", ".join(x["id"] for x in recipes))

entry = {"date": a.date}
if a.photo:
    base = f"{r['id']}-{a.date.replace('-', '')}"
    name, n = f"{base}.jpg", 2
    while os.path.exists(os.path.join(ROOT, "images", name)):
        name, n = f"{base}-{n}.jpg", n + 1
    out = os.path.join(ROOT, "images", name)
    # macOS sips：轉 JPEG（支援 HEIC）、長邊 1400px、品質 80
    info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", a.photo],
                          check=True, capture_output=True, text=True).stdout
    longest = max(int(l.split(":")[1]) for l in info.splitlines() if "pixel" in l)
    resize = ["-Z", "1400"] if longest > 1400 else []
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", *resize,
                    a.photo, "--out", out], check=True, capture_output=True)
    entry["photo"] = f"images/{name}"
for k in ("note", "improve", "variation"):
    if getattr(a, k):
        entry[k] = getattr(a, k)
if a.rating:
    entry["rating"] = max(1, min(5, a.rating))

r.setdefault("completions", []).append(entry)
r["completions"].sort(key=lambda c: c["date"])
with open(DATA, "w", encoding="utf-8") as f:
    json.dump(recipes, f, ensure_ascii=False, indent=2)
    f.write("\n")

total = sum(len(x.get("completions", [])) for x in recipes)
print(f"✓ {r['name']} 完成（這道第 {len(r['completions'])} 次，累計 {total} 次）", entry)
