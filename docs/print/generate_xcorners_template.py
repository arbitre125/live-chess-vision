# -*- coding: utf-8 -*-
"""
مولّد قالب علامات × (xcorners) للطباعة على A4 — يوضع تحت الرقعة أو يُلصق.

نمط العلامات نفسه الذي يعمل عليه نموذج CameraChessWeb: 49 علامة ×
في التقاطعات الداخلية 7×7 للرقعة 8×8.

الاستخدام:
    python3 generate_xcorners_template.py          # كل المقاسات في PDF واحد
    python3 generate_xcorners_template.py 57.5     # مقاس مربع محدد (مم)

الخرج: /home/z/my-project/download/xcorners_templates.pdf
"""
import sys
import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT_DEFAULT = "/home/z/my-project/download/xcorners_templates.pdf"

# مقاسات مربعات شائعة (مم): رقع قياسية 50–60 مم
SIZES = [50.0, 54.0, 57.15, 60.0]
ARM = 0.075        # طول ذراع × نسبة من المربع (7.5%)
LINE_W = 0.45      # سماكة الخط (مم)


def draw_sheet(c, square_mm, page_w, page_h):
    """يضيف ورقة A4 لقالب بمقاس مربع محدد."""
    board_mm = 8 * square_mm
    margin = 10
    if board_mm + 2 * margin > min(page_w, page_h):
        return False  # لا يتسع على A4

    # توسيط
    x0 = (page_w - board_mm) / 2
    y0 = (page_h - board_mm) / 2

    c.saveState()
    c.setTitle(f"xcorners {square_mm}mm")

    # عنوان
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(page_w / 2, page_h - 12,
                        f"ChessCam xcorners template — square {square_mm}mm "
                        f"(board {board_mm:.0f}mm)")
    c.setFont("Helvetica", 8)
    c.drawCentredString(page_w / 2, 14,
                        "Print at 100% scale (no fit-to-page). Verify the 100mm ruler below.")

    # مسطرة تحقق 100 مم
    ruler_y = 22
    c.setLineWidth(0.3)
    c.line(margin, ruler_y, margin + 100, ruler_y)
    for i in range(0, 101, 10):
        c.line(margin + i, ruler_y - 2, margin + i, ruler_y + 2)
        if i in (0, 50, 100):
            c.setFont("Helvetica", 6)
            c.drawCentredString(margin + i, ruler_y + 4, f"{i}mm")

    # حدود الرقعة
    c.setLineWidth(0.3)
    c.rect(x0, y0, board_mm, board_mm)

    # علامات × في التقاطعات الداخلية 7×7
    arm = square_mm * ARM
    c.setLineWidth(LINE_W)
    for r in range(1, 8):
        for f in range(1, 8):
            cx = x0 + f * square_mm
            cy = y0 + r * square_mm
            c.line(cx - arm, cy - arm, cx + arm, cy + arm)
            c.line(cx - arm, cy + arm, cx + arm, cy - arm)

    c.restoreState()
    return True


def main():
    out = OUT_DEFAULT
    sizes = SIZES
    if len(sys.argv) > 1:
        try:
            sizes = [float(s) for s in sys.argv[1:]]
        except ValueError:
            pass
    os.makedirs(os.path.dirname(out), exist_ok=True)
    c = canvas.Canvas(out, pagesize=A4)
    w, h = A4
    added = 0
    for sq in sizes:
        if draw_sheet(c, sq, w, h):
            c.showPage()
            added += 1
            print(f"✓ ورقة لمربع {sq} مم")
        else:
            print(f"✗ مربع {sq} مم لا يتسع على A4")
    c.save()
    print(f"الخرج: {out} ({added} ورقات)")


if __name__ == "__main__":
    main()
