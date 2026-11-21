"""
Royer vision service — FastAPI HTTP backend for YOLO detection + VLM/LLM.

Run this service wherever you have Python + torch (for local YOLO) or an
OpenAI-compatible VLM endpoint. Point robloxbot's VISION_SERVICE_URL at it.

Endpoints:
  GET  /health          — service health
  POST /detect          — YOLO object detection on an uploaded image
  POST /describe        — VLM image description
  POST /ask             — VLM question/answer about an image or context

Env vars:
  VLM_BASE_URL   — base URL of an OpenAI-compatible VLM API (e.g. Ollama,
                   OpenAI, local vLLM). Required for /describe and /ask.
  VLM_API_KEY    — API key for the VLM service (optional).
  VLM_MODEL      — model name to use (default: gpt-4o-mini or local model).
  YOLO_MODEL     — path to a YOLO .pt model file (default: yolov8n.pt).
  DETECT_LABELS  — comma-separated labels to detect (default: player).
"""

import io
import os
import logging
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from PIL import Image
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("royer-vision")

app = FastAPI(title="Royer Vision Service", version="0.1.0")

# ── Configuration ──────────────────────────────────────────────────────────

VLM_BASE_URL = os.getenv("VLM_BASE_URL")
VLM_API_KEY = os.getenv("VLM_API_KEY", "")
VLM_MODEL = os.getenv("VLM_MODEL", "gpt-4o-mini")
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL", "yolov8n.pt")
DETECT_LABELS = [l.strip() for l in os.getenv("DETECT_LABELS", "player").split(",") if l.strip()]

# ── Optional YOLO model (lazy) ─────────────────────────────────────────────

_yolo_model = None
_yolo_available = False


def _load_yolo():
    """Lazy-load the YOLO model. Returns the model or None if unavailable."""
    global _yolo_model, _yolo_available
    if _yolo_model is not None:
        return _yolo_model
    try:
        from ultralytics import YOLO  # type: ignore
        if not os.path.exists(YOLO_MODEL_PATH):
            logger.warning(
                "YOLO model file not found: %s. Download it first or set YOLO_MODEL.",
                YOLO_MODEL_PATH,
            )
            _yolo_available = False
            return None
        _yolo_model = YOLO(YOLO_MODEL_PATH)
        _yolo_available = True
        logger.info("YOLO model loaded: %s", YOLO_MODEL_PATH)
    except ImportError:
        logger.warning(
            "ultralytics not installed. Install with: pip install ultralytics "
            "(requires torch, which may not be available on Termux)."
        )
        _yolo_available = False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load YOLO model: %s", exc)
        _yolo_available = False
    return _yolo_model


# ── VLM client ─────────────────────────────────────────────────────────────

_vlm_client: Optional[OpenAI] = None


def _get_vlm_client() -> Optional[OpenAI]:
    if not VLM_BASE_URL:
        return None
    global _vlm_client
    if _vlm_client is None:
        _vlm_client = OpenAI(base_url=VLM_BASE_URL, api_key=VLM_API_KEY)
    return _vlm_client


# ── Helpers ────────────────────────────────────────────────────────────────

async def _read_image(upload: UploadFile) -> Image.Image:
    data = await upload.read()
    try:
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc


def _image_to_bytes(img: Image.Image, format: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "yolo_available": _yolo_available,
        "vlm_configured": bool(VLM_BASE_URL),
        "vlm_model": VLM_MODEL if VLM_BASE_URL else None,
        "detect_labels": DETECT_LABELS,
    }


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    label: Optional[str] = Form(default=None),
):
    """
    Run YOLO object detection on an uploaded image.

    Form fields:
      file   — image file (jpg/png/webp)
      label  — optional target label filter (default: DETECT_LABELS env)
    """
    model = _load_yolo()
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="YOLO not available. Install ultralytics+torch and provide a model file.",
        )

    img = await _read_image(file)
    target_label = (label or DETECT_LABELS[0] if DETECT_LABELS else None)

    try:
        results = model(img)  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        logger.exception("YOLO inference failed")
        raise HTTPException(status_code=500, detail=f"YOLO inference failed: {exc}") from exc

    detections = []
    for result in results:
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            cls_id = int(box.cls[0]) if hasattr(box.cls, "__getitem__") else int(box.cls)
            cls_name = result.names[cls_id] if hasattr(result, "names") else str(cls_id)
            if target_label and cls_name.lower() != target_label.lower():
                continue
            conf = float(box.conf[0]) if hasattr(box.conf, "__getitem__") else 0.0
            x1, y1, x2, y2 = box.xyxy[0].tolist() if hasattr(box.xyxy, "__getitem__") else [0, 0, 0, 0]
            detections.append({
                "label": cls_name,
                "confidence": round(conf, 4),
                "box": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],  # [x, y, w, h]
            })

    return {"detections": detections, "count": len(detections), "label": target_label}


@app.post("/describe")
async def describe(file: UploadFile = File(...)):
    """
    Describe an image using a VLM (OpenAI-compatible API).

    Requires VLM_BASE_URL to be set.
    """
    client = _get_vlm_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="VLM not configured. Set VLM_BASE_URL (and optionally VLM_API_KEY).",
        )

    img = await _read_image(file)
    img_bytes = _image_to_bytes(img)

    # Build a data URI for the vision model.
    import base64
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    data_uri = f"data:image/jpeg;base64,{b64}"

    try:
        completion = client.chat.completions.create(  # type: ignore[attr-defined]
            model=VLM_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image in detail, focusing on players, objects, and anything relevant to a Roblox game bot."},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            max_tokens=512,
        )
        text = completion.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.exception("VLM describe failed")
        raise HTTPException(status_code=500, detail=f"VLM describe failed: {exc}") from exc

    return {"description": text.strip()}


@app.post("/ask")
async def ask(
    prompt: str = Form(...),
    file: Optional[UploadFile] = File(default=None),
    context: Optional[str] = Form(default=None),
):
    """
    Ask a VLM a question, optionally with an image and context.

    Form fields:
      prompt   — the question
      file     — optional image
      context  — optional JSON string of additional context
    """
    client = _get_vlm_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="VLM not configured. Set VLM_BASE_URL (and optionally VLM_API_KEY).",
        )

    content: List[dict] = [{"type": "text", "text": prompt}]

    if context:
        content.append({"type": "text", "text": f"Context: {context}"})

    if file:
        img = await _read_image(file)
        img_bytes = _image_to_bytes(img)
        import base64
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

    try:
        completion = client.chat.completions.create(  # type: ignore[attr-defined]
            model=VLM_MODEL,
            messages=[{"role": "user", "content": content}],
            max_tokens=1024,
        )
        text = completion.choices[0].message.content or ""
    except Exception as exc:  # noqa: BLE001
        logger.exception("VLM ask failed")
        raise HTTPException(status_code=500, detail=f"VLM ask failed: {exc}") from exc

    return {"response": text.strip()}
