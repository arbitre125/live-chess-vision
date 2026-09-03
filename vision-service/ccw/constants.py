# -*- coding: utf-8 -*-
"""
ثوابت منفذة حرفياً من CameraChessWeb (Pbatch) — src/utils/constants.tsx
المصدر: https://github.com/Pbatch/CameraChessWeb (MIT)
"""
import chess

# أبعاد دخل النموذج (LeYOLO) — مثل أبعاد النموذج في TS
MODEL_WIDTH = 480
MODEL_HEIGHT = 288

# الفئات الـ12: صغيرة = أسود، كبيرة = أبيض (نفس ترتيب LABELS في TS)
LABELS = ["b", "k", "n", "p", "q", "r", "B", "K", "N", "P", "Q", "R"]
LABEL_MAP = {lbl: i for i, lbl in enumerate(LABELS)}

# أدوار القطع حسب الفهرس % 6 (نفس PIECE_SYMBOLS في TS)
PIECE_SYMBOLS = ["bishop", "king", "knight", "pawn", "queen", "rook"]

# خريطة فئة النموذج ← قطعة python-chess (الحالة الصغيرة=أسود، الكبيرة=أبيض)
LABEL_TO_PIECE = {
    "p": chess.PAWN, "n": chess.KNIGHT, "b": chess.BISHOP,
    "r": chess.ROOK, "q": chess.QUEEN, "k": chess.KING,
    "P": chess.PAWN, "N": chess.KNIGHT, "B": chess.BISHOP,
    "R": chess.ROOK, "Q": chess.QUEEN, "K": chess.KING,
}

# حجم المربع بعد التشويه (warp) وحجم الرقعة
SQUARE_SIZE = 128
BOARD_SIZE = 8 * SQUARE_SIZE

# أسماء المربعات 0..63 بنفس ترتيب chessops/python-chess (a1=0 .. h8=63)
FILES = "abcdefgh"
SQUARE_NAMES = [FILES[i % 8] + str(i // 8 + 1) for i in range(64)]
SQUARE_MAP = {name: i for i, name in enumerate(SQUARE_NAMES)}

# ترتيب الزوايا المعتمد في المشروع الأصلي: h1, a1, a8, h8
CORNER_KEYS = ["h1", "a1", "a8", "h8"]

# وضعية البداية القياسية
START_FEN = chess.STARTING_FEN

# قيمة التعبئة الرمادية في letterbox (نفس TS)
PAD_VALUE = 114

# نسبة التوسيع حول منطقة الرقعة قبل إرسالها للنموذج (12%)
PADDING_RATIO = 12

# عتبات NMS لآزوايا الرقعة (نفس قيم TS في findCorners)
XCORNER_NMS_IOU = 0.3
XCORNER_NMS_CONF = 0.1
XCORNER_MAX_DET = 100
