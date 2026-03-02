"""
extractSignsPdfPlumber.py
=========================
Extract Israeli traffic sign images from the LOTAM PDF (September 2022).

PDF structure (discovered by full scan of all 94 pages):
  Part 1  (p7-14):  101-152  = Warning signs       (red triangles)
  Part 2  (p16-23): 201-231  = Directive signs      (blue circles with arrows)
  Part 3  (p25-26): 301-310  = Right-of-way signs
  Part 4  (p28-35): 401-441  = Prohibition/restriction signs
  Part 5  (p37-41): 501-516  = Public transport signs
  Part 6  (p44-54): 601-637  = Information/guidance signs

Layout (Hebrew RTL):
  - Sign IMAGE is on the RIGHT side of the page (high x value)
  - Sign NUMBER (3-digit) is immediately to the LEFT of the image
  - "פירושו" / "כוחו" appear BELOW each entry — used as bottom boundary

Extraction method:
  1. Find 3-digit ID text → crop from just-left-of-ID to right page edge
  2. Bottom = min(next_id_top - BOTTOM_GAP, anchor_top, id_top + MAX_SIGN_HEIGHT)
  3. page.crop().to_image() renders ALL content (raster + vector)
  4. trim_to_content() removes PDF table-border lines from top/bottom of crop

Phase 2: Rename numbered JPGs → PNG app filenames (NUMBER_TO_FILENAME).
Phase 3: Generate missing signs (speed limits via PIL) + copy shared signs.

Usage:
    pip install pdfplumber Pillow
    python -X utf8 scripts/extractSignsPdfPlumber.py
"""

import os
import re
import io
import sys
import shutil
import pdfplumber
from PIL import Image as PILImage, ImageDraw, ImageFont

# Force UTF-8 output on Windows CMD
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ── Paths ────────────────────────────────────────────────────────────────────
PDF_PATH   = r"C:\Users\Yakov\Desktop\signs.pdf\State of Israel traffic sign board.pdf"
OUTPUT_DIR = r"C:\Users\Yakov\Desktop\driving-theory-app\assets\images\numbered"
ASSETS_DIR = r"C:\Users\Yakov\Desktop\driving-theory-app\assets\images"

# ── CORRECT NUMBER_TO_FILENAME mapping (full LOTAM 2022 scan) ────────────────
NUMBER_TO_FILENAME = {
    # Warning signs — Part 1, pages 7-14 (red triangles)
    '101': 'sign_bump.png',                # p7:  road hump (arch inside triangle)
    '102': 'sign_curve_right.png',         # p7:  right curve
    '103': 'sign_curve_left.png',          # p7:  left / slight curve (mirrored)
    '109': 'sign_narrow_road.png',         # p8:  narrow road (one side narrows)
    '114': 'sign_crossroads.png',          # p8:  X crossroads
    '115': 'sign_t_junction.png',          # p8:  T-junction
    '122': 'sign_traffic_light_ahead.png', # p9:  traffic light warning triangle
    '135': 'sign_pedestrian.png',          # p11: pedestrian crossing warning
    '136': 'sign_school_zone.png',         # p11: children / school warning
    '140': 'sign_hill_descent.png',        # p12: steep descent
    '141': 'sign_slippery.png',            # p12: slippery road (skidding car)

    # Right-of-way signs — Part 3, pages 25-26
    '301': 'sign_yield.png',              # p25: inverted triangle (give way)
    '302': 'sign_stop.png',              # p25: red octagon + hand (STOP + yield)
    '303': 'row_roundabout.png',         # p25: roundabout yield (blue circle)
    '307': 'row_yield_oncoming.png',     # p26: yield to oncoming traffic
    '309': 'row_priority_road.png',      # p26: priority road (yellow diamond)
    '310': 'row_end_priority.png',       # p26: end of priority road

    # Prohibition / restriction signs — Part 4, pages 28-35
    '401': 'sign_road_closed.png',       # p28: road closed (red circle, empty)
    '402': 'sign_no_entry.png',          # p28: no entry (red circle + white bar)
    '406': 'sign_no_trucks.png',         # p29: no heavy trucks > 8t
    '412': 'sign_no_bicycles.png',       # p29: no bicycles
    '415': 'sign_weight_limit.png',      # p30: weight limit 6t
    '420': 'sign_no_overtaking.png',     # p31: no overtaking
    '426': 'sign_speed_50.png',          # p32: speed limit circle (PDF shows 40 example)
    '430': 'sign_no_uturn.png',          # p33: no U-turn
    '432': 'sign_no_parking.png',        # p33: no parking

    # Information / guidance signs — Part 6, pages 44-54
    '618': 'sign_one_way.png',           # p50: one-way road (blue square + up arrow)
    '626': 'sign_parking.png',           # p52: parking (blue P square)
}

