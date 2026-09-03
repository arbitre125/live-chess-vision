# -*- coding: utf-8 -*-
"""
الاكتشاف التلقائي للرقع في إطار الكاميرا — منفذ من:
  CameraChessWeb src/utils/findCorners.tsx
    (getQuads عبر Delaunay + scoreQuad + findOffset + calculateKeypoints)

التوسعة على الأصل: بدلاً من اختيار أفضل رقعة واحدة، يعيد كل الرقع
الممكنة في الإطار — ليتسع لكاميرا واحدة أن تغطي 3–4 رقع تلقائياً.

متطلب: على كل رقعة تُطبع علامات × صغيرة (نمط xcorners الخاص بالمشروع
الأصلي) في تقاطعات المربعات الداخلية 7×7 — انظر docs/print/ لقالب الطباعة.
"""
import numpy as np

try:
    from scipy.spatial import Delaunay
    _HAS_SCIPY = True
except ImportError:  # pragma: no cover
    _HAS_SCIPY = False

from .constants import SQUARE_SIZE, BOARD_SIZE, MODEL_WIDTH, MODEL_HEIGHT
from .warp import perspective_transform, get_perspective_transform

# شبكة 7×7 لنقاط × الداخلية — نفس GRID في TS
GRID = np.array([[x, y] for y in range(7) for x in range(7)], dtype=np.float64)
# الرباعية المثالية — نفس IDEAL_QUAD في TS
IDEAL_QUAD = np.array([[0, 1], [1, 1], [1, 0], [0, 0]], dtype=np.float64)


def _cdist_min_sum(grid, points):
    """مجموع أقرب مسافة لكل نقطة شبكة (نفس assignmentCost في TS)."""
    d2 = ((grid[:, None, :] - points[None, :, :]) ** 2).sum(axis=2)
    return np.sqrt(d2).min(axis=1).sum()


def _calculate_offset_score(warped_xcorners, shift):
    grid = GRID + np.asarray(shift, dtype=np.float64)
    return 1.0 / (1.0 + _cdist_min_sum(grid, warped_xcorners))


def _find_offset(warped_xcorners):
    """بحث ثنائي عن أفضل إزاحة شبكة — منفذ حرفي من findOffset في TS."""
    best = [0, 0]
    for axis in range(2):
        low, high = -7, 1
        scores = {}
        while (high - low) > 1:
            mid = (high + low) >> 1
            for x in (mid, mid + 1):
                if x not in scores:
                    shift = [0, 0]
                    shift[axis] = x
                    scores[x] = _calculate_offset_score(warped_xcorners, shift)
            if scores[mid] > scores[mid + 1]:
                high = mid
            else:
                low = mid
        best[axis] = low + 1
    return best


def _quad_area(quad):
    """مساحة رباعية مضلع (شفرد)."""
    x = quad[:, 0]
    y = quad[:, 1]
    return 0.5 * abs(float(x @ np.roll(y, -1) - np.roll(x, -1) @ y))


def _score_quad(quad, xcorners):
    """نفس scoreQuad في TS: يحاول مطابقة شبكة 7×7 على الرباعية.

    يعيد (score, M, offset) — أو (-1.0, None, None) للرباعيات المنحلة.
    """
    # رفض الرباعيات المنحلة (نقاط شبه مستقيمة) قبل أي تحويل
    area = _quad_area(quad)
    if area < 1e-6:
        return -1.0, None, None
    try:
        M = get_perspective_transform(IDEAL_QUAD, quad)
    except np.linalg.LinAlgError:
        return -1.0, None, None
    warped = perspective_transform(xcorners, M)
    if not np.isfinite(warped).all():
        return -1.0, None, None
    offset = _find_offset(warped)
    score = _calculate_offset_score(warped, offset)
    if not np.isfinite(score):
        return -1.0, None, None
    return score, M, offset


