# -*- coding: utf-8 -*-
"""
تحويلات المنظور — منفذة من CameraChessWeb src/utils/warp.tsx
getPerspectiveTransform / getInvTransform / transformCenters / transformBoundary
"""
import numpy as np
from .constants import SQUARE_SIZE, BOARD_SIZE, SQUARE_NAMES


def perspective_transform(src, transform):
    """يطبق مصفوفة منظور 3×3 على نقاط [N,2] (نفس perspectiveTransform في TS)."""
    src = np.asarray(src, dtype=np.float64)
    if src.shape[1] == 2:
        src = np.hstack([src, np.ones((len(src), 1))])
    warped = src @ transform.T
    w = warped[:, 2:3]
    # حماية من القسمة على صفر (رباعيات منحلة)
    w = np.where(np.abs(w) < 1e-9, 1e-9, w)
    return warped[:, :2] / w


def get_perspective_transform(target, keypoints):
    """يحل نظام 8×8 لإيجاد المصفوفة التي تحوّل keypoints → target (نفس TS).

    target[i] = الإحداثيات المرغوبة، keypoints[i] = الإحداثيات في الصورة.
    """
    A = np.zeros((8, 8), dtype=np.float64)
    B = np.zeros((8, 1), dtype=np.float64)
    for i in range(4):
        x, y = keypoints[i]
        u, v = target[i]
        A[i * 2, 0], A[i * 2, 1], A[i * 2, 2] = x, y, 1
        A[i * 2, 6], A[i * 2, 7] = -u * x, -u * y
        A[i * 2 + 1, 3], A[i * 2 + 1, 4], A[i * 2 + 1, 5] = x, y, 1
        A[i * 2 + 1, 6], A[i * 2 + 1, 7] = -v * x, -v * y
        B[i * 2, 0] = u
        B[i * 2 + 1, 0] = v
    sol = np.linalg.solve(A, B)
    return np.array(list(sol[:, 0]) + [1.0], dtype=np.float64).reshape(3, 3)


def get_transform_for_corners(keypoints):
    """مصفوفة تحوّل إحداثيات لوحة اللعب (1024×1024) → بكسلات الصورة.

    keypoints بالترتيب [h1, a1, a8, h8] كما في TS (CORNER_KEYS).
    النقاط الهدف: h1→(1024,1024)، a1→(0,1024)، a8→(0,0)، h8→(1024,0)
    """
    target = [
        [BOARD_SIZE, BOARD_SIZE],
        [0, BOARD_SIZE],
        [0, 0],
        [BOARD_SIZE, 0],
    ]
    return get_perspective_transform(target, keypoints)


def get_inv_transform(keypoints):
    """المصفوفة العكسية: بكسلات الصورة → لوحة اللعب (مثل getInvTransform في TS)."""
    return np.linalg.inv(get_transform_for_corners(keypoints))


def transform_centers(inv_transform):
    """مراكز المربعات الـ64 في إحداثيات الصورة (نفس transformCenters في TS).

    الترتيب مطابق لـ SQUARE_NAMES (a1..h8): y = (7.5 - (rank-1)) * SQUARE_SIZE
    يعيد [64,2] بمركز كل مربع.
    """
    warped = np.zeros((64, 3), dtype=np.float64)
    for i, name in enumerate(SQUARE_NAMES):
        file_i = i % 8
        rank_i = i // 8  # 0 = الرتبة 1
        xx = (0.5 + file_i) * SQUARE_SIZE
        yy = (7.5 - rank_i) * SQUARE_SIZE
        warped[i] = [xx, yy, 1.0]
    return perspective_transform(warped, inv_transform)


def transform_boundary(inv_transform):
    """حدود الرقعة موسّعة نصف مربع في كل اتجاه (نفس transformBoundary في TS).

    يعيد [4,2]: أربع زوايا الحد بالترتيب (أعلى-يسار، أسفل-يسار، أسفل-يمين، أعلى-يمين)
    في فضاء اللوحة: (-0.5,-0.5), (-0.5,8.5), (8.5,8.5), (8.5,-0.5) × SQUARE_SIZE
    """
    warped = [
        [-0.5 * SQUARE_SIZE, -0.5 * SQUARE_SIZE, 1],
        [-0.5 * SQUARE_SIZE, 8.5 * SQUARE_SIZE, 1],
        [8.5 * SQUARE_SIZE, 8.5 * SQUARE_SIZE, 1],
        [8.5 * SQUARE_SIZE, -0.5 * SQUARE_SIZE, 1],
    ]
    return perspective_transform(warped, inv_transform)
