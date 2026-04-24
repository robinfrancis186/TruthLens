import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ModelUnavailableError,
  aiScoreFromLabels,
  classifyWithFallbacks,
  enrichWithHuggingFace
} from "../lib/server/huggingface";
import { analyzeText } from "../lib/server/detectors";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("maps AI and human labels to AI probability", () => {
  assert.deepEqual(aiScoreFromLabels([{ label: "AI_GENERATED", score: 0.91 }]), { label: "AI_GENERATED", score: 0.91 });
  assert.deepEqual(aiScoreFromLabels([{ label: "human", score: 0.82 }]), { label: "human", score: 0.18 });
  assert.deepEqual(aiScoreFromLabels([{ label: "fake", score: 0.7 }]), { label: "fake", score: 0.7 });
  assert.deepEqual(aiScoreFromLabels([{ label: "real", score: 0.76 }]), { label: "real", score: 0.24 });
  assert.deepEqual(aiScoreFromLabels([{ label: "synthetic", score: 0.88 }]), { label: "synthetic", score: 0.88 });
  assert.deepEqual(aiScoreFromLabels([{ label: "LABEL_1", score: 0.63 }]), { label: "LABEL_1", score: 0.63 });
  assert.deepEqual(aiScoreFromLabels([{ label: "LABEL_0", score: 0.63 }]), { label: "LABEL_0", score: 0.37 });
});

test("tries fallback models after an HF failure", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response("provider error", { status: 503 });
    }
    return Response.json([{ label: "generated", score: 0.84 }]);
  }) as typeof fetch;

  const result = await classifyWithFallbacks("sample", ["primary/model", "fallback/model"], "hf_test");
  assert.equal(result.model, "fallback/model");
  assert.equal(result.score, 0.84);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].status, "error");
  assert.equal(result.attempts[1].status, "ok");
});

test("throws model unavailable in strict production mode without HF token", async () => {
  delete process.env.HF_TOKEN;
  process.env.VERCEL_ENV = "production";
  await assert.rejects(() => enrichWithHuggingFace(analyzeText("plain sample text"), { text: "plain sample text" }), ModelUnavailableError);
});
