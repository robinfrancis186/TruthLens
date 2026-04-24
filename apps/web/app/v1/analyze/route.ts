import { NextResponse } from "next/server";
import { analyzeImage, analyzeText, analyzeVideoFrames, buildResult, type DetectorOutput, type VideoFrameInput } from "../../../lib/server/detectors";
import { enrichWithHuggingFace, ModelUnavailableError } from "../../../lib/server/huggingface";
import { setCachedResult } from "../../../lib/server/result-cache";
import { parseTextUpload } from "../../../lib/server/text-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const videoExtensions = new Set([".mp4", ".mov", ".avi", ".webm"]);

function extensionFor(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function error(detail: string, status: number) {
  return NextResponse.json({ detail }, { status });
}

function modelError(caught: unknown) {
  if (caught instanceof ModelUnavailableError) {
    return error(caught.message, 503);
  }
  throw caught;
}

async function enrichOrError(output: DetectorOutput, input: { text?: string; image?: Buffer; videoFrames?: VideoFrameInput[] }) {
  try {
    return await enrichWithHuggingFace(output, input);
  } catch (caught) {
    return modelError(caught);
  }
}

function fileEntries(formData: FormData, key: string) {
  return formData.getAll(key).filter((entry): entry is File => entry instanceof File);
}

function numericEntries(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
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
      try {
        content = await parseTextUpload(Buffer.from(await file.arrayBuffer()), file.name);
      } catch (caught) {
        return error(caught instanceof Error ? caught.message : "Text extraction failed.", 422);
      }
      sourceName = file.name;
    }
    if (!content.trim()) {
      return error("Text content is empty.", 422);
    }
    const output = await enrichOrError(analyzeText(content, sourceName), { text: content });
    if (output instanceof NextResponse) return output;
    const result = buildResult(output, startedAt);
    setCachedResult(result);
    return NextResponse.json(result);
  }

  if (modality === "image") {
    if (!(file instanceof File)) {
      return error("image analysis requires a file upload.", 422);
    }
    const data = Buffer.from(await file.arrayBuffer());
    if (!data.length) {
      return error("Uploaded file is empty.", 422);
    }
    const suffix = extensionFor(file.name);
    if (!imageExtensions.has(suffix)) {
      return error("Unsupported image type. Use JPG, PNG, WebP, or HEIC.", 415);
    }
    const output = await enrichOrError(analyzeImage(data, file.name), { image: data });
    if (output instanceof NextResponse) return output;
    const result = buildResult(output, startedAt);
    setCachedResult(result);
    return NextResponse.json(result);
  }

  const sourceFilename = file instanceof File ? file.name : String(formData.get("source_filename") ?? "upload.webm");
  const suffix = extensionFor(sourceFilename);
  if (!videoExtensions.has(suffix)) {
    return error("Unsupported video type. Use MP4, MOV, AVI, or WebM.", 415);
  }
  const frameFiles = fileEntries(formData, "video_frame");
  if (!frameFiles.length) {
    return error("Video analysis requires sampled frames. Use the web uploader or send repeated video_frame JPEG/PNG fields.", 422);
  }
  const frameTimes = numericEntries(formData, "video_frame_time");
  const frames: VideoFrameInput[] = await Promise.all(
    frameFiles.slice(0, 6).map(async (frame, index) => ({
      data: Buffer.from(await frame.arrayBuffer()),
      index,
      seconds: frameTimes[index] ?? index
    }))
  );
  if (frames.some((frame) => !frame.data.length)) {
    return error("Sampled video frames must not be empty.", 422);
  }
  const output = await enrichOrError(analyzeVideoFrames(frames, sourceFilename), { videoFrames: frames });
  if (output instanceof NextResponse) return output;
  const result = buildResult(output, startedAt);
  setCachedResult(result);
  return NextResponse.json(result);
}