# ── Page ranges where each sign is actually listed ───────────────────────────
# Prevents picking up the sign number from TOC / intro / section-divider pages.
SIGN_PAGE_RANGES = {
    # Warning signs — Part 1 (section divider p6, listings p7-14)
    '101': (6, 14),  '102': (6, 14),  '103': (6, 14),
    '109': (6, 14),  '114': (6, 14),  '115': (6, 14),
    '122': (6, 14),  '135': (6, 14),  '136': (6, 14),
    '140': (6, 14),  '141': (6, 14),
    # Right-of-way — Part 3 (skip divider p24, listings p25-26)
    '301': (25, 26), '302': (25, 26), '303': (25, 26),
    '307': (25, 26), '309': (25, 26), '310': (25, 26),
    # Prohibition — Part 4 (skip divider p27, listings p28-35)
    '401': (28, 35), '402': (28, 35), '406': (28, 35),
    '412': (28, 35), '415': (28, 35), '420': (28, 35),
    '426': (28, 35), '430': (28, 35), '432': (28, 35),
    # Information — Part 6 (listings p44-54)
    '618': (44, 54), '626': (44, 54),
}

# ── Which parts to extract this run ─────────────────────────────────────────
# 1=warning, 3=right-of-way, 4=prohibition, 6=information
# Change to {1,3,4,6} to run everything at once.
PARTS_TO_EXTRACT = {1}

ID_PATTERN      = re.compile(r'^\d{3}$')
ANCHOR_WORDS    = ('פירושו', 'כוחו')
MAX_SIGN_HEIGHT = 90   # hard cap: crop height in PDF units
TOP_PADDING     = 20   # extend crop above ID text (sign graphic starts above text)
BOTTOM_GAP      = 12   # units subtracted from next-ID top to avoid bleed-through


# ── Helper: trim white borders from crop ─────────────────────────────────────
def trim_to_content(img: PILImage.Image, threshold: int = 230, padding: int = 8) -> PILImage.Image:
    """
    Remove white/near-white rows from top and bottom of image.
    Also detects and removes isolated border lines (e.g. red PDF table separators)
    that appear as 1-3 colored rows followed by a gap of 3+ white rows before
    the actual sign graphic.
    """
    gray   = img.convert('L')
    pixels = gray.load()
    w, h   = gray.size

    # Collect all row indices that contain at least one dark pixel
    content_rows = [y for y in range(h)
                    if any(pixels[x, y] < threshold for x in range(w))]

    if not content_rows:
        return img

    # ── Strip isolated leading border line from top ───────────────────────────
    # A border line = a small cluster of content rows (≤3) followed by a gap
    # of ≥3 all-white rows before the real sign begins.
    top = content_rows[0]
    i = 0
    while i < len(content_rows) - 1:
        gap = content_rows[i + 1] - content_rows[i]
        if gap >= 3:
            # Everything up to content_rows[i] is an isolated line — skip it
            top = content_rows[i + 1]
            i += 1
        else:
            break

    # ── Strip isolated trailing border line from bottom ───────────────────────
    bottom = content_rows[-1] + 1
    j = len(content_rows) - 1
    while j > 0:
        gap = content_rows[j] - content_rows[j - 1]
        if gap >= 3:
            bottom = content_rows[j - 1] + 1
            j -= 1
        else:
            break

    top    = max(0, top    - padding)
    bottom = min(h, bottom + padding)

    if bottom > top + 10:      # sanity: don't return an almost-empty image
        return img.crop((0, top, w, bottom))
    return img


