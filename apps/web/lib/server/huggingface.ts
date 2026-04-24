import type { AnalysisArtifacts, TimelineSegment } from "../types";
import { calibrationVersion, roundScore, type DetectorOutput, type VideoFrameInput } from "./detectors";

export const defaultTextModel = "desklib/ai-text-detector-v1.01";
export const defaultTextFallbackModels = ["Oxidane/tmr-ai-text-detector"];
export const defaultImageModel = "haywoodsloan/ai-image-detector-dev-deploy";
export const defaultImageFallbackModels = ["Ateeqq/ai-vs-human-image-detector", "umm-maybe/AI-image-detector"];
export const defaultVideoFrameModel = "haywoodsloan/ai-image-detector-dev-deploy";
export const defaultEndpointBase = "https://router.huggingface.co/hf-inference/models";

const timeoutMs = 12000;

export interface HfClassification {
  label: string;
  score: number;
}

export interface HfAttempt {
  model: string;
  status: "ok" | "error";
  label?: string;
  score?: number;
  error?: string;
}

interface HfScore {
  label: string;
  model: string;
  score: number;
  attempts: HfAttempt[];
}

export class ModelUnavailableError extends Error {
  constructor(message = "Model inference is unavailable. Configure HF_TOKEN or try again after the model provider recovers.") {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

function metadataFor(artifacts: AnalysisArtifacts) {
  artifacts.metadata ??= {};
  return artifacts.metadata;
}

function envList(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const values = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

export function configuredTextModels() {
  return [process.env.HF_TEXT_MODEL ?? defaultTextModel, ...envList("HF_TEXT_FALLBACK_MODELS", defaultTextFallbackModels)];
}

export function configuredImageModels() {
  return [process.env.HF_IMAGE_MODEL ?? defaultImageModel, ...envList("HF_IMAGE_FALLBACK_MODELS", defaultImageFallbackModels)];
}

export function configuredVideoFrameModels() {
  const primary = process.env.HF_VIDEO_FRAME_MODEL ?? defaultVideoFrameModel;
  return [primary, ...envList("HF_IMAGE_FALLBACK_MODELS", defaultImageFallbackModels)];
}

export function hasHfToken() {
  return Boolean(process.env.HF_TOKEN);
}

function strictModelMode() {
  return process.env.TRUTHLENS_REQUIRE_HF === "true" || process.env.VERCEL_ENV === "production";
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message.slice(0, 180) : "HF inference failed";
}

export function flattenResponse(body: unknown): HfClassification[] {
  const value = Array.isArray(body) && Array.isArray(body[0]) ? body[0] : body;
  if (!Array.isArray(value)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "label" in value &&
      "score" in value &&
      typeof value.label === "string" &&
      typeof value.score === "number"
    ) {
      return [{ label: value.label, score: value.score }];
    }
    return [];
  }
  return value
    .filter((entry): entry is HfClassification => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        "label" in entry &&
        "score" in entry &&
        typeof entry.label === "string" &&
        typeof entry.score === "number"
      );
    })
    .sort((first, second) => second.score - first.score);
}

function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/[_-]+/g, " ").trim();
}

export function isAiLabel(label: string) {
  const normalized = normalizeLabel(label);
  if (/^(label 1|ai|artificial|fake|generated|synthetic|machine)$/.test(normalized)) return true;
  if (/(not ai|not generated|non ai|human|real|authentic|original)/.test(normalized)) return false;
  return /(ai|generated|machine|synthetic|fake|artificial)/.test(normalized);
}

export function isHumanLabel(label: string) {
  const normalized = normalizeLabel(label);
  if (/^(label 0|human|real|authentic|original)$/.test(normalized)) return true;
  return /(not ai|not generated|non ai|human|real|authentic|original)/.test(normalized);
}

export function aiScoreFromLabels(labels: HfClassification[]) {
  const ai = labels.find((entry) => isAiLabel(entry.label));
  if (ai) return { label: ai.label, score: roundScore(ai.score) };
  const human = labels.find((entry) => isHumanLabel(entry.label));
  if (human) return { label: human.label, score: roundScore(1 - human.score) };
  return null;
}

