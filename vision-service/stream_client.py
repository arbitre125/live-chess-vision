# -*- coding: utf-8 -*-
"""
عميل مصادر الفيديو — MJPEG من عقد ESP32 عبر WiFi، أو USB، أو ملف.

لكل مصدر خيط مستقل يحتفظ بآخر إطار فقط (latest-frame buffer) لأن
تحليل الشطرنج لا يحتاج كل الإطارات — يحتاج أحدث إطار صافٍ.
"""
import threading
import time
import urllib.parse
import urllib.request

import cv2


class FrameSource:
    """مصدر إطارات موحد لكل أنواع الكاميرات."""

    def __init__(self, source_id, kind="esp32", url=None, device=0,
                 width=None, height=None, reconnect_s=3.0):
        self.source_id = source_id
        self.kind = kind          # esp32 | usb | file | virtual
        self.url = url            # http://chesscam-1.local/stream أو virtual://normal
        self.device = device
        self.width = width
        self.height = height
        self.reconnect_s = reconnect_s

        self._lock = threading.Lock()
        self._frame = None        # آخر إطار (BGR)
        self._ts = 0.0
        self._stop = threading.Event()
        self._thread = None
        self.fps_measured = 0.0
        self.connected = False
        self.last_error = None

    # ------------------------------------------------------------------ #
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name=f"src-{self.source_id}")
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def read(self, max_age_s=2.0):
        """آخر إطار أو None إذا كان قديماً."""
        with self._lock:
            if self._frame is None:
                return None
            if time.time() - self._ts > max_age_s:
                return None
            return self._frame.copy()

    def age_s(self):
        with self._lock:
            return time.time() - self._ts if self._frame is not None else 1e9

    # ------------------------------------------------------------------ #
    def _push(self, frame):
        with self._lock:
            now = time.time()
            if self._ts > 0:
                dt = now - self._ts
                if dt > 0:
                    inst = 1.0 / dt
                    self.fps_measured = (0.9 * self.fps_measured
                                         + 0.1 * inst) if self.fps_measured else inst
            self._ts = now
            self._frame = frame

    def _run(self):
        while not self._stop.is_set():
            try:
                if self.kind == "esp32":
                    self._run_mjpeg()
                elif self.kind == "usb":
                    self._run_usb()
                elif self.kind == "virtual":
                    self._run_virtual()
                elif self.kind == "file":
                    self._run_file()
            except Exception as e:  # noqa: BLE001
                self.last_error = str(e)
                self.connected = False
            if not self._stop.is_set():
                time.sleep(self.reconnect_s)

    # ------------------------------------------------------------------ #
    def _run_mjpeg(self):
        """يقرأ تدفق MJPEG ويفكك الإطارات بين حدود multipart."""
        req = urllib.request.Request(self.url, headers={"User-Agent": "live-chess-vision"})
        buf = b""
        last_push = 0.0
        with urllib.request.urlopen(req, timeout=10) as stream:
            self.connected = True
            while not self._stop.is_set():
                chunk = stream.read(65536)
                if not chunk:
                    raise ConnectionError("انتهى البث")
                buf += chunk
                a = buf.find(b"\xff\xd8")          # بداية JPEG
                if a < 0:
                    buf = buf[-2:]
                    continue
                b = buf.find(b"\xff\xd9", a + 2)   # نهاية JPEG
                if b < 0:
                    if len(buf) > 4_000_000:
                        buf = b""
                    continue
                jpg = buf[a:b + 2]
                buf = buf[b + 2:]
                frame = cv2.imdecode(
                    np_frombuffer(jpg), cv2.IMREAD_COLOR)
                if frame is None:
                    continue
                if self.width and self.height:
                    frame = cv2.resize(frame, (self.width, self.height))
                # لا نحتاج أكثر من ~4 إطارات/ث للمعالجة
                if time.time() - last_push >= 0.2:
                    self._push(frame)
                    last_push = time.time()

    def _run_usb(self):
        cap = cv2.VideoCapture(self.device)
        if self.width:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        if self.height:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, 5)
        if not cap.isOpened():
            raise IOError(f"لا يمكن فتح الكاميرا {self.device}")
        self.connected = True
        last_push = 0.0
        try:
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok:
                    raise IOError("قراءة فاشلة")
                if time.time() - last_push >= 0.2:
                    self._push(frame)
                    last_push = time.time()
        finally:
            cap.release()
            self.connected = False

    def _run_file(self):
        """حلقة ملف/صورة — مفيدة للاختبار: يرسل الإطار مرة كل ثانية."""
        frame = cv2.imread(self.url or self.device)
        if frame is None:
            raise IOError(f"ملف غير صالح: {self.url}")
        self.connected = True
        while not self._stop.is_set():
            self._push(frame)
            time.sleep(1.0)

    def _run_virtual(self):
        """كاميرا افتراضية: توليد رقعة متحركة بنقلات قانونية — تجربة بدون عتاد.
        url مثل: virtual://normal (أو virtual://slow | virtual://fast)."""
        from virtual_source import make_virtual_generator
        speed = "normal"
        try:
            parsed = urllib.parse.urlparse(self.url or "")
            if parsed.scheme == "virtual" and parsed.netloc:
                speed = parsed.netloc
        except ValueError:
            pass
        gen = make_virtual_generator(
            width=self.width or 1280, height=self.height or 1024, speed=speed)
        self.connected = True
        while not self._stop.is_set():
            try:
                frame = gen()
            except Exception as e:  # noqa: BLE001
                raise IOError(f"فشل المولد الافتراضي: {e}")
            self._push(frame)
            time.sleep(0.5)  # 2 إطار/ث كافٍ لتحليل الشطرنج


def np_frombuffer(jpg_bytes):
    import numpy as np
    return np.frombuffer(jpg_bytes, dtype=np.uint8)
