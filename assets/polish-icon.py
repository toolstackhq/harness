"""Clean up a generated icon that has a baked-in transparency-checker background.

- Detects the squircle by saturation.
- Crops tightly, then re-pads to a square canvas.
- Applies a true rounded-rect (squircle-ish) alpha mask.
- Resizes to 1024x1024 RGBA.
- Overwrites assets/icon.png.
"""
from PIL import Image, ImageDraw, ImageFilter
import os, sys

SRC = os.path.join(os.path.dirname(__file__), "icon.png")
OUT_SIZE = 1024
RADIUS_RATIO = 0.22  # iOS-style squircle radius

def find_squircle_bbox(img):
    # scan pixel-by-pixel for a high-saturation or blue-dominant region
    px = img.load()
    W, H = img.size
    min_x, min_y, max_x, max_y = W, H, 0, 0
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y][:3]
            # gray checker pixels: r ~= g ~= b. squircle pixels: blue dominant or saturated.
            if b > r + 15 or b > g + 15 or (max(r, g, b) - min(r, g, b)) > 25:
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    return (min_x, min_y, max_x, max_y)

def main():
    if not os.path.exists(SRC):
        print("missing", SRC); sys.exit(1)
    src = Image.open(SRC).convert("RGB")
    bbox = find_squircle_bbox(src)
    if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        print("could not detect squircle"); sys.exit(1)
    crop = src.crop(bbox)
    # make it square by padding shorter dimension
    w, h = crop.size
    side = max(w, h)
    square = Image.new("RGB", (side, side), (26, 115, 232))
    square.paste(crop, ((side - w) // 2, (side - h) // 2))

    # resize to final
    square = square.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

    # build squircle alpha mask (rounded rect, then slight feather on edge)
    mask = Image.new("L", (OUT_SIZE, OUT_SIZE), 0)
    draw = ImageDraw.Draw(mask)
    r = int(OUT_SIZE * RADIUS_RATIO)
    draw.rounded_rectangle((0, 0, OUT_SIZE - 1, OUT_SIZE - 1), radius=r, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.2))

    out = Image.new("RGBA", (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    out.paste(square, (0, 0), mask)
    out.save(SRC, "PNG", optimize=True)
    print("wrote", SRC, out.size)

if __name__ == "__main__":
    main()
