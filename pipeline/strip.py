#!/usr/bin/env python3
"""Join still frames side by side into one labelled strip.

    python3 pipeline/strip.py out.png 0.0s=frame0.png 0.5s=frame1.png ...
"""
import sys

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    out, items = sys.argv[1], [a.split("=", 1) for a in sys.argv[2:]]
    frames = [(label, Image.open(path).convert("RGB")) for label, path in items]
    w, h = frames[0][1].size
    gap, head = 8, 34
    strip = Image.new("RGB", (len(frames) * w + (len(frames) - 1) * gap, h + head), "white")
    draw = ImageDraw.Draw(strip)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, im) in enumerate(frames):
        x = i * (w + gap)
        strip.paste(im, (x, head))
        tw = draw.textlength(label, font=font)
        draw.text((x + (w - tw) / 2, 6), label, fill="black", font=font)
    strip.save(out)


if __name__ == "__main__":
    main()
