import type { AnalysisArtifacts } from "../types";
import type { DetectorOutput } from "./detectors";

const defaultTextModel = "desklib/ai-text-detector-v1.01";
const defaultImageModel = "haywoodsloan/ai-image-detector-dev-deploy";
const defaultEndpointBase = "https://api-inference.huggingface.co/models";
const timeoutMs = 8000;

interface HfClassification {
  label: string;
  score: number;
}

interface HfScore {
  label: string;
  model: string;
  score: number;
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function metadataFor(artifacts: AnalysisArtifacts) {
  return artifacts.metadata ?? {};
}

function flattenResponse(body: unknown): HfClassification[] {
  const value = Array.isArray(body) && Array.isArray(body[0]) ? body[0] : body;
  if (!Array.isArray(value)) return [];
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

function isAiLabel(label: string) {
  const normalized = label.toLowerCase();
  return /(ai|generated|machine|synthetic|fake|artificial|label_1)/.test(normalized);
}

function isHumanLabel(label: string) {
  const normalized = label.toLowerCase();
  return /(human|real|authentic|original|not|label_0)/.test(normalized);
}

function aiScoreFromLabels(labels: HfClassification[]) {
  const ai = labels.find((entry) => isAiLabel(entry.label));
  if (ai) return { label: ai.label, score: roundScore(ai.score) };
  const human = labels.find((entry) => isHumanLabel(entry.label));
  if (human) return { label: human.label, score: roundScore(1 - human.score) };
  return null;
}

async function classifyWithHuggingFace(input: string | Buffer, model: string, token: string): Promise<HfScore> {
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
      body: isBuffer ? input : JSON.stringify({ inputs: input, parameters: { top_k: 2 } }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HF inference returned ${response.status}`);
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

function applyHfNeuralScore(output: DetectorOutput, score: HfScore, explanation: string) {
  const metadata = metadataFor(output.artifacts);
  output.artifacts.metadata = {
    ...metadata,
    hf_model: score.model,
    hf_label: score.label,
    hf_score: score.score,
    hf_status: "ok"
  };
  output.layer_scores.neural_classifier = score.score;
  output.layer_breakdown = output.layer_breakdown.map((layer) =>
    layer.name === "Neural Classifier" ? { ...layer, score: score.score, explanation } : layer
  );
}

function applyHfError(output: DetectorOutput, model: string, caught: unknown) {
  const metadata = metadataFor(output.artifacts);
  output.artifacts.metadata = {
    ...metadata,
    hf_model: model,
    hf_status: "fallback",
    hf_error: caught instanceof Error ? caught.message.slice(0, 120) : "HF inference failed"
  };
}

export async function enrichWithHuggingFace(output: DetectorOutput, input: { text?: string; image?: Buffer }) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    output.artifacts.metadata = {
      ...metadataFor(output.artifacts),
      hf_status: "disabled"
    };
    return output;
  }

  if (output.modality === "TEXT" && input.text) {
    const model = process.env.HF_TEXT_MODEL ?? defaultTextModel;
    try {
      const score = await classifyWithHuggingFace(input.text, model, token);
      applyHfNeuralScore(output, score, "Hugging Face Desklib AI text detector probability, with heuristic fallback available.");
      output.explanation_parts.push("The neural classifier layer used Hugging Face Desklib AI text detector inference.");
    } catch (caught) {
      applyHfError(output, model, caught);
    }
  }

  if (output.modality === "IMAGE" && input.image) {
    const model = process.env.HF_IMAGE_MODEL ?? defaultImageModel;
    try {
      const score = await classifyWithHuggingFace(input.image, model, token);
      applyHfNeuralScore(output, score, "Hugging Face AI image detector probability mapped from artificial-vs-real labels.");
      output.explanation_parts.push("The neural classifier layer used Hugging Face AI image detector inference.");
      if (score.score >= 0.58 && !output.detected_sources.some((source) => source.includes("Hugging Face"))) {
        output.detected_sources = ["Hugging Face AI image detector", ...output.detected_sources].slice(0, 3);
      }
    } catch (caught) {
      applyHfError(output, model, caught);
    }
  }

  return output;
}