def _get_quads(xcorners):
    """أرباع من أزواج المثلثات المتجاورة في مثلثات Delaunay.

    مثل الأصل (getQuads في TS) نبحث عن 4 نقاط تشكل خلية واحدة من الشبكة،
    مع تحسينين ضروريين في بايثون:
      1. ترتيب الرؤوس ترتيباً دائرياً (عكس عقارب الساعة حول المركز) حتى تكون
         الرباعية مضلعاً محدباً سليماً (ترتيب المثلثات الخام يكسر الشكل)
      2. إزالة التكرار بمجموعة فهارس النقاط (نفس الخلية تُنتج أزواجاً عدة)
    """
    if not _HAS_SCIPY:
        raise RuntimeError("scipy مطلوب للاكتشاف التلقائي: pip install scipy")
    pts = np.asarray(xcorners, dtype=np.float64)
    if len(pts) < 5:
        return []
    try:
        tri = Delaunay(pts)
    except Exception:
        return []
    triangles = tri.simplices  # [T,3]

    edges: dict = {}
    for ti, s in enumerate(triangles):
        for i in range(3):
            key = (min(s[i], s[(i + 1) % 3]), max(s[i], s[(i + 1) % 3]))
            edges.setdefault(key, []).append(ti)

    seen = set()
    quads = []
    for ti, s in enumerate(triangles):
        for i in range(3):
            key = (min(s[i], s[(i + 1) % 3]), max(s[i], s[(i + 1) % 3]))
            for tj in edges.get(key, []):
                if tj == ti:
                    continue
                quad_set = frozenset(triangles[ti]) | frozenset(triangles[tj])
                if len(quad_set) != 4:
                    continue
                if quad_set in seen:
                    continue
                seen.add(quad_set)
                idx = list(quad_set)
                qpts = pts[idx]
                # ترتيب دائري حول المركز (الخلية مضلع محدب دائماً)
                center = qpts.mean(axis=0)
                order = np.argsort(np.arctan2(qpts[:, 1] - center[1],
                                              qpts[:, 0] - center[0]))
                quad_idx = [idx[o] for o in order]
                quads.append((quad_idx, pts[quad_idx]))
    return quads


def _corners_from_quad(quad, xcorners):
    """زوايا الرقعة الأربع من رباعية مُقيّمة — منفذ findCornersFromXcorners."""
    score, M, offset = _score_quad(quad, xcorners)
    if score <= 0 or M is None:
        return -1.0, None
    inv = np.linalg.inv(M)
    warped_corners = [
        [offset[0] - 1, offset[1] - 1],
        [offset[0] - 1, offset[1] + 7],
        [offset[0] + 7, offset[1] + 7],
        [offset[0] + 7, offset[1] - 1],
    ]
    corners = perspective_transform(warped_corners, inv)
    return score, corners


def _orient_by_pieces(corners, black_centers, white_centers):
    """ترتيب الزوايا [h1,a1,a8,h8] حسب مواقع القطع — منفذ calculateKeypoints.

    مركز القطع البيضاء يجب أن يكون قرب حرف الرتبة الأولى، والأسود قرب
    حرف الرتبة الثامنة. نجرّب الدورانات الأربع ونأخذ الأفضل.
    """
    if len(black_centers) == 0 or len(white_centers) == 0:
        # بدون قطع كافية: افترض الترتيب الافتراضي (a1 أسفل-يسار في الصورة)
        return list(corners)
    wc = np.mean(white_centers, axis=0)
    bc = np.mean(black_centers, axis=0)
    best_shift, best_score = 0, -1.0
    for shift in range(4):
        cw = (corners[shift % 4] + corners[(shift + 1) % 4]) / 2
        cb = (corners[(shift + 2) % 4] + corners[(shift + 3) % 4]) / 2
        score = 1.0 / (1.0 + np.linalg.norm(wc - cw) + np.linalg.norm(bc - cb))
        if score > best_score:
            best_score, best_shift = score, shift
    return [corners[(best_shift + k) % 4] for k in range(4)]


def _board_points_from_quad(quad_idx, quad_pts, xcorners):
    """يجمع كل علامات × التي تنتمي لشبكة الرقعة المحددة بالرباعية.

    يطبق تحويل M (خلية مثالية → الرباعية) على كل النقاط، ثم يبقي
    النقاط القريبة من مواقع شبكة 7×7 ضمن امتداد اللوحة [-1..8].
    """
    score, M, offset = _score_quad(quad_pts, xcorners)
    if score <= 0 or M is None:
        return score, None, set()
    warped = perspective_transform(xcorners, M)
    # شبكة كاملة مع الإزاحة
    grid = GRID + np.asarray(offset, dtype=np.float64)
    d2 = ((warped[:, None, :] - grid[None, :, :]) ** 2).sum(axis=2)
    nearest = np.sqrt(d2).min(axis=1)
    nearest_idx = d2.argmin(axis=1)
    # داخل حدود اللوحة (الشبكة الداخلية 0..6) وبمسامحة نصف خلية
    gx, gy = nearest_idx // 7, nearest_idx % 7
    within = ((gx >= 0) & (gx <= 6) & (gy >= 0) & (gy <= 6))
    tol = 0.45
    members = set(np.where((nearest <= tol) & within)[0].tolist())
    return score, M, members


