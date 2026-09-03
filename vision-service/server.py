# -*- coding: utf-8 -*-
"""
خادم الرؤية v2 — FastAPI على الخادم المركزي (حاسوب البطولة أو Raspberry Pi)

يواجه صفحة الأدمن (Next.js) والخادم يرسل النقلات إلى الأدمن:
  GET  /health                    — حالة كل الكاميرات والرقع
  GET  /cameras/{id}/snapshot.jpg — آخر إطار (للمعاينة والمعايرة)
  GET  /cameras/{id}/stream.mjpg  — إعادة بث MJPEG (للمعاينة الحية)
  POST /cameras/{id}/discover     — اكتشاف تلقائي للرقع في الإطار
  POST /cameras/{id}              — تسجيل/تحديث مصدر كاميرا
  DELETE /cameras/{id}            — إزالة كاميرا
  POST /boards/{id}               — ربط رقعة بكاميرا بزوايا معايرة
  POST /boards/{id}/capture       — قراءة الوضعية الحالية كـ FEN بداية
  POST /boards/{id}/reset         — تصفير اللعبة إلى وضع البداية
  DELETE /boards/{id}             — إزالة رقعة

التشغيل:  uvicorn server:app --host 0.0.0.0 --port 8000
"""
import io
import os
import threading
import time

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from board_worker import Orchestrator  # noqa: E402

app = FastAPI(title="Live Chess Vision — خادم الرؤية v2", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # شبكة محلية — صفحة الأدمن تصل من أي جهاز في الشبكة
    allow_methods=["*"],
    allow_headers=["*"],
)

orch = Orchestrator()


class CameraIn(BaseModel):
    kind: str = Field(default="esp32", description="esp32 | usb | file | virtual")
    url: str | None = Field(default=None, description="رابط /stream لعقدة ESP32")
    device: int | str | None = Field(default=0, description="رقم/مسار كاميرا USB")
    width: int | None = None
    height: int | None = None
    autostart: bool = True


class BoardIn(BaseModel):
    camera_id: str
    corners: list  # [[x,y]×4] بترتيب h1,a1,a8,h8 — بكسلات إطار الكاميرا
    fen: str | None = None
    autostart: bool = True


@app.on_event("startup")
def _startup():
    orch.ensure_models()


# --------------------------------------------------------------------- #
@app.get("/health")
def health():
    return orch.health()


@app.post("/cameras/{camera_id}")
def set_camera(camera_id: str, body: CameraIn):
    src = orch.set_camera(
        camera_id, kind=body.kind, url=body.url,
        device=body.device if body.device is not None else 0,
        width=body.width, height=body.height)
    if body.autostart:
        src.start()
    return {"ok": True, "camera": camera_id}


@app.delete("/cameras/{camera_id}")
def del_camera(camera_id: str):
    orch.remove_camera(camera_id)
    return {"ok": True}


@app.get("/cameras/{camera_id}/snapshot.jpg")
def snapshot(camera_id: str):
    jpg = orch.snapshot(camera_id)
    if jpg is None:
        raise HTTPException(503, "لا إطار حديث من هذه الكاميرا")
    return Response(jpg, media_type="image/jpeg")


@app.get("/cameras/{camera_id}/stream.mjpg")
def stream(camera_id: str):
    def gen():
        while True:
            jpg = orch.snapshot(camera_id)
            if jpg is not None:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                       b"Content-Length: " + str(len(jpg)).encode()
                       + b"\r\n\r\n" + jpg + b"\r\n")
            time.sleep(0.25)  # ~4fps للمعاينة — تكفي للمراقبة
    return StreamingResponse(gen(),
                             media_type="multipart/x-mixed-replace; boundary=frame")


@app.post("/cameras/{camera_id}/discover")
def discover(camera_id: str):
    try:
        boards = orch.discover(camera_id)
    except KeyError:
        raise HTTPException(404, "كاميرا غير مسجلة")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"boards": boards}


@app.post("/boards/{board_id}")
def set_board(board_id: str, body: BoardIn):
    if len(body.corners) != 4:
        raise HTTPException(400, "الزوايا يجب أن تكون 4 نقاط [[x,y]×4]")
    try:
        ref = orch.set_board(board_id, body.camera_id,
                             body.corners, body.fen)
    except KeyError:
        raise HTTPException(404, "كاميرا غير مسجلة — سجلها أولاً")
    if body.autostart:
        orch.start()
    return {"ok": True, "board": board_id, "camera": ref.camera_id}


@app.delete("/boards/{board_id}")
def del_board(board_id: str):
    orch.remove_board(board_id)
    return {"ok": True}


@app.post("/boards/{board_id}/capture")
def capture(board_id: str, turn: str = "w"):
    ref = orch.boards.get(board_id)
    if ref is None:
        raise HTTPException(404, "رقعة غير مسجلة")
    src = orch.sources.get(ref.camera_id)
    frame = src.read(max_age_s=5.0) if src else None
    if frame is None:
        raise HTTPException(503, "لا إطار حديث")
    import chess
    turn_color = chess.BLACK if turn == "b" else chess.WHITE
    fen, err = ref.tracker.capture_position(frame, orch.models, turn_color)
    if err:
        raise HTTPException(422, err)
    return {"fen": fen, "board": board_id}


@app.post("/boards/{board_id}/reset")
def reset_board(board_id: str, fen: str | None = None):
    ref = orch.boards.get(board_id)
    if ref is None:
        raise HTTPException(404, "رقعة غير مسجلة")
    ref.tracker.reset(fen)
    return {"ok": True, "fen": ref.tracker.board.fen()}


# --------------------------------------------------------------------- #
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(
        os.environ.get("VISION_PORT", orch.cfg["server_port"])))
