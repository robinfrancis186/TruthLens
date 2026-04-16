# TruthLens

TruthLens is a runnable MVP for a privacy-first AI-generated content detection platform. This version implements the full product shell from the PRD with transparent demo/heuristic detectors for images, videos, and text.

The MVP is useful for product testing, API integration, UI validation, and future model integration work. It does not provide production-grade forensic certainty yet. All watermark, neural, forensic, and deepfake signals are deterministic demo signals until real detector weights and licensed model integrations are added.

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

## Test Commands

```bash
npm run lint:web
npm run build:web
cd apps/api && python3 -m pytest
```

## Privacy Model

- Uploaded files and pasted text are never written to disk by the application.
- Only result metadata is cached in memory for short-lived permalink/status lookup.
- Cache contents disappear when the API process restarts.

## MVP Limitations

- Detection scores are hybrid demo heuristics, not production ML verdicts.
- Real SynthID, C2PA, VideoSeal, AIDE, FaceForensics++, and transformer model integrations are deferred.
- Redis/BullMQ, API keys, browser extension, Kubernetes, and production rate limits are out of scope for this first runnable build.

