"""
uploadPart.py
=============
Targeted upload — uploads only the image files for a specific part.
Does NOT re-upload audio, video, or other unchanged files.

Usage:
    python -X utf8 scripts/uploadPart.py 1      # warning signs
    python -X utf8 scripts/uploadPart.py 3      # right-of-way
    python -X utf8 scripts/uploadPart.py 4      # prohibition
    python -X utf8 scripts/uploadPart.py 6      # information
"""

import os
import sys
import mimetypes
import urllib.request
import urllib.error

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL      = "https://bpltieicivxixpogxfim.supabase.co"
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET            = "images"
IMG_VERSION       = "v3"
ASSETS_DIR        = r"C:\Users\Yakov\Desktop\driving-theory-app\assets\images"

# ── Files per part ────────────────────────────────────────────────────────────
PART_FILES = {
    1: [
        "sign_bump.png",
        "sign_curve_right.png",
        "sign_curve_left.png",
        "sign_narrow_road.png",
        "sign_crossroads.png",
        "sign_t_junction.png",
        "sign_traffic_light_ahead.png",
        "sign_pedestrian.png",
        "sign_school_zone.png",
        "sign_hill_descent.png",
        "sign_slippery.png",
        "sign_road_work.png",   # placeholder (not in PDF)
    ],
    3: [
        "sign_yield.png",
        "sign_stop.png",
        "row_roundabout.png",
        "row_yield_oncoming.png",
        "row_priority_road.png",
        "row_end_priority.png",
        "row_junction_yield.png",
        "sign_compulsory_stop.png",
        "row_four_way_stop.png",
        "row_main_road.png",
        "row_merge.png",        # placeholder
    ],
    4: [
        "sign_road_closed.png",
        "sign_no_entry.png",
        "sign_no_trucks.png",
        "sign_no_bicycles.png",
        "sign_weight_limit.png",
        "sign_no_overtaking.png",
        "sign_speed_30.png",
        "sign_speed_50.png",
        "sign_speed_90.png",
        "sign_no_uturn.png",
        "sign_no_parking.png",
    ],
    6: [
        "sign_one_way.png",
        "sign_parking.png",
    ],
}


def upload_file(filename: str) -> bool:
    local_path = os.path.join(ASSETS_DIR, filename)
    if not os.path.exists(local_path):
        print(f"  [missing] {filename}")
        return False

    storage_path = f"{IMG_VERSION}/{filename}"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"

    with open(local_path, 'rb') as f:
        data = f.read()

    mime = mimetypes.guess_type(filename)[0] or "image/png"
    headers = {
        "Authorization":  f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":   mime,
        "x-upsert":       "true",          # overwrite if exists
    }

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  [ok] {filename}  ({len(data)//1024}KB)")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f"  [error] {filename}: HTTP {e.code} — {body[:120]}")
        return False
    except Exception as e:
        print(f"  [error] {filename}: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python uploadPart.py <part_number>")
        print("  Parts: 1=warning  3=right-of-way  4=prohibition  6=information")
        sys.exit(1)

    part = int(sys.argv[1])
    if part not in PART_FILES:
        print(f"Unknown part: {part}. Choose from {list(PART_FILES.keys())}")
        sys.exit(1)

    files = PART_FILES[part]
    print(f"Uploading Part {part} — {len(files)} image files to {BUCKET}/{IMG_VERSION}/\n")

    ok = 0
    for fname in files:
        if upload_file(fname):
            ok += 1

    print(f"\nDone: {ok}/{len(files)} uploaded to Supabase")


if __name__ == "__main__":
    main()
