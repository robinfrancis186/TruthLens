from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_models() -> None:
    response = client.get("/v1/models")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "mvp-demo"
    assert {entry["modality"] for entry in body["modalities"]} == {"IMAGE", "VIDEO", "TEXT"}


def test_loopback_cors_allows_alternate_web_ports() -> None:
    origin = "http://127.0.0.1:3001"
    response = client.options(
        "/v1/analyze",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_text_analyze_shape() -> None:
    response = client.post(
        "/v1/analyze",
        data={
            "content_type": "text",
            "text": "Furthermore, it is important to note that transparent systems play a crucial role. Moreover, they provide comprehensive insights.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["modality"] == "TEXT"
    assert body["request_id"]
    assert body["verdict"] in {"AI_GENERATED", "LIKELY_AI", "UNCERTAIN", "LIKELY_HUMAN", "HUMAN"}
    assert 0 <= body["confidence"] <= 1
    assert "layer_scores" in body
    assert "watermark_signals" in body
    assert "sentences" in body["artifacts"]


def test_status_returns_cached_result() -> None:
    analyze = client.post("/v1/analyze", data={"content_type": "text", "text": "I wrote this quickly after lunch. It has uneven bits."})
    request_id = analyze.json()["request_id"]
    response = client.get(f"/v1/status/{request_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_image_upload_returns_heatmap() -> None:
    response = client.post(
        "/v1/analyze",
        data={"content_type": "image"},
        files={"file": ("generated-sample.png", b"\x89PNG\r\n\x1a\ntruthlens image bytes", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["modality"] == "IMAGE"
    assert body["artifacts"]["heatmap"]


def test_video_upload_returns_timeline() -> None:
    response = client.post(
        "/v1/analyze",
        data={"content_type": "video"},
        files={"file": ("runway-sample.mp4", b"\x00\x00\x00 ftypmp42moovtruthlens video bytes", "video/mp4")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["modality"] == "VIDEO"
    assert body["artifacts"]["timeline"]


def test_empty_text_rejected() -> None:
    response = client.post("/v1/analyze", data={"content_type": "text", "text": "   "})
    assert response.status_code == 422


def test_invalid_modality_rejected() -> None:
    response = client.post("/v1/analyze", data={"content_type": "audio", "text": "sample"})
    assert response.status_code == 422


def test_same_text_stable_scores() -> None:
    payload = {"content_type": "text", "text": "This is a deterministic sample. Furthermore, it has polished transitions."}
    first = client.post("/v1/analyze", data=payload).json()
    second = client.post("/v1/analyze", data=payload).json()
    assert first["confidence"] == second["confidence"]
    assert first["layer_scores"] == second["layer_scores"]


def test_human_context_lowers_short_text_score() -> None:
    ai_text = (
        "Furthermore, it is important to note that transparent verification systems play a crucial role. "
        "Moreover, these comprehensive insights provide seamless operational clarity."
    )
    human_text = (
        "I took the early train to Kochi yesterday and wrote these notes near the platform tea stall. "
        "The first draft was messy, so I crossed out two paragraphs and kept what I saw."
    )
    ai_result = client.post("/v1/analyze", data={"content_type": "text", "text": ai_text}).json()
    human_result = client.post("/v1/analyze", data={"content_type": "text", "text": human_text}).json()
    assert ai_result["confidence"] > human_result["confidence"]
    assert human_result["verdict"] in {"HUMAN", "LIKELY_HUMAN"}


def test_unsupported_image_type_rejected() -> None:
    response = client.post(
        "/v1/analyze",
        data={"content_type": "image"},
        files={"file": ("sample.gif", b"GIF89a", "image/gif")},
    )
    assert response.status_code == 415


def test_image_sources_require_ai_provenance_hint() -> None:
    response = client.post(
        "/v1/analyze",
        data={"content_type": "image"},
        files={"file": ("camera-sample.jpg", b"\xff\xd8\xff\xdbExif camera bytes", "image/jpeg")},
    )
    assert response.status_code == 200
    assert response.json()["detected_sources"] == ["No specific generator identified"]
