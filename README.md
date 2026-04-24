# TruthLens

TruthLens is a runnable MVP for a privacy-first AI-generated content detection platform. This version implements the full product shell from the PRD with model-backed text, image, and sampled-frame video detection through Hugging Face Inference Providers.

The MVP is useful for product testing, API integration, UI validation, and future model integration work. It does not provide legal or forensic certainty. Hugging Face classifier probability is the primary scoring signal when configured; watermark, provenance, and heuristic signals are supporting context.

## What Is Included

- `apps/api`: FastAPI service with `/health`, `/v1/analyze`, `/v1/status/{request_id}`, and `/v1/models`.
- `apps/web`: Next.js interface for image, video, and text analysis with a verdict dashboard and shareable result pages.
- `contracts`: Shared response schema and examples matching the PRD response shape.
- In-memory TTL result cache. Uploaded content is processed in memory and is not stored.

## Quick Start

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API docs are available at `http://localhost:8000/docs`.

### Web

```bash
npm install
npm run dev:web
```

Open `http://localhost:3000`.

If the API runs somewhere else, create `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

For the bundled Next.js `/v1` API routes, configure Hugging Face inference:

```bash
HF_TOKEN=hf_...
HF_TEXT_MODEL=desklib/ai-text-detector-v1.01
HF_TEXT_FALLBACK_MODELS=Oxidane/tmr-ai-text-detector
HF_IMAGE_MODEL=haywoodsloan/ai-image-detector-dev-deploy
HF_IMAGE_FALLBACK_MODELS=Ateeqq/ai-vs-human-image-detector,umm-maybe/AI-image-detector
HF_VIDEO_FRAME_MODEL=haywoodsloan/ai-image-detector-dev-deploy
```

Production Vercel deployments fail closed when `HF_TOKEN` is missing instead of returning misleading demo confidence.

## Test Commands

```bash
npm run lint:web
npm run build:web
npm run test:web
cd apps/api && python3 -m pytest
```

## Privacy Model

- Uploaded files and pasted text are never written to disk by the application.
- Only result metadata is cached in memory for short-lived permalink/status lookup.
- Cache contents disappear when the API process restarts.

## MVP Limitations

- Detection scores are probabilistic ML verdicts when Hugging Face is configured; they are not forensic proof.
- Real SynthID, C2PA validation, VideoSeal, AIDE, and FaceForensics++ integrations are deferred.
- Video detection in the Vercel runtime uses browser-sampled frames and image-detector inference, not full temporal video-model inference.
- Redis/BullMQ, API keys, browser extension, Kubernetes, and production rate limits are out of scope for this first runnable build.
