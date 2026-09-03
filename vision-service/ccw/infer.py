# -*- coding: utf-8 -*-
"""
استدلال نماذج LeYOLO عبر ONNX Runtime — منفذ من:
  CameraChessWeb src/utils/detect.tsx (getInput / getBoxesAndScores)
  src/utils/findCorners.tsx (processBoxesAndScores — NMS)

الفرق الوحيد عن الأصل: كل الإحداثيات الناتجة هنا في «بكسلات الإطار الكامل»
بدلاً من فضاء النموذج (480×288)، ما يبسّط دمج عدة رقع في إطار واحد.
"""
import cv2
import numpy as np
import onnxruntime as ort

from .constants import (
    MODEL_WIDTH, MODEL_HEIGHT, PAD_VALUE, PADDING_RATIO,
    XCORNER_NMS_IOU, XCORNER_NMS_CONF, XCORNER_MAX_DET,
)

import math
import os

MODELS_DIR = os.environ.get("CCW_MODELS_DIR",
                            os.path.join(os.path.dirname(__file__), "..", "models"))
PIECES_MODEL = os.path.join(MODELS_DIR, "480M_leyolo_pieces.onnx")
XCORNERS_MODEL = os.path.join(MODELS_DIR, "480L_leyolo_xcorners.onnx")


def _make_session(path):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"النموذج غير موجود: {path}\n"
            "شغّل أولاً: python download_models.py")
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


