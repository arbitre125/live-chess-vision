#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أداة المعايرة التفاعلية — تُشغّل على الراسبيري مع شاشة أو عبر VNC:
  1. تلتقط صورة من الكاميرا
  2. تنقر على زوايا الرقعة الأربع بالترتيب: أعلى-يسار ← أعلى-يمين ← أسفل-يمين ← أسفل-يسار
  3. تعرض شبكة 8×8 متوقعة للتأكد
  4. تطبع الإحداثيات لنسخها في صفحة الأدمن (أو تحفظها مباشرة عبر API)

الاستخدام:
  python3 calibrate.py --device 0 --type picamera2
  python3 calibrate.py --device /dev/video0 --type usb --admin http://localhost:3000 --camera-id <id>
"""

import argparse
import json
import sys

import cv2
import numpy as np

from board_detector import compute_homography, draw_grid_debug

POINTS: list[list[int]] = []
WINDOW = "المعايرة — انقر الزوايا الأربع: TL ثم TR ثم BR ثم BL"


def on_mouse(event, x, y, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN and len(POINTS) < 4:
        POINTS.append([x, y])
        print(f"زاوية {len(POINTS)}: [{x}, {y}]")


def main():
    ap = argparse.ArgumentParser(description="معايرة زوايا رقعة الشطرنج")
    ap.add_argument("--device", default="0", help="فهرس الكاميرا أو /dev/video0 أو رابط IP")
    ap.add_argument("--type", default="picamera2", choices=["picamera2", "usb", "ip"])
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--admin", default="", help="رابط صفحة الأدمن للحفظ المباشر (اختياري)")
    ap.add_argument("--camera-id", dest="camera_id", default="", help="معرف الكاميرا في صفحة الأدمن")
    args = ap.parse_args()

    # التقاط صورة واحدة
    frame = None
    if args.type == "picamera2":
        from picamera2 import Picamera2

        cam = Picamera2()
        cam.configure(cam.create_preview_configuration(main={"size": (args.width, args.height)}))
        cam.start()
        import time

        time.sleep(1.0)
        frame = cam.capture_array()
        cam.stop()
    else:
        try:
            dev = int(args.device)
        except ValueError:
            dev = args.device
        cap = cv2.VideoCapture(dev)
        cap.set(3, args.width)
        cap.set(4, args.height)
        ok, frame_bgr = cap.read()
        cap.release()
        if not ok:
            print("فشل التقاط الصورة")
            sys.exit(1)
        frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    print(WINDOW)
    cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(WINDOW, on_mouse)

    while True:
        show = frame.copy()
        for i, p in enumerate(POINTS):
            cv2.circle(show, tuple(p), 7, (0, 165, 255), -1)
            cv2.putText(show, ["TL", "TR", "BR", "BL"][i], (p[0] + 10, p[1] - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        if len(POINTS) == 4:
            corners = np.array(POINTS, dtype=np.float32)
            try:
                show = draw_grid_debug(show, corners)
            except Exception:
                pass
        cv2.imshow(WINDOW, cv2.cvtColor(show, cv2.COLOR_RGB2BGR))
        key = cv2.waitKey(30) & 0xFF
        if key == ord("r"):  # إعادة
            POINTS.clear()
        elif key == 27 or key == ord("q"):
            break
        elif key == ord("s") and len(POINTS) == 4:
            corners = np.array(POINTS, dtype=np.float32).tolist()
            print("الزوايا:", json.dumps(corners))
            if args.admin and args.camera_id:
                import requests

                r = requests.post(
                    f"{args.admin}/api/cameras/{args.camera_id}/calibrate",
                    json={"corners": corners, "orientation": "white-bottom"},
                    timeout=10,
                )
                print("الحفظ في صفحة الأدمن:", "نجح" if r.ok else r.text[:200])
            break
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
