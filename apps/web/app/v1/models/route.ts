import { NextResponse } from "next/server";
import {
  configuredImageModels,
  configuredTextModels,
  configuredVideoFrameModels,
  hasHfToken
} from "../../../lib/server/huggingface";

export function GET() {
  return NextResponse.json({
    mode: "model-backed",
    hf_configured: hasHfToken(),
    disclaimer: "Scores are probabilistic model outputs with supporting metadata signals, not legal or forensic proof.",
    modalities: [
      {
        modality: "IMAGE",
        accepted_types: [".heic", ".jpeg", ".jpg", ".png", ".webp"],
        primary_model: configuredImageModels()[0],
        fallback_models: configuredImageModels().slice(1),
        supporting_signals: ["EXIF/XMP context", "C2PA marker scan", "byte entropy"]
      },
      {
        modality: "VIDEO",
        accepted_types: [".avi", ".mov", ".mp4", ".webm"],
        primary_model: configuredVideoFrameModels()[0],
        fallback_models: configuredVideoFrameModels().slice(1),
        supporting_signals: ["browser-sampled frames", "frame-level image classifier timeline"]
      },
      {
        modality: "TEXT",
        accepted_types: [".docx", ".md", ".pdf", ".txt"],
        primary_model: configuredTextModels()[0],
        fallback_models: configuredTextModels().slice(1),
        supporting_signals: ["sentence rhythm", "lexical diversity", "phrase density"]
      }
    ]
  });
}
