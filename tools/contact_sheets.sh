#!/bin/bash
# 用法: tools/contact_sheets.sh <影片id>  → .work/<id>/sheets/s_XX.jpg（每張 12 格畫面）
cd "$(dirname "$0")/../.work/$1" || exit 1
rm -rf sheets; mkdir -p sheets
ls frames | awk 'NR%12==1{n++} {print n" "$0}' | while read n f; do echo "file '$PWD/frames/$f'" >> sheets/l_$n.txt; done
for l in sheets/l_*.txt; do n=$(basename $l .txt | cut -d_ -f2); ffmpeg -loglevel error -y -f concat -safe 0 -i $l -vf "scale=400:-1,tile=4x3" -frames:v 1 sheets/s_$(printf %02d $n).jpg; done
ls sheets/*.jpg | wc -l
