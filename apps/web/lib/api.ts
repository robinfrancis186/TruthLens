import type { AnalysisResponse, Modality, StatusResponse } from "./types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail.map((entry) => ("msg" in entry ? String(entry.msg) : "Validation error")).join(" ");
    }
  } catch {
    return `Request failed with status ${response.status}.`;
  }
  return `Request failed with status ${response.status}.`;
}

export async function analyzeContent(input: {
  modality: Modality;
  text?: string;
  file?: File | null;
  videoFrames?: Array<{ file: File; seconds: number }>;
}): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("content_type", input.modality);
  formData.append("detailed_report", "true");
  if (input.modality === "text" && input.text) {
    formData.append("text", input.text);
  }
  if (input.file && !(input.modality === "video" && input.videoFrames?.length)) {
    formData.append("file", input.file);
  }
  if (input.modality === "video" && input.file) {
    formData.append("source_filename", input.file.name);
  }
  for (const frame of input.videoFrames ?? []) {
    formData.append("video_frame", frame.file);
    formData.append("video_frame_time", String(frame.seconds));
  }

  const response = await fetch(`${API_BASE_URL}/v1/analyze`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as AnalysisResponse;
}

export async function getResult(requestId: string): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/status/${requestId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const body = (await response.json()) as StatusResponse;
  return body.result;
}
