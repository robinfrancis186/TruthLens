import type { AnalysisResponse } from "../types";

const ttlMs = 24 * 60 * 60 * 1000;
const results = new Map<string, { expiresAt: number; result: AnalysisResponse }>();

export function setCachedResult(result: AnalysisResponse) {
  results.set(result.request_id, { expiresAt: Date.now() + ttlMs, result });
}

export function getCachedResult(requestId: string) {
  const entry = results.get(requestId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    results.delete(requestId);
    return null;
  }
  return entry.result;
}