# ── Helper: crop page region and save ────────────────────────────────────────
def save_crop_best_size(page, crop_box, out_path: str, resolution: int = 150) -> bool:
    """Crop page region, trim borders, save as JPEG. Keeps file only if larger than existing."""
    try:
        pil_img = page.crop(crop_box).to_image(resolution=resolution).original
        if pil_img.mode in ('P', 'RGBA', 'LA', 'L'):
            pil_img = pil_img.convert('RGB')

        # Remove PDF table-border lines from top/bottom
        pil_img = trim_to_content(pil_img)

        buf = io.BytesIO()
        pil_img.save(buf, format='JPEG', quality=92)
        new_bytes = buf.getvalue()
        if os.path.exists(out_path) and len(new_bytes) <= os.path.getsize(out_path):
            return False
        with open(out_path, 'wb') as f:
            f.write(new_bytes)
        return True
    except Exception as e:
        print(f"    [crop error] {type(e).__name__}: {e}")
        return False


# ── Phase 1 ──────────────────────────────────────────────────────────────────
def extract_by_id_positions(pdf) -> dict:
    """Extract sign images anchored to their 3-digit ID number in the page text."""
    results = {}

    for page in pdf.pages:
        pnum  = page.page_number
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        pw    = float(page.width)
        ph    = float(page.height)

        all_3digit_tops = sorted(
            w['top'] for w in words if ID_PATTERN.match(w['text'])
        )
        target_words = [
            w for w in words
            if ID_PATTERN.match(w['text']) and w['text'] in NUMBER_TO_FILENAME
        ]
        if not target_words:
            continue

        anchors_on_page = [
            w for w in words if any(a in w['text'] for a in ANCHOR_WORDS)
        ]

        for id_word in sorted(target_words, key=lambda w: w['top']):
            sign_id   = id_word['text']
            id_top    = id_word['top']
            id_bottom = id_word['bottom']
            id_x0     = id_word['x0']

            # ── Part filter ──────────────────────────────────────────────────
            sign_num = int(sign_id)
            if   100 <= sign_num <= 199 and 1 not in PARTS_TO_EXTRACT: continue
            elif 200 <= sign_num <= 299 and 2 not in PARTS_TO_EXTRACT: continue
            elif 300 <= sign_num <= 399 and 3 not in PARTS_TO_EXTRACT: continue
            elif 400 <= sign_num <= 499 and 4 not in PARTS_TO_EXTRACT: continue
            elif 600 <= sign_num <= 699 and 6 not in PARTS_TO_EXTRACT: continue

            # ── Page range filter (skip TOC / intro / divider pages) ─────────
            page_range = SIGN_PAGE_RANGES.get(sign_id)
            if page_range and not (page_range[0] <= pnum <= page_range[1]):
                print(f"  [skip-page] p{pnum}: {sign_id}  (outside range {page_range})")
                continue

            # Bottom boundary
            below_tops  = [t for t in all_3digit_tops if t > id_top + 10]
            next_id_top = (min(below_tops) - BOTTOM_GAP) if below_tops else None

            nearby_anchors = [
                w for w in anchors_on_page
                if w['top'] >= id_bottom - 5 and w['top'] < id_top + MAX_SIGN_HEIGHT + 20
            ]
            anchor_top = min((w['top'] for w in nearby_anchors), default=None)
            hard_cap   = id_top + MAX_SIGN_HEIGHT

            candidates = [c for c in [anchor_top, next_id_top, hard_cap] if c is not None]
            bottom     = min(candidates)

            # Skip table-of-contents rows (too short)
            if (bottom - id_top) <= 30:
                print(f"  [skip-toc] p{pnum}: {sign_id}  h={bottom-id_top:.0f}")
                continue

            crop_box = (
                max(0,  id_x0 - 4),           # include ID number text
                max(0,  id_top - TOP_PADDING), # above ID (sign graphic is here)
                pw * 0.995,                     # right page edge (sign is here in RTL)
                min(ph, bottom),                # tight bottom boundary
            )

            out_path = os.path.join(OUTPUT_DIR, f"{sign_id}.jpg")
            written  = save_crop_best_size(page, crop_box, out_path)
            status   = '[ok]' if written else '[skip-smaller]'
            print(f"  {status} p{pnum}: {sign_id}  y={id_top:.0f}->{bottom:.0f} (h={bottom-id_top:.0f})")

            if written:
                results[sign_id] = out_path

    return results


