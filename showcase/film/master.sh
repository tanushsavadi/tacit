#!/bin/bash
# Two-pass EBU R128 loudness mastering to -16 LUFS / -1.5 dBTP; video stream copied untouched.
set -euo pipefail
in="$1"; out="$2"
j=$(ffmpeg -hide_banner -nostats -i "$in" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$j" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$in" -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -c:a aac -b:a 256k -movflags +faststart "$out"
