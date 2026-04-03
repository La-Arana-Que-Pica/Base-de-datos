#!/usr/bin/env python3
"""
PES 2018 Face Parameter Generator
==================================
Generates approximate PES 2018 face parameters from a frontal face image
and writes them into a player CSV file, keeping all other data untouched.

Usage:
    python generate_face_params.py <image> <player.csv> [-o output.csv]

Dependencies:
    pip install mediapipe opencv-python numpy

Sections:
    1. IMAGE PROCESSING  – detect face landmarks with MediaPipe FaceMesh
    2. PARAMETER CALC    – convert raw measurements to PES slider values
    3. CSV I/O           – read / modify / write the player CSV
"""

import sys
import csv
import io
import argparse

import cv2
import mediapipe as mp
import numpy as np


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — IMAGE PROCESSING
# Detect face landmarks from the input image using MediaPipe FaceMesh.
# ─────────────────────────────────────────────────────────────────────────────

def detect_face_landmarks(image_path: str) -> tuple:
    """
    Load *image_path* and run MediaPipe FaceMesh on it.

    Returns
    -------
    pts : np.ndarray, shape (N, 2)  pixel (x, y) for each landmark
    img_w, img_h : int  image dimensions in pixels
    """
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Cannot load image: {image_path!r}")

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    img_h, img_w = image.shape[:2]

    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
    ) as face_mesh:
        results = face_mesh.process(rgb)

    if not results.multi_face_landmarks:
        raise RuntimeError(
            "No face detected in the image. "
            "Please use a clear, front-facing photo."
        )

    # Convert normalised [0..1] coords to pixel coordinates (2-D only)
    lm = results.multi_face_landmarks[0].landmark
    pts = np.array(
        [(p.x * img_w, p.y * img_h) for p in lm], dtype=np.float32
    )
    return pts, img_w, img_h