# ── Phase 2 ──────────────────────────────────────────────────────────────────
def rename_to_app_filenames(extracted: dict) -> list:
    print("\n-- Phase 2: Rename to app filenames --")
    found, missing = 0, []

    # Only process signs that belong to the parts we extracted
    for sign_id, app_filename in NUMBER_TO_FILENAME.items():
        sign_num = int(sign_id)
        part = None
        if 100 <= sign_num <= 199: part = 1
        elif 200 <= sign_num <= 299: part = 2
        elif 300 <= sign_num <= 399: part = 3
        elif 400 <= sign_num <= 499: part = 4
        elif 600 <= sign_num <= 699: part = 6
        if part not in PARTS_TO_EXTRACT:
            continue   # skip signs from other parts

        src = os.path.join(OUTPUT_DIR, f"{sign_id}.jpg")
        dst = os.path.join(ASSETS_DIR, app_filename)
        if os.path.exists(src):
            try:
                PILImage.open(src).convert('RGBA').save(dst, 'PNG')
                print(f"  [ok] {sign_id} -> {app_filename}")
                found += 1
            except Exception as e:
                print(f"  [error] {sign_id}: {e}")
                missing.append(sign_id)
        else:
            print(f"  [missing] {sign_id} -> {app_filename}  (placeholder kept)")
            missing.append(sign_id)

    print(f"\n  Converted: {found} signs")
    return missing


