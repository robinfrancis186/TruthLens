import { NextResponse } from "next/server";
import { analyzeImage, analyzeText, analyzeVideo, buildResult } from "../../../lib/server/detectors";
import { enrichWithHuggingFace } from "../../../lib/server/huggingface";
import { setCachedResult } from "../../../lib/server/result-cache";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const videoExtensions = new Set([".mp4", ".mov", ".avi", ".webm"]);

function extensionFor(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function error(detail: string, status: number) {
  return NextResponse.json({ detail }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const formData = await request.formData();
  const modality = String(formData.get("content_type") ?? "").trim().toLowerCase();
  const file = formData.get("file");
  const text = String(formData.get("text") ?? "");

  if (!["image", "video", "text"].includes(modality)) {
    return error("content_type must be one of: image, video, text.", 422);
  }

  if (modality === "text") {
    let content = text;
    let sourceName: string | undefined;
    if (file instanceof File) {
      content = Buffer.from(await file.arrayBuffer()).toString("utf8");
      sourceName = file.name;
    }
    if (!content.trim()) {
      return error("Text content is empty.", 422);
    }
    const output = await enrichWithHuggingFace(analyzeText(content, sourceName), { text: content });
    const result = buildResult(output, startedAt);
    setCachedResult(result);
    return NextResponse.json(result);
  }

  if (!(file instanceof File)) {
    return error(`${modality} analysis requires a file upload.`, 422);
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!data.length) {
    return error("Uploaded file is empty.", 422);
  }

  const suffix = extensionFor(file.name);
  if (modality === "image") {
    if (!imageExtensions.has(suffix)) {
      return error("Unsupported image type. Use JPG, PNG, WebP, or HEIC.", 415);
    }
    const output = await enrichWithHuggingFace(analyzeImage(data, file.name), { image: data });
    const result = buildResult(output, startedAt);
    setCachedResult(result);
    return NextResponse.json(result);
  }

  if (!videoExtensions.has(suffix)) {
    return error("Unsupported video type. Use MP4, MOV, AVI, or WebM.", 415);
  }
  const result = buildResult(analyzeVideo(data, file.name), startedAt);
  setCachedResult(result);
  return NextResponse.json(result);
}
