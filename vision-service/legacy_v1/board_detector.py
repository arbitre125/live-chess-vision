#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
كشف الرقعة واستخلاص المربعات:
  - يحسب homography من زوايا الرقعة الأربع (من صفحة الأدمن)
  - يقسّم الرقعة المستقيمة إلى 64 مربعاً
  - يعيد لكل مربع صورة رمادية جاهزة للمقارنة

ترتيب الزوايا: [[TL],[TR],[BR],[BL]]
أي: أعلى-يسار، أعلى-يمين، أسفل-يمين، أسفل-يسار داخل إطار الصورة
مع الترتيب القياسي: a8 في أعلى-يسار الرقعة (الأبيض أسفل).
"""

import cv2
import numpy as np

FILES = "abcdefgh"
SIZE = 800  # دقة الرقعة المستقيمة بعد التسوية

# مربعات 64 بالترتيب: a8..h8 ثم a7..h7 ... a1..h1
SQUARES = [f"{f}{r}" for r in range(8, 0, -1) for f in FILES]


def compute_homography(corners: np.ndarray) -> np.ndarray:
    """من زوايا الصورة إلى زوايا رقعة مستقيمة 800×800."""
    dst = np.array(
        [[0, 0], [SIZE, 0], [SIZE, SIZE], [0, SIZE]], dtype=np.float32
    )
    src = np.asarray(corners, dtype=np.float32)
    if src.shape != (4, 2):
        raise ValueError("يجب أن تكون الزوايا أربع نقاط [x,y]")
    return cv2.getPerspectiveTransform(src, dst)


def warp_board(frame_bgr_or_rgb: np.ndarray, H: np.ndarray) -> np.ndarray:
    gray = (
        cv2.cvtColor(frame_bgr_or_rgb, cv2.COLOR_RGB2GRAY)
        if frame_bgr_or_rgb.ndim == 3 and frame_bgr_or_rgb.shape[2] == 3
        else frame_bgr_or_rgb
    )
    return cv2.warpPerspective(gray, H, (SIZE, SIZE))


def extract_squares(frame: np.ndarray, corners: np.ndarray) -> dict:
    """يعيد dict: 'e4' -> صورة رمادية 100×100 للمربع."""
    H = compute_homography(corners)
    warped = warp_board(frame, H)
    sq = SIZE // 8
    out = {}
    for i, name in enumerate(SQUARES):
        r, c = divmod(i, 8)
        tile = warped[r * sq : (r + 1) * sq, c * sq : (c + 1) * sq]
        out[name] = tile
    return out


def draw_grid_debug(frame: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """رسم شبكة الرقعة على الإطار لأغراض تصحيح المعايرة."""
    dbg = frame.copy()
    H = compute_homography(corners)
    Hinv = np.linalg.inv(H)
    pts = []
    for i in range(9):
        t = i * (SIZE / 8)
        for j in range(9):
            u = j * (SIZE / 8)
            pts.append([t, u])
    pts = np.array(pts, dtype=np.float32).reshape(-1, 1, 2)
    proj = cv2.perspectiveTransform(pts, Hinv).reshape(-1, 2)
    for k in range(0, len(proj)):
        x, y = proj[k].astype(int)
        cv2.circle(dbg, (x, y), 2, (0, 255, 0), -1)
    return dbg


def auto_detect_corners(frame: np.ndarray):
    """(اختياري) كشف تلقائي لأكبر رباعي في المشهد عبر Canny+Hough —
    يُستخدم كمساعد أولي فقط؛ المعايرة اليدوية من صفحة الأدمن أدق وأكثر ثباتاً."""
    import cv2 as _cv

    gray = _cv.cvtColor(frame, _cv.COLOR_RGB2GRAY)
    blur = _cv.GaussianBlur(gray, (5, 5), 0)
    edges = _cv.Canny(blur, 50, 150)
    lines = _cv.HoughLinesP(edges, 1, np.pi / 180, 120, minLineLength=150, maxLineGap=40)
    if lines is None or len(lines) < 4:
        return None
    pts = lines.reshape(-1, 2)
    hull = _cv.convexHull(pts)
    approx = _cv.approxPolyDP(hull, 0.02 * _cv.arcLength(hull, True), True)
    if len(approx) != 4:
        return None
    return approx.reshape(4, 2).astype(np.float32)
