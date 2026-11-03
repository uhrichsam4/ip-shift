#!/bin/zsh
# IP SHIFT launch film: build .blend, render segments straight to H.264 (3 parallel EEVEE jobs), assemble with audio.
# Usage: film/scripts/assemble.sh [--no-build] [--no-render]
set -e; setopt nullglob
FILM="${0:A:h:h}"; ROOT="${FILM:h}"
B=/Applications/Blender.app/Contents/MacOS/Blender; FF=/opt/homebrew/bin/ffmpeg
FPS=${FPS:-30}; export FILM_SAMPLES=${FILM_SAMPLES:-8}
if [[ "$*" != *--no-build* ]]; then
  python3 "$FILM/scripts/make_audio.py"
  $B -b --factory-startup -P "$FILM/scripts/build_film.py" -- --fps $FPS
fi
if [[ "$*" != *--no-render* ]]; then
  rm -f "$FILM"/renders/part_*.mp4
  # scene:start:end (global frames at 30 fps; each scene split in two)
  JOBS=(S3_Technology:451:600 S3_Technology:601:750 S4_Product:751:915 S4_Product:916:1080 S2_Network:181:315 S2_Network:316:450
        S1_Reveal:1:90 S1_Reveal:91:180 S5_Brand:1081:1170 S5_Brand:1171:1260)
  run() { for j in "$@"; do parts=(${(s/:/)j}); $B -b "$FILM/source/ip_shift_launch.blend" -S $parts[1] -s $parts[2] -e $parts[3] -o "//../renders/part_" -a > "$FILM/renders/log_$parts[2].txt" 2>&1; echo "done $j"; done; }
  run $JOBS[1] $JOBS[4] $JOBS[7] $JOBS[10] &
  run $JOBS[2] $JOBS[5] $JOBS[8] &
  run $JOBS[3] $JOBS[6] $JOBS[9] &
  wait
fi
cd "$FILM/renders"
ls part_*.mp4 | sort | sed "s/^/file '/; s/$/'/" > concat.txt
$FF -y -hide_banner -loglevel error -f concat -safe 0 -i concat.txt -loop 1 -i "$FILM/captures/caption_overlay.png" -i "$FILM/audio/ip_shift_launch_mix.wav" \
  -filter_complex "[1:v]format=rgba,fade=in:st=25.4:d=0.5:alpha=1,fade=out:st=35.4:d=0.5:alpha=1[cap];[0:v][cap]overlay=0:0:enable='between(t,25,36)':shortest=1,fade=out:st=41.0:d=1.0,format=yuv420p[v]" \
  -map "[v]" -map 2:a -c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p -r $FPS -c:a aac -b:a 320k -ar 48000 -t 42 -movflags +faststart "$FILM/IP-SHIFT-LAUNCH.mp4"
echo "wrote $FILM/IP-SHIFT-LAUNCH.mp4"
