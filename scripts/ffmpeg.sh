#!/usr/bin/env bash
# Install ffmpeg on a GitHub runner without hanging the run (Oct 8: apt-get install stalled 10 min and failed the 1pm Reel).
# apt first (short timeouts, 2 tries), then a static build as a fallback.
command -v ffmpeg >/dev/null && exit 0
for i in 1 2; do
  timeout 120 sudo apt-get update -qq || true
  timeout 240 sudo apt-get install -y -qq ffmpeg > /dev/null && command -v ffmpeg >/dev/null && exit 0
  sudo pkill -f apt-get || true; sudo dpkg --configure -a || true
done
echo "apt ffmpeg failed — using the static build"
for i in 1 2 3; do
  curl -fsSL --max-time 180 -o /tmp/ff.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    && tar -xJf /tmp/ff.tar.xz -C /tmp && sudo cp /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe /usr/local/bin/ && exit 0
  sleep 10
done
exit 1
