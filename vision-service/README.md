# Royer Vision Service

A Python/HTTP vision backend for **robloxbot** — provides YOLO object detection
and VLM/LLM image understanding over HTTP. Designed to run alongside the
Node.js bot library on Termux/Android or any machine with Python.

## Why a separate service?

Native Node vision modules (`onnxruntime-node`, `sharp`, `ultralytics` via
`@tensorflow/tfjs`) do **not** compile reliably on Termux/Android. This Python
service keeps the bot library dependency-free while still giving it
YOLO + VLM capabilities over HTTP.

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /health` | GET | Service health, YOLO/VLM availability |
| `POST /detect` | POST | YOLO object detection on an uploaded image |
| `POST /describe` | POST | VLM image description |
| `POST /ask` | POST | VLM question/answer, optionally with image |

## Quick start

### 1. Install Python dependencies

```bash
cd vision-service
pip install -r requirements.txt
```

### 2. (Optional) Download a YOLO model

```bash
# Download YOLOv8 nano model (~6 MB)
wget https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt -O yolov8n.pt
```

Set `YOLO_MODEL` to the path if it's not `yolov8n.pt`.

### 3. Configure environment

Create a `.env` in `vision-service/`:

```
# YOLO model path (default: yolov8n.pt)
YOLO_MODEL=yolov8n.pt
# Labels to detect (default: player)
DETECT_LABELS=player,npc,object,tool

# VLM — OpenAI-compatible endpoint (Ollama, OpenAI, vLLM, etc.)
VLM_BASE_URL=http://localhost:11434/v1   # example: Ollama
VLM_API_KEY=sk-optional-key
VLM_MODEL=llava:latest                   # example: Ollama model
```

If you don't have a VLM, leave `VLM_BASE_URL` unset — `/detect` still works,
but `/describe` and `/ask` will return 503.

### 4. Run the service

```bash
cd vision-service
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 5. Point robloxbot at it

In robloxbot's `.env`:

```
VISION_SERVICE_URL=http://<vision-service-host>:8000
```

Then:

```js
import { createVisionService } from "./src/index.js";

const vision = createVisionService();

// YOLO detection
const detections = await vision.detector.detect(imageBuffer);
// → [{ label: "player", box: [x, y, w, h], confidence: 0.95 }, ...]

// VLM description
const desc = await vision.vlm.describe(imageBuffer);

// VLM question
const answer = await vision.vlm.ask("Where is the nearest player?");
```

## Termux notes

- `torch` / `ultralytics` may **not** install on Termux due to missing
  prebuilt wheels. If YOLO isn't available, `/detect` returns 503.
- Workaround: run the vision service on a PC/server with an NVIDIA GPU and
  point `VISION_SERVICE_URL` at it from Termux.
- For VLM without local models, use Ollama (`VLM_BASE_URL=http://localhost:11434/v1`)
  or any OpenAI-compatible API.

## License

MIT
