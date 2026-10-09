#!/usr/bin/env bash
# Install ffmpeg on a GitHub runner without hanging the run (Oct 8: apt-get install stalled 10 min and failed the 1pm Reel;
# Oct 9: apt stalled again and johnvansickle.com served a non-archive page, so the static fallback failed too).
# apt once (short timeouts), then static builds from GitHub (BtbN) and johnvansickle, then apt one more time.
command -v ffmpeg >/dev/null && exit 0
apt_try() {
  timeout 90 sudo apt-get update -qq || true
  timeout 180 sudo apt-get install -y -qq ffmpeg > /dev/null && command -v ffmpeg >/dev/null && return 0
  sudo pkill -f apt-get || true; sudo dpkg --configure -a || true
  return 1
}
static_try() { # $1 = url, $2 = path of the bin dir inside the archive
  rm -rf /tmp/ffs && mkdir -p /tmp/ffs \
    && curl -fsSL --retry 2 --max-time 180 -o /tmp/ffs/ff.tar.xz "$1" \
    && tar -xJf /tmp/ffs/ff.tar.xz -C /tmp/ffs \
    && sudo cp /tmp/ffs/$2/ffmpeg /tmp/ffs/$2/ffprobe /usr/local/bin/ \
    && command -v ffmpeg >/dev/null
}
apt_try && exit 0
echo "apt ffmpeg failed — using a static build"
static_try https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz 'ffmpeg-master-latest-linux64-gpl/bin' && exit 0
static_try https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz 'ffmpeg-*-static' && exit 0
apt_try && exit 0
exit 1
