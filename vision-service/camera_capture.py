#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
التقاط الكاميرات — يدعم:
  - picamera2 (كاميرا راسبيري CSI — Module 3)
  - ويب كام USB عبر OpenCV
  - كاميرا IP / هاتف عبر رابط MJPEG/HTTP

كل كاميرا تعمل في خيط منفصل لضمان استقرار معدل الإطارات.
"""

import threading
import time
import numpy as np


class CameraStream:
    """بث واحد من كاميرا واحدة — read() يعيد آخر إطار دائماً."""

    def __init__(self, device: str, cam_type: str, width: int, height: int, fps: int):
        self.device = device
        self.cam_type = cam_type
        self.width = width
        self.height = height
        self.fps = max(1, int(fps))
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._running = True
        self._open_backend()

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    # ─── فتح المصدر حسب النوع ───
    def _open_backend(self):
        if self.cam_type == "picamera2":
            from picamera2 import Picamera2

            self.picam = Picamera2()
            cfg = self.picam.create_preview_configuration(
                main={"size": (self.width, self.height), "format": "RGB888"}
            )
            self.picam.configure(cfg)
            self.picam.start()
            return

        if self.cam_type == "usb":
            import cv2

            # الجهاز إما "/dev/video0" أو فهرس "0"
            try:
                idx = int(self.device)
            except ValueError:
                idx = self.device
            self.cap = cv2.VideoCapture(idx)
            self.cap.set(3, self.width)
            self.cap.set(4, self.height)
            self.cap.set(5, self.fps)
            if not self.cap.isOpened():
                raise RuntimeError(f"تعذر فتح ويب كام USB: {self.device}")
            return

        if self.cam_type == "ip":
            import cv2

            self.cap = cv2.VideoCapture(self.device)  # رابط http://.../video
            if not self.cap.isOpened():
                raise RuntimeError(f"تعذر فتح كاميرا IP: {self.device}")
            return

        raise ValueError(f"نوع كاميرا غير معروف: {self.cam_type}")

    # ─── الحلقة ───
    def _loop(self):
        interval = 1.0 / self.fps
        while self._running:
            t0 = time.time()
            try:
                frame = self._grab()
                if frame is not None:
                    with self._lock:
                        self._frame = frame
            except Exception:
                time.sleep(0.5)
            # نبقي الإيقاع على معدل الإطارات المطلوب
            dt = time.time() - t0
            if dt < interval:
                time.sleep(interval - dt)

    def _grab(self) -> np.ndarray | None:
        if self.cam_type == "picamera2":
            return self.picam.capture_array()
        import cv2

        ok, frame = self.cap.read()
        if not ok:
            return None
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # ─── الواجهة ───
    def is_open(self) -> bool:
        return self._running

    def read(self) -> np.ndarray | None:
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def close(self):
        self._running = False
        time.sleep(0.2)
        try:
            if self.cam_type == "picamera2":
                self.picam.stop()
            else:
                self.cap.release()
        except Exception:
            pass
