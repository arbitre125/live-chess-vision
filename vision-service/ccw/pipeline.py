# -*- coding: utf-8 -*-
"""
متتبع الرقعة — دمج كل مراحل المنفذ في حلقة واحدة (نظير حلقة findPieces
في CameraChessWeb) مع إضافات التشغيل المركزي:
  - معايرة بزوايا إطار الكاميرا الكامل (كاميرا واحدة ← عدة رقع)
  - أحداث نقلات جاهزة للرفع إلى صفحة الأدمن
  - وضع «التقاط الوضعية» لبناء FEN البداية
"""
import time
import chess
import numpy as np

from .infer import CcwModels
from .warp import get_inv_transform, transform_centers, transform_boundary
from .squares import get_box_centers, get_squares, get_update, update_state
from .moves import get_moves_pairs, process_state
from .fen import board_from_state

GREEDY_DELAY_MS = 1000  # نفس ثانية التأخير في TS قبل قبول النقلة المفردة


class MoveEvent:
    __slots__ = ("san", "uci", "from_sq", "to_sq", "score", "is_pair", "ts")

    def __init__(self, san, uci, from_sq, to_sq, score, is_pair):
        self.san = san
        self.uci = uci
        self.from_sq = from_sq
        self.to_sq = to_sq
        self.score = round(float(score), 3)
        self.is_pair = is_pair
        self.ts = time.time()

    def to_dict(self):
        return {
            "san": self.san, "uci": self.uci,
            "from": self.from_sq, "to": self.to_sq,
            "score": self.score, "isPair": self.is_pair, "ts": self.ts,
        }


class BoardTracker:
    """حالة رقعة واحدة مُراقبة بإحداثيات زوايا معروفة في إطار كاميرا."""

    def __init__(self, board_id, corners, start_fen=None, decay=0.5):
        self.board_id = board_id
        self.corners = np.asarray(corners, dtype=np.float64)  # [4,2] h1,a1,a8,h8
        self._recompute_geometry()
        self.decay = decay
        self.state = np.zeros((64, 12), dtype=np.float64)
        self.board = chess.Board(start_fen) if start_fen else chess.Board()
        self.pairs_cache = get_moves_pairs(self.board)
        self.possible_moves: set[str] = set()
        self.greedy_time: dict[str, float] = {}
        self.last_uci = None
        self.last_frame_hash = None
        self.last_processed = 0.0
        self.frames_seen = 0

    def _recompute_geometry(self):
        inv = get_inv_transform(self.corners)
        self.square_centers = transform_centers(inv)   # [64,2]
        self.boundary = transform_boundary(inv)        # [4,2]

    def set_corners(self, corners):
        self.corners = np.asarray(corners, dtype=np.float64)
        self._recompute_geometry()
        self.state = np.zeros((64, 12), dtype=np.float64)

    def reset(self, start_fen=None):
        self.board = chess.Board(start_fen) if start_fen else chess.Board()
        self.state = np.zeros((64, 12), dtype=np.float64)
        self.pairs_cache = get_moves_pairs(self.board)
        self.possible_moves.clear()
        self.greedy_time.clear()
        self.last_uci = None

    def capture_position(self, frame_bgr, models, turn_color=chess.WHITE):
        """يقرأ الوضعية الحالية كاملة ويجعلها نقطة البداية (نظير findFen)."""
        boxes, scores = models.detect_pieces(frame_bgr, keypoints=self.corners.tolist())
        if len(boxes) == 0:
            return None, "لا قطع مرئية"
        centers = get_box_centers(boxes)
        sq = get_squares(centers, self.square_centers, self.boundary)
        upd = get_update(scores, sq)
        fen, error = board_from_state(upd, turn_color)
        if error:
            return None, error
        self.reset(fen)
        return fen, None

    def process_frame(self, frame_bgr, models, now_ms=None):
        """يعالج إطاراً ويعيد قائمة أحداث النقلات المقبولة (0 أو 1 أو 2)."""
        self.frames_seen += 1
        boxes, scores = models.detect_pieces(frame_bgr, keypoints=self.corners.tolist())
        if len(boxes) == 0:
            return []
        centers = get_box_centers(boxes)
        sq = get_squares(centers, self.square_centers, self.boundary)
        upd = get_update(scores, sq)
        self.state = update_state(self.state, upd, self.decay)

        best1, best2, joint, best_move, best_moves = process_state(
            self.state, self.pairs_cache, self.possible_moves)

        events: list[MoveEvent] = []
        now = now_ms if now_ms is not None else time.time() * 1000.0
        has_move = False

        # قبول زوج نقلات (نقلتان بين إطارين) — كما في TS
        if best_moves is not None and best2 > 0 and joint > 0:
            san1, san2 = best_moves.sans
            for san in (san1, san2):
                mv = self._try_play_san(san)
                if mv is None:
                    events = []  # فشل تطبيق زوج — تجاهل الدفعة (كما يرفض chessops)
                    has_move = False
                    break
                events.append(mv)
                has_move = True
        # قبول نقلة مفردة بعد مهلة ثانية — النظير الجشع في TS
        if not has_move and best_move is not None and best1 > 0:
            san = best_move.sans[0]
            self.greedy_time.setdefault(san, now)
            elapsed = (now - self.greedy_time[san]) > GREEDY_DELAY_MS
            mv_candidate = self._parse_san(san)
            new_uci = mv_candidate.uci() if mv_candidate else None
            if elapsed and new_uci and new_uci != self.last_uci:
                mv = self._try_play_san(san)
                if mv is not None:
                    events.append(mv)
                    self.greedy_time.clear()

        if events:
            self.possible_moves.clear()
            self.pairs_cache = get_moves_pairs(self.board)
            self.last_uci = events[-1].uci
        return events

    def _parse_san(self, san):
        try:
            return self.board.parse_san(san)
        except Exception:
            return None

    def _try_play_san(self, san):
        mv = self._parse_san(san)
        if mv is None:
            return None
        uci = mv.uci()
        self.board.push(mv)
        return MoveEvent(san, uci, chess.square_name(mv.from_square),
                         chess.square_name(mv.to_square), 1.0, False)