# ── Phase 3 ──────────────────────────────────────────────────────────────────
def generate_missing_signs():
    """
    Generate signs not in the PDF:
    - Speed limits 30, 50, 90 (white circle, red border, number in black)
    - sign_road_work (orange triangle placeholder)
    - row_merge (blue rectangle placeholder)
    Copy shared signs (same PDF source, multiple app filenames).
    Only run if relevant parts are being extracted.
    """
    print("\n-- Phase 3: Generate missing + copy shared signs --")

    font_path = r"C:\Windows\Fonts\arialbd.ttf"
    if not os.path.exists(font_path):
        font_path = r"C:\Windows\Fonts\arial.ttf"

    # 3a. Speed limit circles: 30, 50, 90  (Part 4)
    if 4 in PARTS_TO_EXTRACT:
        for speed in [30, 50, 90]:
            sz     = 200
            border = 14
            img    = PILImage.new('RGBA', (sz, sz), (255, 255, 255, 0))
            draw   = ImageDraw.Draw(img)
            draw.ellipse(
                [border // 2, border // 2, sz - border // 2, sz - border // 2],
                fill='white', outline='red', width=border
            )
            text = str(speed)
            try:
                font = ImageFont.truetype(font_path, 82)
            except Exception:
                font = ImageFont.load_default()
            bbox = draw.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(((sz - tw) // 2, (sz - th) // 2 - 4), text, fill='black', font=font)
            out = os.path.join(ASSETS_DIR, f'sign_speed_{speed}.png')
            img.save(out, 'PNG')
            print(f"  [generated] sign_speed_{speed}.png")

    # 3b. sign_road_work — orange warning triangle (Part 1, not in PDF)
    # Always regenerate to avoid stale old images from previous extraction runs.
    if 1 in PARTS_TO_EXTRACT:
        rw_path = os.path.join(ASSETS_DIR, 'sign_road_work.png')
        sz  = 200
        img = PILImage.new('RGBA', (sz, sz), (255, 255, 255, 0))
        draw = ImageDraw.Draw(img)
        draw.polygon([(100, 12), (194, 186), (6, 186)], fill='#FF8800', outline='red')
        try:
            font = ImageFont.truetype(font_path, 90)
        except Exception:
            font = ImageFont.load_default()
        draw.text((86, 66), '!', fill='white', font=font)
        img.save(rw_path, 'PNG')
        print(f"  [generated] sign_road_work.png (orange triangle placeholder)")

    # 3c. row_merge — blue placeholder (Part 3)
    if 3 in PARTS_TO_EXTRACT:
        merge_path = os.path.join(ASSETS_DIR, 'row_merge.png')
        if not os.path.exists(merge_path):
            sz  = 200
            img = PILImage.new('RGBA', (sz, sz), (0, 100, 200, 255))
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype(font_path, 40)
            except Exception:
                font = ImageFont.load_default()
            draw.text((28, 82), 'MERGE', fill='white', font=font)
            img.save(merge_path, 'PNG')
            print(f"  [generated] row_merge.png (blue placeholder)")
        else:
            print(f"  [skip] row_merge.png already exists")

    # 3d. Copy shared signs (same visual, different app filename)
    if 3 in PARTS_TO_EXTRACT:
        COPY_MAP = {
            'sign_yield.png':        ['row_junction_yield.png'],
            'sign_stop.png':         ['sign_compulsory_stop.png', 'row_four_way_stop.png'],
            'row_priority_road.png': ['row_main_road.png'],
        }
        for src_name, dst_names in COPY_MAP.items():
            src = os.path.join(ASSETS_DIR, src_name)
            if os.path.exists(src):
                for dst_name in dst_names:
                    shutil.copy2(src, os.path.join(ASSETS_DIR, dst_name))
                    print(f"  [copy] {src_name} -> {dst_name}")
            else:
                print(f"  [skip-copy] {src_name} not found yet")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(PDF_PATH):
        print(f"PDF not found: {PDF_PATH}")
        return

    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
        print(f"[cleared] {OUTPUT_DIR}")
    os.makedirs(OUTPUT_DIR)

    parts_label = ','.join(str(p) for p in sorted(PARTS_TO_EXTRACT))
    print(f"PDF:    {PDF_PATH}")
    print(f"Temp:   {OUTPUT_DIR}")
    print(f"Output: {ASSETS_DIR}")
    print(f"Parts:  {parts_label}\n")

    with pdfplumber.open(PDF_PATH) as pdf:
        print(f"Pages: {len(pdf.pages)}\n")
        print("-- Phase 1: Extract by ID position --")
        extracted = extract_by_id_positions(pdf)

    # Count how many signs belong to selected parts
    selected_signs = [
        sid for sid in NUMBER_TO_FILENAME
        if (100 <= int(sid) <= 199 and 1 in PARTS_TO_EXTRACT) or
           (200 <= int(sid) <= 299 and 2 in PARTS_TO_EXTRACT) or
           (300 <= int(sid) <= 399 and 3 in PARTS_TO_EXTRACT) or
           (400 <= int(sid) <= 499 and 4 in PARTS_TO_EXTRACT) or
           (600 <= int(sid) <= 699 and 6 in PARTS_TO_EXTRACT)
    ]
    print(f"\nPhase 1 total: {len(extracted)}/{len(selected_signs)} signs extracted from PDF")

    missing = rename_to_app_filenames(extracted)

    generate_missing_signs()

    print("\n-- Summary --")
    print(f"  From PDF:  {len(selected_signs) - len(missing)}/{len(selected_signs)}")
    print(f"  Parts run: {parts_label}")
    print(f"\nNext: npx tsx backend/uploadContent.ts")


if __name__ == '__main__':
    main()