def discover_boards(models, frame_bgr, min_score=0.30):
    """اكتشاف كل الرقع في الإطار (توسعة للمنطق الأصلي على عدة رقع).

    الخوارزمية: اختر أفضل رباعية ← اجمع شبكتها كاملة ← أزل نقاطها ← كرر.
    يعيد قائمة: [{corners: [[x,y]×4 بترتيب h1,a1,a8,h8], score: float,
                  n_xcorners: int, n_pieces: int}]
    """
    pieces_boxes, pieces_scores = models.detect_pieces(frame_bgr)
    if len(pieces_boxes) == 0:
        return []
    centers = np.stack([
        (pieces_boxes[:, 0] + pieces_boxes[:, 2]) / 2,
        pieces_boxes[:, 3] - (pieces_boxes[:, 2] - pieces_boxes[:, 0]) / 3,
    ], axis=1)
    classes = pieces_scores.argmax(axis=1)
    black_centers = centers[classes <= 5]
    white_centers = centers[classes > 5]
    if len(black_centers) == 0 or len(white_centers) == 0:
        return []

    # منطقة القطع ككل ROI لنموذج آزوايا × (كما في runXcornersModel)
    keypoints = centers.tolist()
    xcorners, _ = models.detect_xcorners(frame_bgr, keypoints=keypoints)
    if len(xcorners) < 5:
        return []

    quads = _get_quads(xcorners)
    if not quads:
        return []

    # قيّم كل الرباعيات مرة واحدة
    scored = []
    for idx, pts in quads:
        s, M, off = _score_quad(pts, xcorners)
        if s > 0:
            scored.append((s, idx, pts))
    if not scored:
        return []
    scored.sort(key=lambda q: -q[0])

    remaining = set(range(len(xcorners)))
    boards = []
    floor = max(min_score, scored[0][0] * 0.8)
    for s, idx, pts in scored:
        if s < floor or len(remaining) < 5:
            continue
        if not set(idx) <= remaining:
            continue
        _, M, members = _board_points_from_quad(idx, pts, xcorners)
        if M is None or len(members) < 12:  # شبكة رقعة كاملة تُنتج 49 عضواً
            continue
        remaining -= members
        # زوايا الرقعة من امتداد الشبكة: [-1..7] حول الخلية
        inv = np.linalg.inv(M)
        # أوجد إزاحة الشبكة لهذه الخلية
        _, _, offset = _score_quad(pts, xcorners)
        warped_corners = [
            [offset[0] - 1, offset[1] - 1],
            [offset[0] - 1, offset[1] + 7],
            [offset[0] + 7, offset[1] + 7],
            [offset[0] + 7, offset[1] - 1],
        ]
        corners = perspective_transform(warped_corners, inv)
        corners = _orient_by_pieces(np.asarray(corners), black_centers, white_centers)
        boards.append({
            "corners": [[round(float(x), 1), round(float(y), 1)] for x, y in corners],
            "score": round(float(s), 3),
            "n_xcorners": len(members),
            "n_pieces": int(len(pieces_boxes)),
        })
    return boards


def snap_score(models, frame_bgr, corners):
    """يقيّم جودة زوايا معايرة موجودة (للتحقق الدوري من انزياح الكاميرا).

    يعيد الدرجة [0..1] — أقل من 0.5 تعني أن الرقعة انحرفت عن المعايرة.
    """
    blob, crop_hw, pads, roi = models.make_input(frame_bgr, keypoints=corners)
    preds = models.xcorners.run(None, {models.xcorners.get_inputs()[0].name: blob})[0]
    boxes, scores = models._postprocess(preds, crop_hw, pads, roi)
    max_scores = scores.max(axis=1)
    keep = max_scores >= 0.1
    boxes = boxes[keep]
    if len(boxes) < 5:
        return 0.0
    cx = (boxes[:, 0] + boxes[:, 2]) / 2
    cy = (boxes[:, 1] + boxes[:, 3]) / 2
    pts = np.stack([cx, cy], axis=1)

    # حوّل شبكة 7×7 الداخلية إلى إحداثيات الصورة عبر معايرة الرقعة ثم قِس
    from .warp import get_inv_transform, transform_centers, transform_boundary
    inv = get_inv_transform(corners)
    sc = transform_centers(inv)
    bd = transform_boundary(inv)
    # شبكة داخلية 7×7 = مراكز المربعات مقيدة بإطار الرقعة
    warped_grid = sc.reshape(8, 8, 2)
    inner = []
    for r in range(1, 8):
        for c in range(1, 8):
            a = warped_grid[r - 1, c - 1]
            b = warped_grid[r - 1, c]
            d = warped_grid[r, c - 1]
            e = warped_grid[r, c]
            # تقاطع تقريبي عبر منتصف الأقطار
            inner.append(((a + e) / 2 + (b + d) / 2) / 2)
    inner = np.asarray(inner)
    return 1.0 / (1.0 + _cdist_min_sum(inner, pts))
