# -*- coding: utf-8 -*-
"""
مصدر كاميرا افتراضي — Virtual Camera Source (تجربة بدون عتاد)

يولّد إطارات اصطناعية لرقعة شطرنج بمنظور خفيف + علامات × حول الزوايا
(نمط xcorners) ويلعب نقلات قانونية عبر python-chess — نفس فكرة الكاميرا
الافتراضية في صفحة الأدمن لكن داخل خدمة الرؤية، لتجربة كامل خط المعالجة
(اكتشاف الرقع، استخراج FEN، إرسال النقلات) بدون أي كاميرا حقيقية.

الاستخدام: سجّل كاميرا من النوع virtual:
    POST /api/vision/cameras/{id}   {"kind": "virtual", "url": "virtual://normal"}
    (السرعة: virtual://slow | virtual://normal | virtual://fast)
"""
import math
import time

import cv2
import numpy as np

try:
    import chess
except ImportError:  # pragma: no cover
    chess = None

# رباعية الرقعة (نسب من الإطار) بترتيب [h1, a1, a8, h8]
QUAD_REL = [(0.742, 0.810), (0.336, 0.771), (0.367, 0.293), (0.773, 0.332)]

SPEEDS = {"slow": 5.0, "normal": 2.5, "fast": 1.1}

# رموز القطع — PIL مع خط يدعم الشطرنج إن وُجد، وإلا حروف ASCII
GLYPHS = {
    "K": "♔", "Q": "♕", "R": "♖", "B": "♗", "N": "♘", "P": "♙",
    "k": "♚", "q": "♛", "r": "♜", "b": "♝", "n": "♞", "p": "♟",
}

_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]


def _load_font(size):
    """يحاول تحميل خط يدعم رموز الشطرنج (PIL) — يعيد None إن فشل."""
    try:
        from PIL import ImageFont
        for path in _FONT_CANDIDATES:
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    except ImportError:
        pass
    return None


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _board_point(quad, u, v):
    """u: 0=a → 1=h، v: 0=الرتبة 8 (أعلى) → 1=الرتبة 1 (أسفل)."""
    tl, tr, br, bl = quad[2], quad[3], quad[0], quad[1]
    return _lerp(_lerp(tl, tr, u), _lerp(bl, br, u), v)