def extract_facial_measurements(pts: np.ndarray, img_w: int, img_h: int) -> dict:
    """
    Compute normalised facial measurements from MediaPipe FaceMesh landmarks.

    All measurements are returned as ratios relative to the face width so that
    the result is scale-independent (works regardless of image resolution or
    how close/far the subject is).

    Key landmark indices used
    -------------------------
    Face oval  : 10 (forehead top), 152 (chin tip), 234 (left cheek edge),
                 454 (right cheek edge)
    Eyes       : 33/263 (outer corners), 133/362 (inner corners),
                 159/145 (right lid open), 386/374 (left lid open)
    Eyebrows   : 70/300 (outer brow top), 107/336 (inner brow top)
    Nose       : 6 (bridge), 1 (tip), 94 (base), 48/278 (nostrils)
    Mouth      : 61/291 (corners), 13 (upper lip top), 14 (lower lip bottom)
    Cheekbones : 116/345
    Jaw        : 172/397 (jaw angles)
    """
    # ── Face bounding box ────────────────────────────────────────────────────
    face_top    = pts[10][1]
    face_bottom = pts[152][1]
    face_left   = pts[234][0]
    face_right  = pts[454][0]

    face_h = face_bottom - face_top
    face_w = face_right  - face_left

    if face_h <= 0 or face_w <= 0:
        raise RuntimeError("Degenerate face bounding box — check the image.")

    # ── Eyes ─────────────────────────────────────────────────────────────────
    r_inner = pts[133];  l_inner = pts[362]
    r_outer = pts[33];   l_outer = pts[263]

    interocular_dist = l_inner[0] - r_inner[0]            # between inner corners
    avg_eye_w = (
        (r_inner[0] - r_outer[0]) + (l_outer[0] - l_inner[0])
    ) / 2.0

    # Vertical centre of eyes as fraction of face height (0 = forehead top)
    eye_cy = (r_inner[1] + l_inner[1]) / 2.0
    eye_height_ratio = (eye_cy - face_top) / face_h       # ~0.38–0.45 typical

    # Eye openness (vertical gap between upper and lower lid)
    eye_open_r = abs(pts[159][1] - pts[145][1])
    eye_open_l = abs(pts[386][1] - pts[374][1])
    avg_eye_open = (eye_open_r + eye_open_l) / 2.0

    # ── Eyebrows ─────────────────────────────────────────────────────────────
    brow_inner_r = pts[107];  brow_inner_l = pts[336]
    brow_outer_r = pts[70];   brow_outer_l = pts[300]
    brow_w = (brow_inner_r[0] - brow_outer_r[0]) + \
             (brow_outer_l[0] - brow_inner_l[0])          # total brow span
    brow_cy = (brow_inner_r[1] + brow_inner_l[1]) / 2.0
    brow_eye_gap = eye_cy - brow_cy                        # gap brow→eye

    # ── Nose ─────────────────────────────────────────────────────────────────
    nose_bridge = pts[6];  nose_tip = pts[1];  nose_base = pts[94]
    nose_r = pts[48];      nose_l   = pts[278]

    nose_w      = nose_l[0]  - nose_r[0]
    nose_len    = nose_base[1] - nose_bridge[1]
    nose_pos_y  = (nose_tip[1] - face_top) / face_h       # ~0.55–0.70 typical

    # ── Mouth ────────────────────────────────────────────────────────────────
    mouth_r = pts[61];  mouth_l = pts[291]
    lip_top = pts[13];  lip_bot = pts[14]

    mouth_w      = mouth_l[0] - mouth_r[0]
    lip_h        = abs(lip_bot[1] - lip_top[1])
    mouth_pos_y  = (mouth_r[1] - face_top) / face_h       # ~0.65–0.78 typical

    # ── Jaw & chin ───────────────────────────────────────────────────────────
    jaw_r = pts[172];  jaw_l = pts[397]
    jaw_w = jaw_l[0] - jaw_r[0]

    chin_h = face_bottom - mouth_r[1]                      # chin-to-mouth gap

    # ── Cheekbones ───────────────────────────────────────────────────────────
    cheek_w = pts[345][0] - pts[116][0]

    # ── Forehead ─────────────────────────────────────────────────────────────
    forehead_h = brow_cy - face_top

    # ── Collect normalised ratios ────────────────────────────────────────────
    return {
        # Head shape
        "face_aspect_ratio":    face_h  / face_w,          # taller → >1
        "face_width_in_image":  face_w  / img_w,           # how wide relative to photo

        # Eyes
        "eye_spacing_ratio":    interocular_dist / face_w,  # wider apart → higher
        "eye_height_ratio":     eye_height_ratio,           # higher on face → lower val
        "eye_width_ratio":      avg_eye_w / face_w,
        "eye_openness_ratio":   avg_eye_open / face_w,

        # Eyebrows
        "brow_width_ratio":     brow_w / face_w,
        "brow_eye_gap_ratio":   brow_eye_gap / face_h,     # tighter brows → smaller

        # Nose
        "nose_width_ratio":     nose_w   / face_w,
        "nose_length_ratio":    nose_len / face_h,
        "nose_pos_ratio":       nose_pos_y,                 # vertical pos of nose tip

        # Mouth
        "mouth_width_ratio":    mouth_w / face_w,
        "lip_height_ratio":     lip_h   / face_h,
        "mouth_pos_ratio":      mouth_pos_y,                # vertical pos of mouth

        # Jaw / chin
        "jaw_width_ratio":      jaw_w  / face_w,
        "chin_height_ratio":    chin_h / face_h,

        # Cheekbones / forehead
        "cheek_width_ratio":    cheek_w     / face_w,
        "forehead_height_ratio": forehead_h / face_h,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — PARAMETER CALCULATION
# Map normalised face measurements to PES 2018 integer slider values.
#
# PES 2018 face sliders use an integer range.  In this CSV format the
# sentinel value -7 means "leave at game default".  Actual adjustments sit
# roughly in the range –6 … +6.  We conservatively map into –3 … +3 so the
# result looks natural; you can widen PES_OUT_MIN / PES_OUT_MAX to taste.
# ─────────────────────────────────────────────────────────────────────────────

# ── Tweak these to change the aggressiveness of the mapping ─────────────────
PES_OUT_MIN = -3   # most negative adjustment applied
PES_OUT_MAX =  3   # most positive adjustment applied
# ────────────────────────────────────────────────────────────────────────────


def _lerp(val: float, in_lo: float, in_hi: float,
          out_lo: int, out_hi: int) -> int:
    """Clamp *val* to [in_lo, in_hi] then linearly map to integer [out_lo, out_hi]."""
    val = max(in_lo, min(in_hi, val))
    t = (val - in_lo) / (in_hi - in_lo)
    return int(round(out_lo + t * (out_hi - out_lo)))


def measurements_to_pes_params(m: dict) -> dict:
    """
    Convert a measurements dict (from extract_facial_measurements) into a
    dict of {PES_column_name: integer_value} ready to be written to the CSV.

    Only the columns listed here will be touched; everything else stays as-is.

    Mapping notes (each line explains the real-world → slider logic):
    ─────────────────────────────────────────────────────────────────
    Head Length    : taller face aspect ratio → longer head
    Head Width     : wider face relative to photo → wider head
    Face Height    : mirrors head length (upper-face proportion)
    Face Size      : overall face size in the photo
    Eye Height     : eyes sitting lower on face → positive (slider shifts eyes down)
    Horiz.Eye Pos. : wider interpupillary gap → positive
    Brow Width     : wider eyebrow span → positive
    Inner Brow Ht. : tighter brow-to-eye gap → negative (brows lower)
    Nose Height    : nose tip lower on face → positive
    Nostril Width  : wider nostrils → positive
    Nose Width     : wider nose bridge → positive
    Nose Depth     : longer nose (bridge-to-base) → positive
    Mouth Position : mouth lower on face → positive
    Lip Width      : wider mouth → positive
    Lip Size       : thicker lips → positive
    Cheekbones     : wider cheekbones → positive
    Chin Height    : longer chin gap → positive
    Chin Width     : wider jaw → positive
    Jaw Height     : prominent wide jaw → positive
    Jawline        : jaw wider than cheeks → more square jaw → positive
    Forehead       : taller forehead → positive
    """
    P = PES_OUT_MIN, PES_OUT_MAX   # shorthand

    # ── Head shape ────────────────────────────────────────────────────────────
    # Aspect ratio: slim/oval ~1.2, round ~1.0, long ~1.5+
    head_length = _lerp(m["face_aspect_ratio"],    1.05, 1.55, *P)
    # Face width in image: 0.25 (far) … 0.55 (close / wide face)
    head_width  = _lerp(m["face_width_in_image"],  0.25, 0.50, *P)
    face_height = _lerp(m["face_aspect_ratio"],    1.05, 1.55, *P)
    face_size   = _lerp(m["face_width_in_image"],  0.25, 0.50, *P)

    # ── Eyes ─────────────────────────────────────────────────────────────────
    # Eye height ratio: ~0.35 (high eyes) … 0.48 (low-set eyes)
    eye_height   = _lerp(m["eye_height_ratio"],     0.35, 0.48, *P)
    # Interpupillary / face_width: ~0.28 (close) … 0.50 (wide-set)
    horiz_eye    = _lerp(m["eye_spacing_ratio"],    0.28, 0.50, *P)

    # ── Eyebrows ─────────────────────────────────────────────────────────────
    # Brow span / face width: ~0.55 (narrow) … 0.85 (wide brows)
    brow_width       = _lerp(m["brow_width_ratio"],    0.55, 0.85, *P)
    # Brow-to-eye gap / face height: tight ~0.04, loose ~0.12
    inner_brow_ht    = _lerp(m["brow_eye_gap_ratio"],  0.04, 0.12, *P)

    # ── Nose ─────────────────────────────────────────────────────────────────
    # Nose tip vertical position: ~0.50 (high) … 0.70 (low)
    nose_height  = _lerp(m["nose_pos_ratio"],       0.50, 0.70, *P)
    # Nostril width / face width: ~0.15 (narrow) … 0.38 (wide)
    nostril_w    = _lerp(m["nose_width_ratio"],     0.15, 0.38, *P)
    # Nose width (bridge area) — same measurement used for Nose Width column
    nose_w       = _lerp(m["nose_width_ratio"],     0.15, 0.38, *P)
    # Nose length / face height: ~0.18 (short) … 0.38 (long)
    nose_depth   = _lerp(m["nose_length_ratio"],    0.18, 0.38, *P)

    # ── Mouth ────────────────────────────────────────────────────────────────
    # Mouth vertical pos: ~0.62 (high) … 0.80 (low)
    mouth_pos    = _lerp(m["mouth_pos_ratio"],      0.62, 0.80, *P)
    # Mouth width / face width: ~0.28 (narrow) … 0.52 (wide)
    lip_width    = _lerp(m["mouth_width_ratio"],    0.28, 0.52, *P)
    # Lip height / face height: ~0.01 (thin) … 0.06 (full)
    lip_size     = _lerp(m["lip_height_ratio"],     0.01, 0.06, *P)

    # ── Jaw / chin ───────────────────────────────────────────────────────────
    # Jaw width / face width: ~0.65 (narrow) … 0.95 (square)
    jaw_height   = _lerp(m["jaw_width_ratio"],      0.65, 0.95, *P)
    # Jaw/cheek ratio: <0.9 → v-shaped, >1.05 → square
    jaw_cheek    = m["jaw_width_ratio"] / max(m["cheek_width_ratio"], 0.01)
    jawline      = _lerp(jaw_cheek,                 0.85, 1.10, *P)
    # Chin-to-mouth gap / face height: ~0.08 (short chin) … 0.22 (long)
    chin_height  = _lerp(m["chin_height_ratio"],    0.08, 0.22, *P)
    # Chin width approximated from jaw
    chin_width   = _lerp(m["jaw_width_ratio"],      0.65, 0.95, *P)

    # ── Cheekbones / forehead ────────────────────────────────────────────────
    # Cheekbone width / face width: ~0.75 (narrow) … 1.05 (prominent)
    cheekbones   = _lerp(m["cheek_width_ratio"],    0.75, 1.05, *P)
    # Forehead height / face height: ~0.18 (low) … 0.38 (high)
    forehead     = _lerp(m["forehead_height_ratio"],0.18, 0.38, *P)

    return {
        # Column name (must match CSV header exactly)   : value
        "Head Length":              head_length,
        "Head Width":               head_width,
        "Face Height":              face_height,
        "Face Size":                face_size,
        "Eye Height":               eye_height,
        "Horizontal Eye Position":  horiz_eye,
        "Brow Width":               brow_width,
        "Inner Eyebrow Height":     inner_brow_ht,
        "Nose Height":              nose_height,
        "Nostril Width":            nostril_w,
        "Nose Width":               nose_w,
        "Nose Depth":               nose_depth,
        "Mouth Position":           mouth_pos,
        "Lip Width":                lip_width,
        "Lip Size":                 lip_size,
        "Cheekbones":               cheekbones,
        "Chin Height":              chin_height,
        "Chin Width":               chin_width,
        "Jaw Height":               jaw_height,
        "Jawline":                  jawline,
        "Forehead":                 forehead,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — CSV READING / WRITING
# Read the player CSV, patch face columns, write back with identical format.
# ─────────────────────────────────────────────────────────────────────────────

def load_csv(csv_path: str) -> tuple:
    """
    Read a semicolon-delimited PES player CSV (UTF-8 with or without BOM).

    Returns
    -------
    headers   : list[str]
    data_rows : list[list[str]]
    has_bom   : bool   – True when the file started with a UTF-8 BOM
    """
    with open(csv_path, "rb") as fh:
        raw = fh.read()

    has_bom = raw[:3] == b"\xef\xbb\xbf"
    text = raw.decode("utf-8-sig")          # strips BOM if present

    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)

    if len(rows) < 2:
        raise ValueError(f"CSV file has fewer than 2 rows: {csv_path!r}")

    return rows[0], rows[1:], has_bom


def apply_face_params(
    headers: list, data_rows: list, pes_params: dict
) -> list:
    """
    Return a copy of *data_rows* with face-parameter columns updated.
    Columns not present in *pes_params* are left exactly as they were.
    """
    updated = []
    for row in data_rows:
        row = list(row)                     # don't mutate the original
        for col, value in pes_params.items():
            if col in headers:
                idx = headers.index(col)
                if idx < len(row):
                    row[idx] = str(value)
        updated.append(row)
    return updated


def save_csv(
    csv_path: str, headers: list, data_rows: list, has_bom: bool = True
) -> None:
    """
    Write *headers* + *data_rows* to *csv_path* using the exact same format
    as the original (semicolons, CRLF line endings, UTF-8 with BOM).
    """
    encoding = "utf-8-sig" if has_bom else "utf-8"
    with open(csv_path, "w", encoding=encoding, newline="") as fh:
        writer = csv.writer(
            fh,
            delimiter=";",
            quoting=csv.QUOTE_MINIMAL,
            lineterminator="\r\n",
        )
        writer.writerow(headers)
        for row in data_rows:
            writer.writerow(row)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate PES 2018 face parameters from a frontal face image "
            "and write them into a player CSV file."
        )
    )
    parser.add_argument("image",  help="Frontal face image (JPG / PNG)")
    parser.add_argument("csv",    help="Player CSV file (PES 2018 format)")
    parser.add_argument(
        "-o", "--output",
        help="Output CSV path (default: overwrite the input file)",
    )
    args = parser.parse_args()

    output_path = args.output or args.csv

    # ── Step 1: detect landmarks ─────────────────────────────────────────────
    print(f"[1/4] Detecting face in: {args.image}")
    pts, img_w, img_h = detect_face_landmarks(args.image)
    print(f"      Image size: {img_w}×{img_h} px  |  Landmarks: {len(pts)}")

    # ── Step 2: extract measurements ────────────────────────────────────────
    print("[2/4] Extracting facial measurements …")
    measurements = extract_facial_measurements(pts, img_w, img_h)
    for k, v in measurements.items():
        print(f"       {k:<30s}: {v:.4f}")

    # ── Step 3: map to PES parameters ───────────────────────────────────────
    print("[3/4] Calculating PES 2018 parameters …")
    pes_params = measurements_to_pes_params(measurements)
    for k, v in pes_params.items():
        print(f"       {k:<30s}: {v:+d}")

    # ── Step 4: update CSV ───────────────────────────────────────────────────
    print(f"[4/4] Updating CSV: {args.csv}")
    headers, data_rows, has_bom = load_csv(args.csv)
    updated_rows = apply_face_params(headers, data_rows, pes_params)
    save_csv(output_path, headers, updated_rows, has_bom)
    print(f"      Done — saved to: {output_path}")


if __name__ == "__main__":
    main()
