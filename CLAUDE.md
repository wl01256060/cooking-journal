# 料理人之路 — 工作流程

個人料理學習紀錄網站（純靜態，GitHub Pages）。使用者用繁體中文溝通。
所有成就都在 `js/app.js` 的 `compute()` 由資料即時計算，不存檔。

## 資料
- `data/recipes.json`：食譜陣列（唯一資料來源）。欄位參考現有的 `tomato-scrambled-eggs`。
  - `techniques` 只能用：煎 炒 煮 燉 烤 蒸 炸 拌 滷 烘焙（技能樹）
  - `seasons`：只有真的是當季料理才填（春/夏/秋/冬），用於四季徽章；不分季節就給 `[]`
  - `difficulty`：1 簡單 / 2 中等 / 3 挑戰
  - 不要寫調理時間（沒有 `time` 欄位，使用者不需要）
  - `pending`：影片沒講清楚、需要使用者確認的事項
- `data/config.json`：起算日、休假券、稱號、獎勵、`claims`（已兌現的獎勵）

## 1. 使用者給 YouTube 網址 → 新增食譜
1. `tools/fetch_video.sh <url>`（份量只出現在畫面上時加 `--frames`）
   → `.work/<id>/` 內有 meta.txt、description.txt、transcript.txt（字幕或 Whisper 轉錄）、frames/
2. 看畫面：`ffmpeg -pattern_type glob -i '.work/<id>/frames/*.jpg' -vf "scale=320:-1,tile=5x6" -frames:v 1 .work/<id>/sheet.jpg` 再讀圖
3. 整理成一筆 recipe 加到 `data/recipes.json`（id 用英文 kebab-case，`addedAt` 填今天）。Whisper 會有錯字，要依常識校正。
4. commit + push

## 2. 使用者給完成照片 → 標記完成
`python3 tools/complete.py <recipe_id> <照片> [--date YYYY-MM-DD] [--note ..] [--improve ..] [--variation ..] [--rating 1-5]`
（自動壓縮、支援 HEIC）。完成後告訴使用者：累計次數、熟練度、有沒有解鎖新獎勵／徽章／稱號、離下一個獎勵還差幾道。
然後 commit + push。

## 3. 兌現獎勵
在 `config.json` 的 `claims` 加上 `"<reward key>": { "date": "YYYY-MM-DD" }`。
key：累計型用 id（如 `c26`），每年型用 `attendance-2027`、`seasons-2027`。

## 預覽
`python3 -m http.server 8765` 後開 http://localhost:8765（加 `?demo` 看假資料）。
改了 css/js 要把 index.html 裡的 `?v=` 版本號加一，避免快取。
