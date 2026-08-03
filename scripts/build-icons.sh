#!/usr/bin/env bash
#
# Draws the raster icons from their SVG sources.
#
#   scripts/build-icons.sh
#
# Run by hand; the results are committed. Three files that change about never
# are not worth teaching the Docker build about librsvg and Pillow.
#
#   brew install librsvg
#   pip install pillow
#
# Sources live in `packages/web/icons` (not served) and in
# `packages/web/public/favicon.svg` (served as-is, and the drawing the other two
# follow). Everything lands in `packages/web/public`, which Vite copies to
# `dist/` verbatim and `@fastify/static` serves from the root.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
icons="$root/packages/web/icons"
public="$root/packages/web/public"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for tool in rsvg-convert python3; do
  command -v "$tool" >/dev/null || { echo "need $tool — see the header" >&2; exit 1; }
done

# iOS wants a square, opaque 180px. The mask is Apple's business, not ours.
rsvg-convert -w 180 -h 180 "$icons/apple-touch-icon.svg" -o "$work/apple.png"

# The 16px layer is its own drawing; 32 and 48 come down from the tab icon.
rsvg-convert -w 16 -h 16 "$icons/favicon-16.svg" -o "$work/16.png"
rsvg-convert -w 32 -h 32 "$public/favicon.svg" -o "$work/32.png"
rsvg-convert -w 48 -h 48 "$public/favicon.svg" -o "$work/48.png"

python3 - "$work" "$public" <<'PY'
import sys
from pathlib import Path
from PIL import Image

work, public = (Path(p) for p in sys.argv[1:3])

# Flat green to the edges, so drop the alpha channel: some Apple surfaces
# composite a transparent icon onto white, and nothing here is meant to be
# see-through anyway.
Image.open(work / "apple.png").convert("RGB").save(public / "apple-touch-icon.png")

# Pillow packs `append_images` into the .ico but skips anything larger than the
# image it was called on, so call it on the biggest and hand it the rest.
sizes = (16, 32, 48)
layers = {n: Image.open(work / f"{n}.png").convert("RGBA") for n in sizes}
layers[48].save(
    public / "favicon.ico",
    format="ICO",
    sizes=[(n, n) for n in sizes],
    append_images=[layers[16], layers[32]],
)

with Image.open(public / "favicon.ico") as ico:
    print("favicon.ico:", sorted(ico.info["sizes"]))
PY

echo "apple-touch-icon.png: 180x180"
