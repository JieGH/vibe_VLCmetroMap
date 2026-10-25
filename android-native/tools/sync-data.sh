#!/usr/bin/env bash
# Copies the shared network data and offline basemap from the web app into the
# native app's assets, then regenerates the styles and lines.geojson.
# Run from anywhere. Source of truth stays in ../src/data and ../public/basemap.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
ASSETS="$HERE/app/src/main/assets"

mkdir -p "$ASSETS/data" "$ASSETS/basemap"
for f in gtfs_expanded metro_lines return_tracks direction_stations segment_times \
         segment_times_fgv paradas_api live_stations line_colors_from_image; do
  cp "$REPO/src/data/$f.json" "$ASSETS/data/$f.json"
done
cp "$REPO/public/line4_osm.geojson" "$ASSETS/data/line4_osm.geojson"

rsync -a --delete "$REPO/public/basemap/fonts/"   "$ASSETS/basemap/fonts/"
rsync -a --delete "$REPO/public/basemap/sprites/" "$ASSETS/basemap/sprites/"
# MapLibre Native asks for sprite@2x on dense screens and does not fall back to 1x
# ("Failed to load sprite: Could not read asset"), so alias the 1x files as @2x.
for ext in json png; do
  for n in dark white; do cp "$ASSETS/basemap/sprites/$n.$ext" "$ASSETS/basemap/sprites/$n@2x.$ext"; done
done
# Skip the 36 MB copy when it is already current.
if ! cmp -s "$REPO/public/basemap/valencia.pmtiles" "$ASSETS/basemap/valencia.pmtiles"; then
  cp "$REPO/public/basemap/valencia.pmtiles" "$ASSETS/basemap/valencia.pmtiles"
fi

(cd "$REPO" && node "$HERE/tools/build-style.mjs")
echo "synced -> $ASSETS"
