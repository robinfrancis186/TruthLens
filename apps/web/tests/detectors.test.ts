import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeImage, analyzeText, buildResult } from "../lib/server/detectors";

test("filename hints do not change image confidence for identical bytes", () => {
  const bytes = Buffer.from("\x89PNG\r\n\x1a\nsame image bytes");
  const first = buildResult(analyzeImage(bytes, "camera-photo.png"), Date.now());
  const second = buildResult(analyzeImage(bytes, "ai-generated-midjourney.png"), Date.now());

  assert.equal(first.confidence, second.confidence);
  assert.equal(first.layer_scores.neural_classifier, second.layer_scores.neural_classifier);
});

test("HF model score is primary when present", () => {
  const output = analyzeText("This is a simple sample text.");
  output.artifacts.metadata = {
    hf_status: "ok",
    hf_model: "test/model",
    hf_label: "generated",
    hf_score: 0.91
  };
  output.layer_scores.neural_classifier = 0.91;

  const result = buildResult(output, Date.now());
  assert.equal(result.confidence, 0.91);
  assert.equal(result.verdict, "AI_GENERATED");
  assert.equal(result.artifacts.metadata?.fusion_strategy, "model_primary");
});
