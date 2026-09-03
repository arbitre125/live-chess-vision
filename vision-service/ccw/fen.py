# -*- coding: utf-8 -*-
"""
بناء FEN من حالة الاحتلال — منفذ من CameraChessWeb src/utils/findFen.tsx
(setFenFromState / getFenAndError)

يُستخدم في «وضع المعايرة اليدوية»: الكاميرا تلتقط الوضعية الحالية للرقعة
وتحوّلها إلى FEN بداية، ثم يتتبع النظام النقلات فوقها.
"""
import chess
import numpy as np

from .constants import SQUARE_NAMES, PIECE_SYMBOLS, LABEL_MAP, LABEL_TO_PIECE

# فئات القطع عدا الملكين — نفس remainingPieceIdxs في TS
REMAINING_CLASSES = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11]
WHITE_KING_CLASS = 7   # "K"
BLACK_KING_CLASS = 1   # "k"
MIN_PIECE_SCORE = 0.3  # نفس العتبة في TS
LABELS_LIST = ["b", "k", "n", "p", "q", "r", "B", "K", "N", "P", "Q", "R"]


def fen_and_error(board, turn_color):
    """نفس getFenAndError في TS: يرفض وضعية يكون فيها الخصم مُكشَفاً
    بينما الدور على الجهة الأخرى."""
    other = not turn_color
    other_king = board.king(other)
    if other_king is not None:
        if board.attackers(turn_color, other_king):
            return board.fen(), "الجهة التي عليها الدور تكشف ملك الخصم"
    return board.fen(), None


def board_from_state(state, turn_color=chess.WHITE):
    """يبني رقعة python-chess من مصفوفة الاحتلال [64,12].

    الترتيب كما في TS: الملك الأسود أولاً (أعلى درجة k)، ثم الملك الأبيض،
    ثم بقية الفئات بعتبة 0.3 مع منع البيادق على الرتبتين 1 و8.
    """
    assignment = np.full(64, -1, dtype=int)

    black_idx = int(np.argmax(state[:, BLACK_KING_CLASS]))
    assignment[black_idx] = BLACK_KING_CLASS

    white_scores = state[:, WHITE_KING_CLASS].copy()
    white_scores[black_idx] = -1
    white_idx = int(np.argmax(white_scores))
    assignment[white_idx] = WHITE_KING_CLASS

    for i in range(64):
        if assignment[i] != -1:
            continue
        name = SQUARE_NAMES[i]
        bad_rank = name.endswith("1") or name.endswith("8")
        best_j, best_s = None, MIN_PIECE_SCORE
        for j in REMAINING_CLASSES:
            if bad_rank and PIECE_SYMBOLS[j % 6] == "pawn":
                continue
            if state[i][j] > best_s:
                best_j, best_s = j, state[i][j]
        if best_j is not None:
            assignment[i] = best_j

    board = chess.Board(None)  # رقعة فارغة (كما في TS يبدأ من k3/4K3)
    board.turn = turn_color
    board.clear_stack()
    for i in range(64):
        j = assignment[i]
        if j == -1:
            continue
        piece_type = LABEL_TO_PIECE[LABELS_LIST[j]]
        color = chess.WHITE if j > 5 else chess.BLACK
        board.set_piece_at(i, chess.Piece(piece_type, color))

    board.fullmove_number = 1
    board.halfmove_clock = 0
    _infer_castling(board)
    fen, error = fen_and_error(board, turn_color)
    return fen, error


def _infer_castling(board):
    """يستنتج حقوق التبييت من مواقع الملوك والرخ (لا يمكن قراءتها من صورة)."""
    rights = ""
    wk = board.piece_at(chess.E1)
    bk = board.piece_at(chess.E8)
    if wk is not None and wk.piece_type == chess.KING and wk.color == chess.WHITE:
        r = board.piece_at(chess.H1)
        if r is not None and r.piece_type == chess.ROOK and r.color == chess.WHITE:
            rights += "K"
        r = board.piece_at(chess.A1)
        if r is not None and r.piece_type == chess.ROOK and r.color == chess.WHITE:
            rights += "Q"
    if bk is not None and bk.piece_type == chess.KING and bk.color == chess.BLACK:
        r = board.piece_at(chess.H8)
        if r is not None and r.piece_type == chess.ROOK and r.color == chess.BLACK:
            rights += "k"
        r = board.piece_at(chess.A8)
        if r is not None and r.piece_type == chess.ROOK and r.color == chess.BLACK:
            rights += "q"
    board.set_castling_fen(rights if rights else "-")
