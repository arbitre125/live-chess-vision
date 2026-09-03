# -*- coding: utf-8 -*-
"""
موزّع الرقع — القلب التشغيلي للنظام v2.

يدير: عقد كاميرا ESP32 (أو USB) × رقع متعددة لكل كاميرا.
لكل كاميرا خيط جلب إطارات، ولكل رقعة BoardTracker من منفذ
CameraChessWeb. يجدول فحص الرقع بالتناوب (round-robin) لكل كاميرا،
وعند قبول نقلة يرسلها إلى صفحة الأدمن.
"""
import os
import threading
import time

import cv2
import requests

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ccw import CcwModels, BoardTracker, discover_boards  # noqa: E402
from stream_client import FrameSource  # noqa: E402

DEFAULTS = {
    "admin_api": "http://127.0.0.1:3000/api",
    "server_port": 8000,
    "min_board_interval_s": 2.0,   # أقل فاصل بين فحصي نفس الرقعة
    "sweep_pause_ms": 30,
    "battery_poll_s": 30,
}


class BoardRef:
    """رقعة مراقبة تابعة لكاميرا."""

    def __init__(self, board_id, camera_id, corners, fen=None):
        self.board_id = board_id
        self.camera_id = camera_id
        self.tracker = BoardTracker(board_id, corners, start_fen=fen)
        self.last_checked = 0.0
        self.moves_sent = 0
        self.last_error = None


