# -*- coding: utf-8 -*-
"""
توليد أزواج النقلات المرشحة وتقييمها — منفذ حرفياً من:
  CameraChessWeb src/utils/moves.tsx   (getMovesPairs / getData / combineData)
  src/utils/findPieces.tsx             (calculateScore / processState)

الفكرة الذكية في الخوارزمية الأصلية:
  - لكل وضعية قانونية نولّد كل النقلات الممكنة (move1) وكل ردود الخصم (move2)
  - «زوج النقلات» يسمح بالتقاط نقلتين وقعتا بين إطارين (مفيد جداً عندما
    تتنقل الكاميرا بين عدة رقع وتعود للرقعة كل عدة ثوانٍ)
  - نقاط كل مرشح = (فراغ مربع المصدر) + (ظهور الفئة الصحيحة في مربع الهدف)
"""
import chess
import numpy as np

from .constants import LABEL_MAP, SQUARE_NAMES

# نفس castlingMap في TS: [من، إلى، فئة الرخ]
CASTLING_MAP = {
    "g1": (chess.H1, chess.F1, LABEL_MAP["R"]),
    "c1": (chess.A1, chess.D1, LABEL_MAP["R"]),
    "g8": (chess.H8, chess.F8, LABEL_MAP["r"]),
    "c8": (chess.A8, chess.D8, LABEL_MAP["r"]),
}

ROLE_TO_LETTER = {
    chess.KING: "k", chess.QUEEN: "q", chess.ROOK: "r",
    chess.BISHOP: "b", chess.KNIGHT: "n", chess.PAWN: "p",
}


def role_to_label(role, color):
    """نفس roleToLabel في TS."""
    letter = ROLE_TO_LETTER[role]
    return letter.upper() if color == chess.WHITE else letter.lower()


class MoveData:
    """بيانات مرشح نقلة — مطابق لـ MovesData في TS."""
    __slots__ = ("sans", "from_sq", "to_sq", "targets")

    def __init__(self, sans, from_sq, to_sq, targets):
        self.sans = sans          # [str] (واحدة أو اثنتان للأزواج)
        self.from_sq = from_sq    # [int]
        self.to_sq = to_sq        # [int]
        self.targets = targets    # [int] فئة الفئة الـ12 المتوقعة في كل هدف


class MovesPair:
    """مطابق لـ MovesPair في TS: move1 + رد move2 + دمجهما."""
    __slots__ = ("move1", "move2", "moves")

    def __init__(self, move1, move2, moves):
        self.move1 = move1
        self.move2 = move2
        self.moves = moves


def get_data(board, move):
    """نفس getData في TS — يبني بيانات نقلة واحدة (مع التبييت والأخذ بالتجاوز)."""
    piece = board.piece_at(move.from_square)
    if piece is None:
        return None

    from_sq = [move.from_square]
    to_sq = [move.to_square]

    # دور القطعة الظاهرة في الهدف = دور الترقية إن وجدت
    target_role = move.promotion if move.promotion else piece.piece_type
    targets = [LABEL_MAP[role_to_label(target_role, piece.color)]]

    if piece.piece_type == chess.KING and abs(move.to_square - move.from_square) == 2:
        # تبييت: أضف حركة الرخ (نفس فرع castling في TS)
        name = SQUARE_NAMES[move.to_square]
        if name in CASTLING_MAP:
            f, t, lbl = CASTLING_MAP[name]
            from_sq.append(f)
            to_sq.append(t)
            targets.append(lbl)
    elif (piece.piece_type == chess.PAWN
          and move.to_square != move.from_square
          and board.piece_at(move.to_square) is None
          and chess.square_file(move.from_square) != chess.square_file(move.to_square)):
        # أخذ بالتجاوز: أضف مربع البيدق المأخوذ (نفس فرع En Passant في TS)
        captured = chess.square(chess.square_file(move.to_square),
                                chess.square_rank(move.from_square))
        from_sq.append(captured)

    san = board.san(move)
    return MoveData([san], from_sq, to_sq, targets)


def combine_data(move1, move2):
    """نفس combineData في TS — دمج نقلتين متتاليتين مع استبعاد التداخل."""
    bad = set(move2.from_sq) | set(move2.to_sq)
    from1 = [s for s in move1.from_sq if s not in bad]
    to1, targets1 = [], []
    for i, t in enumerate(move1.to_sq):
        if t in bad:
            continue
        to1.append(t)
        targets1.append(move1.targets[i])
    return MoveData(
        [move1.sans[0], move2.sans[0]],
        from1 + list(move2.from_sq),
        to1 + list(move2.to_sq),
        targets1 + list(move2.targets),
    )


def get_moves_pairs(board):
    """نفس getMovesPairs في TS — كل النقلات القانونية وأزواجها مع ردود الخصم."""
    pairs = []
    for move1 in board.legal_moves:
        d1 = get_data(board, move1)
        if d1 is None:
            continue
        board2 = board.copy()
        board2.push(move1)
        done = True
        for move2 in board2.legal_moves:
            d2 = get_data(board2, move2)
            if d2 is None:
                continue
            pairs.append(MovesPair(d1, d2, combine_data(d1, d2)))
            done = False
        if done:  # لا ردود (كش مات / تعادل) — كما في TS
            pairs.append(MovesPair(d1, None, None))
    return pairs


def calculate_score(state, move_data, from_thr=0.6, to_thr=0.6):
    """نفس calculateScore في TS.

    فراغ المصدر: (1 - أقصى درجة احتلال في المربع) - from_thr
    ظهور الهدف:  درجة الفئة المتوقعة في المربع الهدف - to_thr
    """
    score = 0.0
    for sq in move_data.from_sq:
        score += 1.0 - state[sq].max() - from_thr
    for i, sq in enumerate(move_data.to_sq):
        score += state[sq][move_data.targets[i]] - to_thr
    return score


def process_state(state, moves_pairs, possible_moves):
    """نفس processState في findPieces.tsx — يختار أفضل نقلتين متتاليتين.

    possible_moves: مجموعة SAN تُغذّى عبر الإطارات وتُمسح بعد لعب نقلة
    يعيد (best_score1, best_score2, best_joint, best_move, best_moves)
    """
    best1 = best2 = best_joint = float("-inf")
    best_move = None
    best_moves = None
    seen = set()

    for pair in moves_pairs:
        san1 = pair.move1.sans[0]
        if san1 not in seen:
            seen.add(san1)
            s1 = calculate_score(state, pair.move1)
            if s1 > 0:
                possible_moves.add(san1)
            if s1 > best1:
                best1, best_move = s1, pair.move1

        if pair.move2 is None or pair.moves is None or san1 not in possible_moves:
            continue

        s2 = calculate_score(state, pair.move2)
        if s2 < 0:
            continue
        best2 = max(best2, s2)
        joint = calculate_score(state, pair.moves)
        if joint > best_joint:
            best_joint, best_moves = joint, pair.moves

    return best1, best2, best_joint, best_move, best_moves
