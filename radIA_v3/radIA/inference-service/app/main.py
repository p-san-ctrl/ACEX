"""API de inferência do RadIA para o modelo acadêmico GRAZPEDWRI-DX."""

from __future__ import annotations

import hashlib
import hmac
import io
import os
import time
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException, Request
from PIL import Image, UnidentifiedImageError

MODEL_NAME = "YOLOv8 GRAZPEDWRI-DX"
MODEL_VERSION = "RuiyangJu/Bone_Fracture_Detection_YOLOv8@9f0a38c"
WEIGHTS_SHA256 = "301abc1774c28dd7c5adbcf1e8a79ed6771273615238b62dd179b622292b3a81"
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024

app = FastAPI(
    title="RadIA Fracture Inference",
    version="1.0.0",
    description="Detector acadêmico de achados em radiografias de punho pediátrico.",
)


def _check_token(authorization: str | None) -> None:
    expected = os.getenv("INFERENCE_API_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="INFERENCE_API_TOKEN is not configured")
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid API token")


@lru_cache(maxsize=1)
def get_model():
    from ultralytics import YOLO

    model_path = os.getenv("MODEL_PATH", "/models/best.pt")
    with open(model_path, "rb") as weights:
        digest = hashlib.sha256(weights.read()).hexdigest()
    if digest != WEIGHTS_SHA256:
        raise RuntimeError("Model weights checksum mismatch")
    return YOLO(model_path)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME, "version": MODEL_VERSION}


@app.post("/predict")
async def predict(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    _check_token(authorization)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Only PNG and JPEG are supported")

    payload = await request.body()
    if not payload or len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be between 1 byte and 10 MB")

    try:
        image = Image.open(io.BytesIO(payload))
        image.verify()
        image = Image.open(io.BytesIO(payload)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=422, detail="Invalid image") from exc

    threshold = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))
    started = time.perf_counter()
    result = get_model().predict(
        source=image,
        imgsz=int(os.getenv("IMAGE_SIZE", "1024")),
        conf=threshold,
        iou=float(os.getenv("IOU_THRESHOLD", "0.45")),
        verbose=False,
    )[0]
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)

    width, height = image.size
    findings = []
    if result.boxes is not None:
        for box in result.boxes:
            x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
            class_id = int(box.cls[0].item())
            normalized_x = max(0.0, min(1.0, x1 / width))
            normalized_y = max(0.0, min(1.0, y1 / height))
            findings.append(
                {
                    "label": str(result.names[class_id]).lower().replace(" ", ""),
                    "confidence": round(float(box.conf[0].item()), 6),
                    "bbox": {
                        "x": normalized_x,
                        "y": normalized_y,
                        "width": max(0.0, min(1.0 - normalized_x, (x2 - x1) / width)),
                        "height": max(0.0, min(1.0 - normalized_y, (y2 - y1) / height)),
                        "normalized": True,
                    },
                }
            )

    return {
        "model": {"name": MODEL_NAME, "version": MODEL_VERSION},
        "image": {"width": width, "height": height},
        "threshold": threshold,
        "inference_ms": elapsed_ms,
        "findings": findings,
    }