class Orchestrator:
    """مدير كل الكاميرات والرقع."""

    def __init__(self, config=None):
        self.cfg = dict(DEFAULTS)
        if config:
            self.cfg.update(config)
        self.models = None
        self.sources: dict[str, FrameSource] = {}
        self.boards: dict[str, BoardRef] = {}
        self.lock = threading.RLock()
        self.running = False
        self._worker_thread = None
        self.stats = {"cycles": 0, "moves": 0, "errors": 0,
                      "last_cycle_ms": 0.0, "started": time.time()}

    # ------------------------------------------------------------------ #
    def ensure_models(self):
        if self.models is None:
            self.models = CcwModels()
        return self.models

    # ------------------------------------------------------------------ #
    # إدارة الكاميرات                                                     #
    # ------------------------------------------------------------------ #
    def set_camera(self, camera_id, kind="esp32", url=None, device=0,
                   width=None, height=None):
        with self.lock:
            old = self.sources.get(camera_id)
            if old:
                old.stop()
            src = FrameSource(camera_id, kind=kind, url=url, device=device,
                              width=width, height=height)
            self.sources[camera_id] = src
            if self.running:
                src.start()
            return src

    def remove_camera(self, camera_id):
        with self.lock:
            src = self.sources.pop(camera_id, None)
            if src:
                src.stop()
            for bid in [b for b, br in self.boards.items()
                        if br.camera_id == camera_id]:
                self.boards.pop(bid, None)

    def set_board(self, board_id, camera_id, corners, fen=None):
        """يربط رقعة بكاميرا بزوايا معايرة في إطار الكاميرا الكامل."""
        with self.lock:
            if camera_id not in self.sources:
                raise KeyError(f"الكاميرا {camera_id} غير مسجلة")
            old = self.boards.get(board_id)
            if old and old.camera_id == camera_id:
                old.tracker.set_corners(corners)
                if fen:
                    old.tracker.reset(fen)
                return old
            ref = BoardRef(board_id, camera_id, corners, fen)
            self.boards[board_id] = ref
            return ref

    def remove_board(self, board_id):
        with self.lock:
            self.boards.pop(board_id, None)

    # ------------------------------------------------------------------ #
    # الاكتشاف التلقائي (ميزة v2: كاميرا واحدة تكشف عدة رقع)              #
    # ------------------------------------------------------------------ #
    def discover(self, camera_id):
        """يكشف الرقع تلقائياً في آخر إطار للكاميرا."""
        models = self.ensure_models()
        src = self.sources.get(camera_id)
        if not src:
            raise KeyError(camera_id)
        frame = src.read(max_age_s=5.0)
        if frame is None:
            raise RuntimeError("لا إطار حديث من الكاميرا")
        return discover_boards(models, frame)

    # ------------------------------------------------------------------ #
    # حلقة المعالجة                                                       #
    # ------------------------------------------------------------------ #
    def start(self):
        if self.running:
            return
        self.ensure_models()
        self.running = True
        with self.lock:
            for src in self.sources.values():
                src.start()
        self._worker_thread = threading.Thread(target=self._worker, daemon=True,
                                               name="orchestrator")
        self._worker_thread.start()

    def stop(self):
        self.running = False
        with self.lock:
            for src in self.sources.values():
                src.stop()

    def _worker(self):
        while self.running:
            t0 = time.time()
            with self.lock:
                board_list = list(self.boards.values())
                sources = dict(self.sources)
            now = time.time()
            for ref in board_list:
                if not self.running:
                    break
                if now - ref.last_checked < self.cfg["min_board_interval_s"]:
                    continue
                src = sources.get(ref.camera_id)
                if src is None:
                    continue
                frame = src.read()
                if frame is None:
                    ref.last_error = "لا إطار حديث"
                    continue
                try:
                    events = ref.tracker.process_frame(frame, self.models)
                    ref.last_error = None
                    for ev in events:
                        self._post_move(ref, ev)
                        self.stats["moves"] += 1
                        ref.moves_sent += 1
                except Exception as e:  # noqa: BLE001
                    ref.last_error = str(e)
                    self.stats["errors"] += 1
                ref.last_checked = time.time()
            self.stats["cycles"] += 1
            self.stats["last_cycle_ms"] = (time.time() - t0) * 1000
            time.sleep(self.cfg["sweep_pause_ms"] / 1000.0)

    def _post_move(self, ref, ev):
        """يرسل النقلة إلى صفحة الأدمن (التي تتحقق وتزامن مع GitHub)."""
        try:
            requests.post(
                f"{self.cfg['admin_api']}/moves",
                json={
                    "boardId": ref.board_id,
                    "san": ev.san,
                    "uci": ev.uci,
                    "from": ev.from_sq,
                    "to": ev.to_sq,
                    "source": "ccw-vision",
                    "score": ev.score,
                },
                timeout=5,
            )
        except Exception as e:  # noqa: BLE001
            ref.last_error = f"فشل إرسال النقلة: {e}"

    # ------------------------------------------------------------------ #
    # حالة النظام للعرض                                                   #
    # ------------------------------------------------------------------ #
    def health(self):
        with self.lock:
            cams = []
            for cid, src in self.sources.items():
                cams.append({
                    "id": cid,
                    "kind": src.kind,
                    "url": src.url,
                    "connected": src.connected,
                    "fps": round(src.fps_measured, 2),
                    "age_s": round(src.age_s(), 1),
                    "boards": sum(1 for b in self.boards.values()
                                  if b.camera_id == cid),
                    "error": src.last_error,
                })
            boards = []
            for bid, ref in self.boards.items():
                boards.append({
                    "id": bid,
                    "camera": ref.camera_id,
                    "fen": ref.tracker.board.fen(),
                    "moves": len(ref.tracker.board.move_stack),
                    "frames_seen": ref.tracker.frames_seen,
                    "moves_sent": ref.moves_sent,
                    "last_check_s": round(time.time() - ref.last_checked, 1)
                    if ref.last_checked else None,
                    "error": ref.last_error,
                })
            return {
                "running": self.running,
                "uptime_s": int(time.time() - self.stats["started"]),
                "cameras": cams,
                "boards": boards,
                "stats": self.stats,
            }

    def snapshot(self, camera_id):
        """آخر إطار للكاميرا (JPEG) — للمعاينة والمعايرة في صفحة الأدمن."""
        src = self.sources.get(camera_id)
        if src is None:
            return None
        frame = src.read(max_age_s=10.0)
        if frame is None:
            return None
        ok, jpg = cv2.imencode(".jpg", frame,
                               [cv2.IMWRITE_JPEG_QUALITY, 80])
        return jpg.tobytes() if ok else None
