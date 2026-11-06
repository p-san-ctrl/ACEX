from __future__ import annotations

import asyncio
import io
from types import SimpleNamespace

from fastapi import HTTPException
from PIL import Image

from app import main


class Scalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class Vector:
    def __init__(self, values):
        self.values = values

    def tolist(self):
        return self.values


class FakeModel:
    def predict(self, **_kwargs):
        box = SimpleNamespace(
            xyxy=[Vector([10, 20, 60, 80])],
            cls=[Scalar(0)],
            conf=[Scalar(0.91)],
        )
        return [SimpleNamespace(boxes=[box], names={0: "fracture"})]


def png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (100, 100), "black").save(output, format="PNG")
    return output.getvalue()


class FakeRequest:
    def __init__(self, payload: bytes, content_type: str):
        self.payload = payload
        self.headers = {"content-type": content_type}

    async def body(self):
        return self.payload


def test_predict_returns_normalized_real_model_contract(monkeypatch):
    monkeypatch.setenv("INFERENCE_API_TOKEN", "test-token")
    monkeypatch.setattr(main, "get_model", lambda: FakeModel())
    response = asyncio.run(main.predict(FakeRequest(png_bytes(), "image/png"), "Bearer test-token"))
    finding = response["findings"][0]
    assert finding["label"] == "fracture"
    assert finding["confidence"] == 0.91
    assert finding["bbox"] == {
        "x": 0.1,
        "y": 0.2,
        "width": 0.5,
        "height": 0.6,
        "normalized": True,
    }


def test_predict_rejects_non_image(monkeypatch):
    monkeypatch.setenv("INFERENCE_API_TOKEN", "test-token")
    try:
        asyncio.run(main.predict(FakeRequest(b"not an image", "application/pdf"), "Bearer test-token"))
    except HTTPException as error:
        assert error.status_code == 415
    else:
        raise AssertionError("application/pdf should be rejected")
