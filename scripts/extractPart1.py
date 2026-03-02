"""
extractPart1.py
===============
Extract ALL warning signs from Part 1 of the LOTAM PDF (101-152).
Saves images as numbered PNGs: 101.png, 102.png, ... 152.png

Usage:
    python -X utf8 scripts/extractPart1.py
"""

import os, re, io, shutil
import pdfplumber
from PIL import Image as PILImage, ImageDraw, ImageFont

PDF_PATH   = r"C:\Users\Yakov\Desktop\signs.pdf\State of Israel traffic sign board.pdf"
OUTPUT_DIR = r"C:\Users\Yakov\Desktop\driving-theory-app\assets\images\part1"
ASSETS_DIR = r"C:\Users\Yakov\Desktop\driving-theory-app\assets\images"

# Part 1: pages 6-14, signs 101-152
PART1_PAGES = range(6, 15)
PART1_MIN   = 101
PART1_MAX   = 152

# Pattern: 3-digit number + optional Hebrew letter
ID_PAT      = re.compile(r'^(\d{3})([א-ת]?)$')
ANCHOR_WORDS = ('פירושו', 'כוחו')
MAX_HEIGHT  = 90
TOP_PADDING = 20
BOTTOM_GAP  = 12


def trim_to_content(img: PILImage.Image, threshold: int = 230, padding: int = 8) -> PILImage.Image:
    """Remove border lines and whitespace from top/bottom."""
    gray   = img.convert('L')
    pixels = gray.load()
    w, h   = gray.size

    content_rows = [y for y in range(h)
                    if any(pixels[x, y] < threshold for x in range(w))]
    if not content_rows:
        return img

    # Skip isolated leading border line (1-3 rows followed by gap of 3+)
    top = content_rows[0]
    i = 0
    while i < len(content_rows) - 1:
        if content_rows[i + 1] - content_rows[i] >= 3:
            top = content_rows[i + 1]
            i += 1
        else:
            break

    # Skip isolated trailing border line
    bottom = content_rows[-1] + 1
    j = len(content_rows) - 1
    while j > 0:
        if content_rows[j] - content_rows[j - 1] >= 3:
            bottom = content_rows[j - 1] + 1
            j -= 1
        else:
            break

    top    = max(0, top    - padding)
    bottom = min(h, bottom + padding)
    if bottom > top + 10:
        return img.crop((0, top, w, bottom))
    return img


def save_crop(page, crop_box, out_path: str, resolution: int = 150) -> bool:
    """Crop, trim, save as PNG. Keep if larger than existing."""
    try:
        pil_img = page.crop(crop_box).to_image(resolution=resolution).original
        if pil_img.mode in ('P', 'RGBA', 'LA', 'L'):
            pil_img = pil_img.convert('RGB')
        pil_img = trim_to_content(pil_img)
        pil_rgba = pil_img.convert('RGBA')

        buf = io.BytesIO()
        pil_rgba.save(buf, format='PNG')
        new_bytes = buf.getvalue()

        if os.path.exists(out_path) and len(new_bytes) <= os.path.getsize(out_path):
            return False   # existing file is larger — keep it
        with open(out_path, 'wb') as f:
            f.write(new_bytes)
        return True
    except Exception as e:
        print(f"    [crop error] {e}")
        return False


def extract_part1(pdf) -> dict:
    """Extract all signs 101-152 from pages 6-14."""
    results = {}  # sign_id → out_path

    for pnum in PART1_PAGES:
        page  = pdf.pages[pnum - 1]
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        pw    = float(page.width)
        ph    = float(page.height)

        all_id_tops = sorted(
            w['top'] for w in words
            if ID_PAT.match(w['text'].strip())
            and PART1_MIN <= int(ID_PAT.match(w['text'].strip()).group(1)) <= PART1_MAX + 5
        )

        target_words = [
            w for w in words
            if ID_PAT.match(w['text'].strip())
            and PART1_MIN <= int(ID_PAT.match(w['text'].strip()).group(1)) <= PART1_MAX
        ]
        if not target_words:
            continue

        anchors = [w for w in words if any(a in w['text'] for a in ANCHOR_WORDS)]

        for id_word in sorted(target_words, key=lambda w: w['top']):
            raw      = id_word['text'].strip()
            m        = ID_PAT.match(raw)
            sign_id  = m.group(1) + m.group(2)   # e.g. "103" or "103א"
            id_top   = id_word['top']
            id_bot   = id_word['bottom']
            id_x0    = id_word['x0']

            # Bottom boundary
            below = [t for t in all_id_tops if t > id_top + 10]
            next_id_top = (min(below) - BOTTOM_GAP) if below else None

            nearby_anchors = [
                w for w in anchors
                if w['top'] >= id_bot - 5 and w['top'] < id_top + MAX_HEIGHT + 20
            ]
            anchor_top = min((w['top'] for w in nearby_anchors), default=None)
            hard_cap   = id_top + MAX_HEIGHT

            candidates = [c for c in [anchor_top, next_id_top, hard_cap] if c is not None]
            bottom     = min(candidates)

            if (bottom - id_top) <= 25:
                print(f"  [skip-short] p{pnum}: {sign_id}  h={bottom-id_top:.0f}")
                continue

            crop_box = (
                max(0,  id_x0 - 4),
                max(0,  id_top - TOP_PADDING),
                pw * 0.995,
                min(ph, bottom),
            )

            out_path = os.path.join(OUTPUT_DIR, f"{sign_id}.png")
            written  = save_crop(page, crop_box, out_path)
            tag      = '[ok]' if written else '[skip-smaller]'
            print(f"  {tag} p{pnum}: {sign_id}  y={id_top:.0f}->{bottom:.0f} (h={bottom-id_top:.0f})")

            if written:
                results[sign_id] = out_path

    return results


def copy_to_assets(results: dict):
    """Copy extracted PNGs from part1/ folder to assets/images/."""
    print("\n-- Copying to assets/images/ --")
    copied = 0
    for sign_id, src in sorted(results.items()):
        dst = os.path.join(ASSETS_DIR, f"{sign_id}.png")
        shutil.copy2(src, dst)
        print(f"  [copy] {sign_id}.png")
        copied += 1
    print(f"\n  Copied: {copied} files")


def main():
    if not os.path.exists(PDF_PATH):
        print(f"PDF not found: {PDF_PATH}")
        return

    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR)

    print(f"Extracting Part 1 (signs 101-152) from pages 6-14\n")

    with pdfplumber.open(PDF_PATH) as pdf:
        results = extract_part1(pdf)

    print(f"\nExtracted: {len(results)}/52 signs")
    copy_to_assets(results)
    print(f"\nDone. Files in: {ASSETS_DIR}/101.png ... 152.png")
    print("Missing signs (not found in PDF):")
    for n in range(101, 153):
        if str(n) not in results:
            print(f"  {n}.png")


if __name__ == '__main__':
    main()
