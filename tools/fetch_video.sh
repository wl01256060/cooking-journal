#!/bin/bash
# 用法: tools/fetch_video.sh <YouTube網址> [--frames]
# 產出 .work/<id>/ ：meta.txt、description.txt、transcript.txt（字幕或 Whisper 轉錄）、frames/（選用）
set -e
URL="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ID=$(yt-dlp --print id "$URL" 2>/dev/null)
OUT="$ROOT/.work/$ID"
mkdir -p "$OUT" && cd "$OUT"

yt-dlp --skip-download --print "id: %(id)s
title: %(title)s
channel: %(channel)s
duration: %(duration)s
thumbnail: %(thumbnail)s" "$URL" > meta.txt 2>/dev/null
yt-dlp --skip-download --print description "$URL" > description.txt 2>/dev/null

# 1) 先試字幕（人工 > 自動）
yt-dlp --skip-download --write-subs --write-auto-subs \
  --sub-langs "zh-Hant,zh-TW,zh-HK,zh-Hans,zh-CN,zh,en" --sub-format vtt \
  -o "sub" "$URL" >/dev/null 2>&1 || true
SUB=$(ls sub*.vtt 2>/dev/null | head -1)
if [ -n "$SUB" ]; then
  grep -v -E '^(WEBVTT|Kind:|Language:|[0-9:.]+ -->|\s*$)' "$SUB" | sed 's/<[^>]*>//g' | awk '!seen[$0]++' > transcript.txt
  echo "transcript: subtitles ($SUB)"
else
  # 2) 沒字幕 → 下載音訊用 Whisper 轉錄
  yt-dlp -f bestaudio -x --audio-format wav --postprocessor-args "-ar 16000 -ac 1" -o "audio.%(ext)s" "$URL" >/dev/null 2>&1
  whisper-cli -m "$HOME/.cache/whisper/ggml-small.bin" -l zh -nt \
    --prompt "以下是繁體中文的料理教學影片，包含食材份量與步驟。" \
    -f audio.wav -otxt -of transcript >/dev/null 2>&1
  rm -f audio.wav
  echo "transcript: whisper"
fi

# 3) 選用：每 8 秒擷取一張畫面，用來讀畫面上的文字份量
if [ "$2" == "--frames" ]; then
  yt-dlp -f "bv*[height<=480]/bv*/b" -o "video.%(ext)s" "$URL" >/dev/null 2>&1
  mkdir -p frames
  ffmpeg -loglevel error -i video.* -vf "fps=1/8,scale=640:-1" frames/f_%03d.jpg
  rm -f video.*
  echo "frames: $(ls frames | wc -l)"
fi
echo "OUT=$OUT"
