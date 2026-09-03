# -*- coding: utf-8 -*-
"""
مطابقة القطع للمربعات وبناء حالة الاحتلال — منفذ من:
  CameraChessWeb src/utils/findPieces.tsx
    (getBoxCenters / getSquares / getUpdate / updateState)
"""
import numpy as np


def get_box_centers(boxes):
    """مراكز الصناديق مع إزاحة رأسية /3 — نفس getBoxCenters في TS حرفياً.

    الإزاحة (cy = b - (r-l)/3) تراعي أن القطع تقف على المربع بجسم مائل
    عند زوايا تصوير مائلة.
    """
    l, t, r, b = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    cx = (l + r) / 2
    cy = b - (r - l) / 3
    return np.stack([cx, cy], axis=1)


def get_squares(box_centers, square_centers, boundary):
    """أقرب مربع لكل قطعة + رفض القطع خارج حدود الرقعة (نفس getSquares في TS).

    box_centers:   [N,2] مراكز القطع المكتشفة (بكسلات الإطار)
    square_centers:[64,2] مراكز المربعات (بكسلات الإطار، a1..h8)
    boundary:      [4,2] زوايا حد الرقعة الموسّع (بكسلات الإطار)
    يعيد: [N] فهرس المربع 0..63 أو -1 إذا كانت خارج الرقعة
    """
    bc = np.asarray(box_centers, dtype=np.float64)
    sc = np.asarray(square_centers, dtype=np.float64)
    d2 = ((bc[:, None, :] - sc[None, :, :]) ** 2).sum(axis=2)
    squares = d2.argmin(axis=1)  # [N]

    # التحقق من الجهة (cross product) مع كل حرف من حدود الرقعة — كما في TS
    shifted = np.roll(boundary, -1, axis=0)  # shifted[i] = boundary[(i+1)%4]
    a = boundary[:, 0] - shifted[:, 0]       # [4]
    b_ = boundary[:, 1] - shifted[:, 1]      # [4]
    c = bc[:, 0:1] - shifted[None, :, 0]     # [N,4]
    d = bc[:, 1:2] - shifted[None, :, 1]     # [N,4]
    det = a[None, :] * d - b_[None, :] * c   # [N,4]
    outside = (det < 0).any(axis=1)
    squares[outside] = -1
    return squares


def get_update(scores, squares, n_classes=12):
    """تجميع أقصى درجة لكل مربع — نفس getUpdate في TS.

    scores:  [N,C] درجات الفئات لكل قطعة مكتشفة
    squares: [N] فهرس المربع أو -1
    يعيد: [64,C]
    """
    update = np.zeros((64, n_classes), dtype=np.float64)
    for i, sq in enumerate(squares):
        if sq is None or sq < 0 or sq >= 64:
            continue
        np.maximum(update[sq], scores[i][:n_classes], out=update[sq])
    return update


def update_state(state, update, decay=0.5):
    """تنعيم أسّي للحالة — نفس updateState في TS: state = d*state + (1-d)*update."""
    return decay * state + (1 - decay) * update
