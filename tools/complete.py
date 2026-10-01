#!/usr/bin/env python3
"""標記一道料理完成：壓縮照片 → 存到 images/ → 在 recipes.json 新增一筆完成紀錄。

用法：
  python3 tools/complete.py <recipe_id> <照片路徑> [--date 2026-10-05]
      [--note 心得] [--improve 下次想改進] [--variation 自己的改良] [--rating 1-5]

沒有食譜的料理（自由料理）：recipe_id 不存在時加上 --name，會自動建立一筆 freestyle 食譜
  python3 tools/complete.py fried-rice-oct 照片.heic --name 冰箱清倉炒飯 --emoji 🍳 \
      --category 家常菜 --techniques 炒 [--ingredients 白飯,雞蛋,蔥] [--seasons 秋] \
      [--difficulty 1] [--description 一句話介紹]
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
# 自由料理（沒有食譜）用
p.add_argument("--name")
p.add_argument("--emoji", default="🍽️")
p.add_argument("--category", default="自由料理")
p.add_argument("--techniques", default="", help="逗號分隔：煎,炒,煮,燉,烤,蒸,炸,拌,滷,烘焙")
p.add_argument("--seasons", default="", help="逗號分隔：春,夏,秋,冬")
p.add_argument("--ingredients", default="", help="逗號分隔的食材名稱")
p.add_argument("--difficulty", type=int)
p.add_argument("--description", default="")
a = p.parse_args()
split = lambda s: [x.strip() for x in s.replace("，", ",").split(",") if x.strip()]

recipes = json.load(open(DATA, encoding="utf-8"))
r = next((x for x in recipes if x["id"] == a.recipe_id), None)
if not r and a.name:
    TECH = {"煎", "炒", "煮", "燉", "烤", "蒸", "炸", "拌", "滷", "烘焙"}
    bad = set(split(a.techniques)) - TECH
    if bad:
        sys.exit(f"技法只能用：{'、'.join(sorted(TECH))}（收到：{'、'.join(bad)}）")
    r = {"id": a.recipe_id, "name": a.name, "emoji": a.emoji, "category": a.category,
         "freestyle": True, "techniques": split(a.techniques), "seasons": split(a.seasons),
         "ingredients": [{"group": "", "items": [{"name": x} for x in split(a.ingredients)]}] if a.ingredients else [],
         "steps": [], "tips": [], "addedAt": a.date, "completions": []}
    if a.difficulty:
        r["difficulty"] = a.difficulty
    if a.description:
        r["description"] = a.description
    recipes.append(r)
    print(f"＋ 新增自由料理：{a.name}")
if not r:
    sys.exit(f"找不到 recipe id：{a.recipe_id}\n可用：" + ", ".join(x["id"] for x in recipes) + "\n（沒有食譜的料理請加 --name 建立自由料理）")

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