async function classifyWithHuggingFace(input: string | Buffer, model: string, token: string): Promise<Omit<HfScore, "attempts">> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const isBuffer = Buffer.isBuffer(input);
  try {
    const response = await fetch(`${process.env.HF_INFERENCE_ENDPOINT_BASE ?? defaultEndpointBase}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isBuffer ? { "Content-Type": "application/octet-stream" } : { "Content-Type": "application/json" })
      },
      body: isBuffer ? input : JSON.stringify({ inputs: input, parameters: { top_k: 2, function_to_apply: "softmax" } }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HF inference returned ${response.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
    }
    const labels = flattenResponse(await response.json());
    const mapped = aiScoreFromLabels(labels);
    if (!mapped) {
      throw new Error("HF inference returned no mappable AI/human label");
    }
    return { model, ...mapped };
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyWithFallbacks(input: string | Buffer, models: string[], token: string): Promise<HfScore> {
  const attempts: HfAttempt[] = [];
  const uniqueModels = Array.from(new Set(models));
  for (const model of uniqueModels) {
    try {
      const score = await classifyWithHuggingFace(input, model, token);
      attempts.push({ model, status: "ok", label: score.label, score: score.score });
      return { ...score, attempts };
    } catch (caught) {
      attempts.push({ model, status: "error", error: errorMessage(caught) });
    }
  }
  const lastError = attempts.at(-1)?.error ?? "All HF model attempts failed.";
  throw Object.assign(new ModelUnavailableError(lastError), { attempts });
}

function applyHfNeuralScore(output: DetectorOutput, score: HfScore, explanation: string) {
  const metadata = metadataFor(output.artifacts);
  output.artifacts.metadata = {
    ...metadata,
    hf_model: score.model,
    hf_label: score.label,
    hf_score: score.score,
    hf_status: "ok",
    model_attempts: score.attempts,
    calibration_version: calibrationVersion
  };
  output.layer_scores.neural_classifier = score.score;
  output.layer_breakdown = output.layer_breakdown.map((layer) =>
    layer.name === "Neural Classifier" ? { ...layer, score: score.score, explanation } : layer
  );
}

function applyHfError(output: DetectorOutput, model: string, caught: unknown) {
  const attempts = typeof caught === "object" && caught !== null && "attempts" in caught ? caught.attempts : [{ model, status: "error", error: errorMessage(caught) }];
  output.artifacts.metadata = {
    ...metadataFor(output.artifacts),
    hf_model: model,
    hf_status: "fallback",
    hf_error: errorMessage(caught),
    model_attempts: attempts,
    calibration_version: calibrationVersion
  };
}

function unavailableIfStrict(output: DetectorOutput, model: string, caught: unknown) {
  applyHfError(output, model, caught);
  if (strictModelMode()) {
    throw caught instanceof ModelUnavailableError ? caught : new ModelUnavailableError(errorMessage(caught));
  }
}

function applyVideoFrameScores(output: DetectorOutput, frameScores: HfScore[], frameInputs: VideoFrameInput[]) {
  const scores = frameScores.map((entry) => entry.score);
  const average = scores.reduce((total, value) => total + value, 0) / scores.length;
  const max = Math.max(...scores);
  const aggregate = roundScore(average * 0.65 + max * 0.35);
  const attempts = frameScores.flatMap((entry, index) =>
    entry.attempts.map((attempt) => ({
      ...attempt,
      frame_index: frameInputs[index]?.index ?? index,
      frame_seconds: frameInputs[index]?.seconds ?? index
    }))
  );
  const timeline: TimelineSegment[] = frameScores.map((score, index) => ({
    start_seconds: frameInputs[index]?.seconds ?? index,
    end_seconds: frameInputs[index + 1]?.seconds ?? (frameInputs[index]?.seconds ?? index) + 1,
    score: score.score
  }));

  output.artifacts.timeline = timeline;
  output.artifacts.metadata = {
    ...metadataFor(output.artifacts),
    hf_model: frameScores[0]?.model ?? configuredVideoFrameModels()[0],
    hf_label: "frame_aggregate",
    hf_score: aggregate,
    hf_status: "ok",
    sampled_frame_count: frameScores.length,
    model_attempts: attempts,
    calibration_version: calibrationVersion
  };
  output.layer_scores.neural_classifier = aggregate;
  output.layer_scores.temporal_forensics = roundScore(average);
  output.layer_scores.face_mesh = roundScore(max);
  output.layer_breakdown = output.layer_breakdown.map((layer) => {
    if (layer.name === "Neural Classifier") {
      return { ...layer, score: aggregate, explanation: "Aggregate Hugging Face image-detector score across sampled video frames." };
    }
    if (layer.name === "Temporal Forensics") {
      return { ...layer, score: roundScore(average), explanation: "Average sampled-frame AI probability." };
    }
    if (layer.name === "Face Mesh") {
      return { ...layer, score: roundScore(max), explanation: "Highest sampled-frame AI probability, useful for localized synthetic edits." };
    }
    return layer;
  });
  output.detected_sources =
    aggregate >= 0.58 ? ["AI-generated video frames", "Hugging Face image detector"] : ["No specific generator identified"];
}

export async function enrichWithHuggingFace(output: DetectorOutput, input: { text?: string; image?: Buffer; videoFrames?: VideoFrameInput[] }) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    output.artifacts.metadata = {
      ...metadataFor(output.artifacts),
      hf_status: "disabled",
      calibration_version: calibrationVersion
    };
    if (strictModelMode()) {
      throw new ModelUnavailableError("HF_TOKEN is required for production model-backed analysis.");
    }
    return output;
  }

  if (output.modality === "TEXT" && input.text) {
    const models = configuredTextModels();
    try {
      const score = await classifyWithFallbacks(input.text, models, token);
      applyHfNeuralScore(output, score, "Hugging Face AI text detector probability. Final confidence is calibrated from this model score.");
      output.explanation_parts.push("The neural classifier layer used Hugging Face text detector inference.");
    } catch (caught) {
      unavailableIfStrict(output, models[0], caught);
    }
  }

  if (output.modality === "IMAGE" && input.image) {
    const models = configuredImageModels();
    try {
      const score = await classifyWithFallbacks(input.image, models, token);
      applyHfNeuralScore(output, score, "Hugging Face AI image detector probability. Final confidence is calibrated from this model score.");
      output.explanation_parts.push("The neural classifier layer used Hugging Face image detector inference.");
      output.detected_sources = score.score >= 0.58 ? ["Hugging Face AI image detector"] : ["No specific generator identified"];
    } catch (caught) {
      unavailableIfStrict(output, models[0], caught);
    }
  }

  if (output.modality === "VIDEO" && input.videoFrames?.length) {
    const models = configuredVideoFrameModels();
    try {
      const frameScores = await Promise.all(input.videoFrames.slice(0, 6).map((frame) => classifyWithFallbacks(frame.data, models, token)));
      applyVideoFrameScores(output, frameScores, input.videoFrames.slice(0, 6));
      output.explanation_parts.push("The video layer used Hugging Face image detector inference over sampled frames.");
    } catch (caught) {
      unavailableIfStrict(output, models[0], caught);
    }
  }

  return output;
}
