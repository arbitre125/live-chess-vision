# -*- coding: utf-8 -*-
"""
تحميل نماذج LeYOLO ONNX الخاصة بـ CameraChessWeb (Pbatch) — MIT.
الأحجام صغيرة (4.2MB لكل نموذج).
"""
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(HERE, "models")

FILES = {
    "480M_leyolo_pieces.onnx":
        "https://drive.google.com/uc?id=1-80xp_nly9i6s3o0mF0mU9OZGEzUAlGj",
    "480L_leyolo_xcorners.onnx":
        "https://drive.google.com/uc?id=1-2wodbiXag9UQ44e2AYAmoRN6jVpxy83",
}


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    try:
        from gdown import download
        for name, url in FILES.items():
            dest = os.path.join(MODELS_DIR, name)
            if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
                print(f"✓ {name} موجود مسبقاً")
                continue
            print(f"↓ تحميل {name} ...")
            download(url, dest, quiet=False)
    except ImportError:
        print("ثبّت gdown أولاً:  pip install gdown")
        print("روابط النماذج:")
        for name, url in FILES.items():
            print(f"  {name}: {url}")
        sys.exit(1)
    print("تم ✔")


if __name__ == "__main__":
    main()
