#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
خدمة الرؤية — Live Chess Vision
تعمل على الراسبيري بجانب صفحة الأدمن، وتقوم بـ:
  1. التقاط إطارات من كل كاميرا مفعّلة (picamera2 أو USB أو IP)
  2. استخلاص مربعات الرقعة الـ 64 من زوايا المعايرة (homography)
  3. مقارنة الإطار الحالي بالإطار المرجعي لكل مربع لاكتشاف النقلات
  4. ترشيح النقلات عبر chess.js المكافئ في بايثون (python-chess) يحدث في صفحة الأدمن
  5. إرسال كل نقلة مكتشفة إلى صفحة الأدمن عبر /api/boards/{id}/move

التشغيل:  python3 main.py
الإيقاف:  Ctrl+C أو systemctl stop live-chess-vision
"""

import json
import os
import sys
import time
import signal
import logging
from pathlib import Path

import numpy as np
import requests

from camera_capture import CameraStream
from board_detector import extract_squares
from move_detector import MoveDetector

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
LOG_PATH = BASE_DIR / "vision.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("live-chess-vision")


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error("ملف config.json غير موجود — انسخ config.example.json ثم عدّله")
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_cameras_from_admin(admin_url: str):
    """جلب إعدادات الكاميرات والمعايرة من صفحة الأدمن (المصدر الرسمي)."""
    try:
        r = requests.get(f"{admin_url}/api/cameras", timeout=10)
        r.raise_for_status()
        data = r.json()
        return [c for c in data.get("cameras", []) if c.get("enabled") and c.get("board")]
    except Exception as e:
        log.error(f"تعذر الاتصال بصفحة الأدمن على {admin_url}: {e}")
        return []


class GracefulExit:
    def __init__(self):
        self.stop = False
        signal.signal(signal.SIGINT, self._handle)
        signal.signal(signal.SIGTERM, self._handle)

    def _handle(self, *_):
        log.info("تم استلام إشارة إيقاف — جارٍ الإغلاق بأمان...")
        self.stop = True


def main():
    cfg = load_config()
    admin_url = cfg["admin_url"].rstrip("/")
    poll_seconds = cfg.get("config_poll_seconds", 30)
    loop_delay = cfg.get("loop_delay_seconds", 0.4)
    stable_frames = cfg.get("stable_frames", 2)
    cooldown = cfg.get("move_cooldown_seconds", 1.5)

    exitter = GracefulExit()
    log.info(f"=== Live Chess Vision — الاتصال بصفحة الأدمن: {admin_url} ===")

    streams: dict[str, CameraStream] = {}
    detectors: dict[str, MoveDetector] = {}
    cam_cfg: dict[str, dict] = {}
    last_poll = 0.0

    while not exitter.stop:
        now = time.time()

        # تحديث إعدادات الكاميرات دورياً من صفحة الأدمن
        if now - last_poll > poll_seconds:
            last_poll = now
            cameras = load_cameras_from_admin(admin_url)
            for c in cameras:
                cid = c["id"]
                board = c.get("board") or {}
                corners = board.get("corners")
                if not corners:
                    continue
                try:
                    corners = np.array(json.loads(corners), dtype=np.float32)
                except (TypeError, ValueError):
                    continue
                cam_cfg[cid] = {
                    "name": c["name"],
                    "device": c["device"],
                    "type": c["type"],
                    "width": c["width"],
                    "height": c["height"],
                    "board_id": board["id"],
                    "orientation": board.get("orientation", "white-bottom"),
                    "threshold": float(board.get("diffThreshold", 0.18)),
                    "corners": corners,
                }
                # فتح بث جديد عند الحاجة
                if cid not in streams or not streams[cid].is_open:
                    try:
                        streams[cid] = CameraStream(
                            device=c["device"],
                            cam_type=c["type"],
                            width=c["width"],
                            height=c["height"],
                            fps=c["fps"],
                        )
                        detectors[cid] = MoveDetector(admin_url=admin_url)
                        log.info(f"✔ فُتحت الكاميرا: {c['name']} ({c['type']}:{c['device']})")
                    except Exception as e:
                        log.error(f"✖ فشل فتح الكاميرا {c['name']}: {e}")
                        streams.pop(cid, None)

            # إغلاق البثوث المحذوفة
            active_ids = set(cam_cfg.keys())
            for cid in list(streams.keys()):
                if cid not in active_ids:
                    streams[cid].close()
                    streams.pop(cid, None)
                    log.info(f"أُغلقت كاميرا محذوفة أو معطلة: {cid}")

        # معالجة إطار واحد من كل كاميرا
        for cid, stream in streams.items():
            conf = cam_cfg.get(cid)
            if not conf:
                continue
            frame = stream.read()
            if frame is None:
                continue

            try:
                squares_now = extract_squares(frame, conf["corners"])  # dict: square -> gray ndarray
            except Exception as e:
                log.error(f"خطأ في استخلاص المربعات ({conf['name']}): {e}")
                continue

            det = detectors[cid]
            det.update(cid, squares_now, conf)

            # إرسال النقلات المؤكدة إلى صفحة الأدمن
            move = det.pop_confirmed_move()
            if move:
                payload = {
                    "from": move["from"],
                    "to": move["to"],
                    "promotion": move.get("promotion", "q"),
                    "confidence": move.get("confidence", 0.9),
                    "source": "vision",
                }
                try:
                    r = requests.post(
                        f"{admin_url}/api/boards/{conf['board_id']}/move",
                        json=payload,
                        timeout=10,
                    )
                    if r.ok:
                        j = r.json()
                        log.info(
                            f"♟ {conf['name']}: {move['from']}{move['to']}"
                            f" → {j.get('move', {}).get('san', '?')} (ثقة {payload['confidence']:.2f})"
                        )
                    else:
                        log.warning(
                            f"رفضت الصفحة النقلة {move['from']}→{move['to']}: {r.text[:120]}"
                        )
                except requests.RequestException as e:
                    log.error(f"فشل إرسال النقلة: {e}")

        time.sleep(loop_delay)

    # تنظيف
    for s in streams.values():
        s.close()
    log.info("أُوقفت الخدمة")


if __name__ == "__main__":
    main()
