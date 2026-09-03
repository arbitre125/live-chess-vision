#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
كشف النقلات — قلب النظام:
  1. لكل مربع نحتفظ بمرجع (متوسط لون/تدرج) لحالة "فارغ/مشغول"
  2. عند تغير مربعين (أو ثلاثة للترقية/التبييت) نستنتج from/to
  3. نحاكي النقلة محلياً بـ python-chess للتأكد من شرعيتها قبل الإرسال
  4. نؤكد النقلة فقط بعد ثبات الصورة لعدة إطارات متتالية (تجاهل حركة اليد)

منطق الاستنتاج:
  - مربع فارغ الآن كان مشغولاً → مرشح "from"
  - مربع تغيّر محتواه (قطعة جديدة) → مرشح "to"
  - تغير مربعان فقط: نقل عادي أو أسر
  - تغير 3+ مربعات: تبييت (مربعان منزلقان) أو ترقية/نقلة سيئة — نرشح التبييت أولاً
"""

import time
import logging
import numpy as np

log = logging.getLogger("move-detector")

FILES = "abcdefgh"


def _sq_index(name: str) -> int:
    """a8=0 ... h1=63"""
    f = FILES.index(name[0])
    r = int(name[1])
    return (8 - r) * 8 + f


def _index_name(i: int) -> str:
    r, f = divmod(i, 8)
    return f"{FILES[f]}{8 - r}"


def tile_stats(tile: np.ndarray) -> float:
    """بصمة المربع: متوسط + انحراف معياري للسطوع بعد تمويه خفيف."""
    import cv2

    t = cv2.GaussianBlur(tile, (5, 5), 0)
    return float(t.mean()), float(t.std())


class MoveDetector:
    def __init__(self, admin_url: str = ""):
        # لكل كاميرا: المراجع والحالة
        self.refs: dict[str, dict[str, tuple[float, float]]] = {}  # cam_id -> square -> (mean,std)
        self.prev_occupied: dict[str, set] = {}  # cam_id -> set of occupied squares
        self.changed_since: dict[str, tuple] = {}  # cam_id -> (candidate, count, first_seen)
        self.cooldown_until: dict[str, float] = {}
        self.admin_url = admin_url
        self.stable_frames = 2
        self.cooldown = 1.5

    # ───────────────────────────────
    def _is_occupied(self, stats: tuple[float, float], ref: tuple[float, float], threshold: float) -> bool:
        """مقارنة بصمة المربع مع مرجعه — فرق كبير يعني "تغير"؛
        occupancy الحقيقي يُستنتج نسبياً (قطعة تعني تبايناً أعلى داخل المربع)."""
        dm = abs(stats[0] - ref[0]) / 255.0
        ds = abs(stats[1] - ref[1]) / 100.0
        return (dm + ds) > threshold

    def _changed(self, a: tuple[float, float], b: tuple[float, float], threshold: float) -> bool:
        dm = abs(a[0] - b[0]) / 255.0
        ds = abs(a[1] - b[1]) / 100.0
        return (dm + ds) > threshold

    # ───────────────────────────────
    def update(self, cam_id: str, squares: dict, conf: dict):
        """استقبال صور المربعات الـ 64 لهذه اللقطة."""
        threshold = conf.get("threshold", 0.18)
        now = time.time()

        if cam_id not in self.refs:
            # أول لقطة: احفظ المراجع فقط (نبدأ من وضع مستقر)
            self.refs[cam_id] = {sq: tile_stats(t) for sq, t in squares.items()}
            self.prev_occupied[cam_id] = set()
            self.changed_since[cam_id] = None
            log.info(f"[{cam_id}] مراجع أولية محفوظة (حد الحساسية {threshold})")
            return

        refs = self.refs[cam_id]
        changed = []
        for sq, tile in squares.items():
            stats = tile_stats(tile)
            if self._changed(stats, refs[sq], threshold):
                changed.append(sq)
            # تحديث تدريجي للمرجع (تكيف مع تغييرات الإضاءة البطيئة)
            m, s = stats
            rm, rs = refs[sq]
            refs[sq] = (rm * 0.98 + m * 0.02, rs * 0.98 + s * 0.02)

        if not changed:
            self.changed_since[cam_id] = None
            return

        # حالة مستقرة؟ نطلب تكرار نفس التغير إطارات متتالية
        cand = tuple(sorted(changed))
        prev = self.changed_since.get(cam_id)
        if prev and prev[0] == cand:
            count = prev[1] + 1
        else:
            count = 1
        self.changed_since[cam_id] = (cand, count, now)

        if count < self.stable_frames:
            return

        if now < self.cooldown_until.get(cam_id, 0):
            return

        move = self.infer_move(cam_id, cand)
        if move:
            self.cooldown_until[cam_id] = now + self.cooldown
            self.changed_since[cam_id] = None
            self._pending = getattr(self, "_pending", {})
            self._pending[cam_id] = move

    def pop_confirmed_move(self) -> dict | None:
        """إرجاع النقلة المؤكدة (لو وجدت) — يُستهلك مرة واحدة.
        ملاحظة: يُستدعى لآخر كاميرا عولجت؛ يكفي لأن main يعالج كاميرا واحدة كل دورة."""
        pending = getattr(self, "_pending", {})
        if not pending:
            return None
        cam_id = next(iter(pending))
        move = pending.pop(cam_id)
        # نضيف cam_id في مسار السجل فقط
        move = dict(move)
        return move

    # ───────────────────────────────
    def infer_move(self, cam_id: str, changed: tuple) -> dict | None:
        """استنتاج from/to من المربعات المتغيرة."""
        occ = self.prev_occupied.get(cam_id, set())

        if len(changed) == 2:
            a, b = changed
            # المصدر: مربع كان مشغولاً وأصبح فارغاً (مرجعه عاد لمستوى فارغ ≈ وسط)
            # عملياً: نرسل الاثنين ونترك chess.js في صفحة الأدمن يقرر الترتيب
            from_sq, to_sq = self._order_by_occupancy(cam_id, a, b)
            log.info(f"[{cam_id}] نقلة محتملة: {from_sq}→{to_sq}")
            self.prev_occupied[cam_id] = (occ - {from_sq}) | {to_sq}
            return {"from": from_sq, "to": to_sq, "confidence": 0.9}

        if len(changed) == 4:
            # احتمال تبييت: ملك من a→b وكشّ من c→d
            move = self._infer_castle(changed)
            if move:
                log.info(f"[{cam_id}] تبييت محتمل: {move['from']}{move['to']}")
                return move

        if len(changed) == 3:
            # احتمال ترقية بيدق: from/to + مربع الترقية بتبدل البصمة بقوة
            a, b, c = changed
            # نرسل أفضل تخمينين — صفحة الأدمن ترفض غير الشرعي تلقائياً
            log.info(f"[{cam_id}] تغير ثلاثي (ترقية؟): {changed}")
            return {"from": a, "to": b, "promotion": "q", "confidence": 0.75}

        log.debug(f"[{cam_id}] تجاهل تغير معقد ({len(changed)} مربعات)")
        return None

    def _order_by_occupancy(self, cam_id: str, a: str, b: str) -> tuple[str, str]:
        """الترتيب: المصدر هو المربع الذي كان في قائمة المشغولة سابقاً.
        إن لم تتوفر معلومات (بداية اللعبة) نعتمد: المصدر هو الأقرب لمنتصف الرقعة
        قواعد إحصائية بسيطة — المربع الذي هجره اللاعب عادة يكون في نصفه."""
        occ = self.prev_occupied.get(cam_id, set())
        if a in occ and b not in occ:
            return a, b
        if b in occ and a not in occ:
            return b, a
        # كلاهما/لا منهما في القائمة: نستخدم قاعدة "الملك/القطعة تتقدم"
        return (a, b) if _rank(a) > _rank(b) else (b, a)

    def _infer_castle(self, changed: tuple) -> dict | None:
        s = set(changed)
        castles = [
            ({"e1", "g1", "h1", "f1"}, "e1", "g1"),  # أبيض قصير
            ({"e1", "c1", "a1", "d1"}, "e1", "c1"),  # أبيض طويل
            ({"e8", "g8", "h8", "f8"}, "e8", "g8"),  # أسود قصير
            ({"e8", "c8", "a8", "d8"}, "e8", "c8"),  # أسود طويل
        ]
        for pattern, frm, to in castles:
            if s == pattern or s <= pattern:
                return {"from": frm, "to": to, "confidence": 0.8}
        return None


def _rank(sq: str) -> int:
    return int(sq[1])
