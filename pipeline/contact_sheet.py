#!/usr/bin/env python3
"""Grid of labelled frames (contact sheet).

    python3 pipeline/contact_sheet.py out.png <columns> "label=frame.png" ...
"""
import sys

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    out, cols = sys.argv[1], int(sys.argv[2])
    items = [a.rsplit("=", 1) for a in sys.argv[3:]]
    frames = [(label, Image.open(path).convert("RGB")) for label, path in items]
    w, h = frames[0][1].size
    gap, head = 12, 40
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w + (cols + 1) * gap, rows * (h + head + gap) + gap), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 24)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, im) in enumerate(frames):
        x = gap + (i % cols) * (w + gap)
        y = gap + (i // cols) * (h + head + gap)
        tw = draw.textlength(label, font=font)
        draw.text((x + (w - tw) / 2, y + 6), label, fill="black", font=font)
        sheet.paste(im, (x, y + head))
    sheet.save(out)


if __name__ == "__main__":
    main()
