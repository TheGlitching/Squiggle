#!/bin/bash
#
# Normalise a screenshot to the 1280x800 the Chrome Web Store accepts.
#
# The store wants full bleed at exactly 1280x800 or 640x400. A browser window is
# rarely 16:10, and the obvious `sips -c 800 1280` pads a too-short image with
# borders rather than cropping it - which is precisely the padding the store asks
# you not to submit. So this crops to 16:10 first, then scales, leaving no border
# and no distortion.
#
# Usage: scripts/store-screenshot.sh ~/Desktop/shot.png [out.png]
set -euo pipefail

src="${1:?usage: store-screenshot.sh <screenshot.png> [out.png]}"
out="${2:-${src%.*}-1280x800.png}"

read -r width height < <(
  sips -g pixelWidth -g pixelHeight "$src" |
    awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}'
)

if [ -z "$width" ] || [ -z "$height" ]; then
  echo "could not read the dimensions of $src" >&2
  exit 1
fi

if [ "$width" -lt 1280 ]; then
  echo "warning: $src is only ${width}px wide, so it will be upscaled and look soft" >&2
fi

# Crop to 16:10 around the centre, taking whichever axis is in surplus.
if [ $((width * 10)) -gt $((height * 16)) ]; then
  crop_w=$((height * 16 / 10))
  crop_h=$height
else
  crop_w=$width
  crop_h=$((width * 10 / 16))
fi

tmp="$(mktemp -t store-screenshot).png"
trap 'rm -f "$tmp"' EXIT

sips -c "$crop_h" "$crop_w" "$src" --out "$tmp" >/dev/null
# Safe to ignore aspect here: the crop above already made it exactly 16:10.
sips -z 800 1280 "$tmp" --out "$out" >/dev/null

echo "$out"