class VirtualBoardSource:
    """مولّد إطارات رقعة افتراضية بنقلات قانونية متسلسلة."""

    def __init__(self, width=1280, height=1024, speed="normal"):
        self.width = width
        self.height = height
        self.move_interval = SPEEDS.get(speed, SPEEDS["normal"])
        self.board = chess.Board() if chess else None
        self.last_move = None
        self._last_move_ts = 0.0
        self._font = None
        self._font_size = 0

    # ------------------------------------------------------------------ #
    def next_frame(self):
        """إطار واحد؛ يقدّم نقلة قانونية عند حلول موعدها."""
        if self.board is not None and time.time() - self._last_move_ts >= self.move_interval:
            moves = list(self.board.legal_moves)
            if not moves:
                self.board.reset()
                self.last_move = None
            else:
                # يفضّل الأخذ أحياناً — عرض أقرب لسير لعبة حقيقية
                caps = [m for m in moves if self.board.is_capture(m)]
                mv = (caps[np.random.randint(len(caps))]
                      if caps and np.random.random() < 0.35
                      else moves[np.random.randint(len(moves))])
                self.board.push(mv)
                self.last_move = (mv.from_square, mv.to_square)
            self._last_move_ts = time.time()
        return self._draw()

    # ------------------------------------------------------------------ #
    def _square_name(self, sq):
        return chess.square_name(sq) if chess else "a1"

    def _piece_at(self, square_name):
        if chess is None:
            return None
        sq = chess.parse_square(square_name)
        return self.board.piece_at(sq)

    def _draw(self):
        W, H = self.width, self.height
        frame = np.full((H, W, 3), (18, 26, 20), dtype=np.uint8)
        # تدرج خفيف للخلفية
        grad = np.linspace(0, 1, H, dtype=np.float32)[:, None]
        frame[:, :, 0] = (frame[:, :, 0] * (0.6 + 0.4 * (1 - grad))).astype(np.uint8)

        quad = [(x * W, y * H) for x, y in QUAD_REL]
        cx = sum(p[0] for p in quad) / 4
        cy = sum(p[1] for p in quad) / 4

        # ظل/طاولة خشبية
        wood = np.array([[(cx + (p[0] - cx) * 1.09), (cy + (p[1] - cy) * 1.09)] for p in quad],
                        dtype=np.int32)
        cv2.fillPoly(frame, [wood], (49, 67, 93))          # BGR خشب داكن
        cv2.polylines(frame, [wood], True, (20, 20, 20), 2)

        area = 0.5 * abs(
            (quad[1][0] - quad[0][0]) * (quad[2][1] - quad[0][1])
            - (quad[2][0] - quad[0][0]) * (quad[1][1] - quad[0][1])
        )
        sq_size = max(18.0, math.sqrt(area) / 8)

        # المربعات والقطع عبر تحويل خطي رباعي (بيلينيار)
        pil_img, pil_draw = None, None
        if self._font_size != int(sq_size * 0.92):
            self._font = _load_font(int(sq_size * 0.92))
            self._font_size = int(sq_size * 0.92)

        # التمريرة 1: كل المربعات (عبر تحويل بيلينيار) + إبراز آخر نقلة
        last_sq = {self._square_name(s) for s in self.last_move} if self.last_move else set()
        for r in range(8):          # r=0 → الرتبة 8 (أعلى)
            for f in range(8):
                u0, u1 = f / 8, (f + 1) / 8
                v0, v1 = r / 8, (r + 1) / 8
                pts = np.array([
                    _board_point(quad, u0, v0), _board_point(quad, u1, v0),
                    _board_point(quad, u1, v1), _board_point(quad, u0, v1),
                ], dtype=np.int32)
                color = (176, 211, 230) if (f + r) % 2 == 0 else (52, 90, 138)  # BGR
                cv2.fillPoly(frame, [pts], color)
                cv2.polylines(frame, [pts], True, (45, 45, 45), 1)
                name = "abcdefgh"[f] + str(8 - r)
                if name in last_sq:
                    cv2.fillPoly(frame, [pts], (60, 180, 240))  # إبراز النقلة الأخيرة

        # التمريرة 2: القطع فوق المربعات (PIL للرموز أو ASCII كبديل)
        pil_img, pil_draw = None, None
        for r in range(8):
            for f in range(8):
                name = "abcdefgh"[f] + str(8 - r)
                piece = self._piece_at(name)
                if piece is None:
                    continue
                u0, u1 = f / 8, (f + 1) / 8
                v0, v1 = r / 8, (r + 1) / 8
                center = _board_point(quad, (u0 + u1) / 2, (v0 + v1) / 2)
                if self._font is not None:
                    if pil_img is None:
                        from PIL import Image, ImageDraw
                        pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                        pil_draw = ImageDraw.Draw(pil_img)
                    glyph = GLYPHS[piece.symbol()]  # P→♙ أبيض، p→♟ أسود
                    col = (250, 250, 245) if piece.color == chess.WHITE else (25, 25, 25)
                    outline = (25, 25, 25) if piece.color == chess.WHITE else (245, 245, 245)
                    self._draw_glyph(pil_draw, glyph, center, col, outline, self._font)
                else:
                    # بديل: حرف ASCII داخل دائرة
                    col = (245, 245, 245) if piece.color == chess.WHITE else (25, 25, 25)
                    cv2.circle(frame, (int(center[0]), int(center[1])), int(sq_size * 0.42),
                               col, -1)
                    letter = piece.symbol().upper() if piece.color == chess.WHITE else piece.symbol().lower()
                    cv2.putText(frame, letter, (int(center[0] - sq_size * 0.22),
                                                int(center[1] + sq_size * 0.2)),
                                cv2.FONT_HERSHEY_SIMPLEX, sq_size / 55.0,
                                (0 if piece.color == chess.WHITE else 255), 2)

        if pil_img is not None:
            frame = cv2.cvtColor(np.asarray(pil_img), cv2.COLOR_RGB2BGR)

        # علامات × حول الرقعة (زوايا + منتصفات الأضلاع)
        marks = []
        for i in range(4):
            marks.append(quad[i])
            marks.append(_lerp(quad[i], quad[(i + 1) % 4], 0.5))
        ms = max(6.0, min(W, H) * 0.013)
        for m in marks:
            dx, dy = m[0] - cx, m[1] - cy
            ln = math.hypot(dx, dy) or 1.0
            off = min(W, H) * 0.045
            x, y = m[0] + dx / ln * off, m[1] + dy / ln * off
            cv2.line(frame, (int(x - ms), int(y - ms)), (int(x + ms), int(y + ms)), (94, 63, 244), 3)
            cv2.line(frame, (int(x + ms), int(y - ms)), (int(x - ms), int(y + ms)), (94, 63, 244), 3)

        # شريط معلومات OSD
        fs = max(0.55, H / 1600.0)
        cv2.putText(frame, "LIVE - VirtualCam (vision-service)", (int(W * 0.03), int(H * 0.055)),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, (235, 235, 235), 2)
        cv2.putText(frame, f"{W}x{H} 2 fps", (int(W * 0.72), int(H * 0.055)),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, (235, 235, 235), 2)
        cv2.putText(frame, time.strftime("%H:%M:%S"), (int(W * 0.03), int(H * 0.955)),
                    cv2.FONT_HERSHEY_SIMPLEX, fs, (235, 235, 235), 2)
        return frame

    @staticmethod
    def _draw_glyph(draw, glyph, center, color, outline, font):
        """رسم رمز قطعة مع تحديد خارجي بسيط عبر إزاحات."""
        x, y = center
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            draw.text((x + dx, y + dy), glyph, fill=outline, anchor="mm", font=font)
        draw.text((x, y), glyph, fill=color, anchor="mm", font=font)


def make_virtual_generator(width=1280, height=1024, speed="normal"):
    """يعيد دالة تستدعى دورياً لإنتاج الإطار التالي."""
    src = VirtualBoardSource(width, height, speed)
    return src.next_frame