class CcwModels:
    """جلسات النموذجين (قطع + آزوايا) — جلسة واحدة تُشارك بين كل الرقع."""

    def __init__(self, pieces_path=PIECES_MODEL, xcorners_path=XCORNERS_MODEL):
        self.pieces = _make_session(pieces_path)
        self.has_xcorners = os.path.exists(xcorners_path)
        self.xcorners = _make_session(xcorners_path) if self.has_xcorners else None

    # ------------------------------------------------------------------ #
    # المعالجة المسبقة — منفذة من getInput في detect.tsx                  #
    # ------------------------------------------------------------------ #
    @staticmethod
    def make_input(frame_bgr, keypoints=None, padding_ratio=PADDING_RATIO):
        """يقصّ منطقة الرقعة (bbox الزوايا + هوامش) ويحجّمها letterbox 288×480.

        keypoints: الزوايا الأربع [h1,a1,a8,h8] ببكسلات الإطار الكامل،
                   أو None لمعالجة الإطار كاملاً (كشف آزوايا تلقائي).
        يعيد: (blob float16 [1,3,288,480], crop_hw, model_pads, roi)
        """
        H, W = frame_bgr.shape[:2]
        if keypoints is not None:
            kp = np.asarray(keypoints, dtype=np.float64)
            xmin, ymin = kp.min(axis=0)
            xmax, ymax = kp.max(axis=0)
            bw, bh = xmax - xmin, ymax - ymin
            pl = pr = math.floor(bw / padding_ratio)
            pt = math.floor(bh / padding_ratio)
            pb = math.floor(bh / padding_ratio)
            rw = bw + pl + pr
            rh = bh + pt + pb
            ratio = rh / rw
            desired = MODEL_HEIGHT / MODEL_WIDTH
            if ratio > desired:
                target_w = rh / desired
                dx = target_w - rw
                pl += math.floor(dx / 2)
                pr += dx - math.floor(dx / 2)
            else:
                target_h = rw * desired
                pt += target_h - rh  # كما في TS: الفارق كله في الهامش العلوي
            roi = [
                max(0, round(xmin - pl)),
                max(0, round(ymin - pt)),
                min(W, round(xmax + pr)),
                min(H, round(ymax + pb)),
            ]
        else:
            roi = [0, 0, W, H]

        x0, y0, x1, y1 = roi
        crop = frame_bgr[y0:y1, x0:x1]
        ch, cw = crop.shape[:2]

        ratio = ch / cw
        desired = MODEL_HEIGHT / MODEL_WIDTH
        if ratio > desired:
            rw, rh = max(1, round(MODEL_HEIGHT / ratio)), MODEL_HEIGHT
        else:
            rw, rh = MODEL_WIDTH, max(1, round(MODEL_WIDTH * ratio))
        img = cv2.resize(crop, (rw, rh), interpolation=cv2.INTER_LINEAR)

        dx = MODEL_WIDTH - rw
        dy = MODEL_HEIGHT - rh
        plm = dx // 2
        prm = dx - plm
        pbm = dy // 2
        ptm = dy - pbm
        img = cv2.copyMakeBorder(img, ptm, pbm, plm, prm,
                                 cv2.BORDER_CONSTANT, value=(PAD_VALUE,) * 3)

        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = np.transpose(img, (2, 0, 1))[None].astype(np.float16)
        return blob, (cw, ch), (plm, prm, ptm, pbm), roi

    # ------------------------------------------------------------------ #
    # المعالجة اللاحقة — منفذة من getBoxesAndScores في detect.tsx         #
    # ------------------------------------------------------------------ #
    @staticmethod
    def _postprocess(preds, crop_hw, pads, roi):
        """يحوّل خرج النموذج [1,16,N] إلى صناديق ببكسلات الإطار الكامل + الدرجات."""
        t = preds[0].astype(np.float32).T  # [N, 4+C]
        xc, yc, w, h = t[:, 0], t[:, 1], t[:, 2], t[:, 3]
        l = xc - w / 2
        tp = yc - h / 2
        r = l + w
        b = tp + h

        plm, prm, ptm, pbm = pads
        l = l - plm
        r = r - plm
        tp = tp - ptm
        b = b - ptm

        cw, ch = crop_hw
        sx = cw / (MODEL_WIDTH - plm - prm)
        sy = ch / (MODEL_HEIGHT - ptm - pbm)
        l = l * sx + roi[0]
        r = r * sx + roi[0]
        tp = tp * sy + roi[1]
        b = b * sy + roi[1]

        boxes = np.stack([l, tp, r, b], axis=1)  # [N,4] لترب-يمين-أسفل-يسار
        scores = t[:, 4:]                        # [N,C]
        return boxes, scores

    def _run(self, session, blob):
        out = session.run(None, {session.get_inputs()[0].name: blob})[0]
        return out

    # ------------------------------------------------------------------ #
    # كشف القطع (بدون NMS — كما في TS: تجميع أقصى درجة لكل مربع لاحقاً)   #
    # ------------------------------------------------------------------ #
    def detect_pieces(self, frame_bgr, keypoints=None, min_score=0.05):
        blob, crop_hw, pads, roi = self.make_input(frame_bgr, keypoints)
        preds = self._run(self.pieces, blob)
        boxes, scores = self._postprocess(preds, crop_hw, pads, roi)
        keep = scores.max(axis=1) >= min_score
        return boxes[keep], scores[keep]

    # ------------------------------------------------------------------ #
    # كشف آزوايا الرقعة (xcorners) مع NMS — منفذ من processBoxesAndScores #
    # ------------------------------------------------------------------ #
    def detect_xcorners(self, frame_bgr, keypoints=None):
        if self.xcorners is None:
            raise RuntimeError("نموذج xcorners غير متوفر — شغّل download_models.py")
        blob, crop_hw, pads, roi = self.make_input(frame_bgr, keypoints)
        preds = self._run(self.xcorners, blob)
        boxes, scores = self._postprocess(preds, crop_hw, pads, roi)
        max_scores = scores.max(axis=1)
        cls = scores.argmax(axis=1)
        keep = nms_numpy(boxes, max_scores, XCORNER_MAX_DET,
                         XCORNER_NMS_IOU, XCORNER_NMS_CONF)
        boxes = boxes[keep]
        cls = cls[keep]
        # مراكز الصناديق (نفس getCenters في TS)
        cx = (boxes[:, 0] + boxes[:, 2]) / 2
        cy = (boxes[:, 1] + boxes[:, 3]) / 2
        return np.stack([cx, cy], axis=1), cls


def nms_numpy(boxes, scores, max_det=100, iou_thr=0.3, conf_thr=0.1):
    """NMS بسيط بـ numpy (بديل tf.image.nonMaxSuppressionAsync)."""
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size and len(keep) < max_det:
        i = order[0]
        if scores[i] < conf_thr:
            break
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        iou = inter / np.maximum(areas[i] + areas[order[1:]] - inter, 1e-9)
        order = order[1:][iou <= iou_thr]
    return keep
