import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    mode: "mvp-demo",
    disclaimer: "Coverage entries describe planned production integrations; current scoring is deterministic demo/heuristic logic.",
    modalities: [
      {
        modality: "IMAGE",
        accepted_types: [".heic", ".jpeg", ".jpg", ".png", ".webp"],
        planned_integrations: ["SynthID", "C2PA", "AIDE", "CLIP probe", "FFT/DCT forensics"]
      },
      {
        modality: "VIDEO",
        accepted_types: [".avi", ".mov", ".mp4", ".webm"],
        planned_integrations: ["SynthID Video", "VideoSeal", "MediaPipe", "FFmpeg", "FaceForensics++"]
      },
      {
        modality: "TEXT",
        accepted_types: [".docx", ".md", ".pdf", ".txt"],
        planned_integrations: ["SynthID Text", "RADAR", "Binoculars", "DeBERTa", "multilingual DistilBERT"]
      }
    ]
  });
}
