export type Modality = "image" | "video" | "text";

export type Verdict = "AI_GENERATED" | "LIKELY_AI" | "UNCERTAIN" | "LIKELY_HUMAN" | "HUMAN";

export interface LayerBreakdown {
  name: string;
  score: number;
  explanation: string;
}

export interface SentenceArtifact {
  index: number;
  text: string;
  score: number;
}

export interface HeatmapCell {
  x: number;
  y: number;
  score: number;
}

export interface TimelineSegment {
  start_seconds: number;
  end_seconds: number;
  score: number;
}

export interface AnalysisArtifacts {
  sentences?: SentenceArtifact[];
  heatmap?: HeatmapCell[];
  timeline?: TimelineSegment[];
  metrics?: Record<string, number>;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AnalysisResponse {
  request_id: string;
  verdict: Verdict;
  confidence: number;
  confidence_range: [number, number];
  modality: "IMAGE" | "VIDEO" | "TEXT";
  detected_sources: string[];
  watermark_signals: Record<string, unknown>;
  layer_scores: Record<string, number>;
  layer_breakdown: LayerBreakdown[];
  artifacts: AnalysisArtifacts;
  explanation: string;
  processing_time_ms: number;
  disclaimer: string;
}

export interface StatusResponse {
  request_id: string;
  status: "completed";
  result: AnalysisResponse;
}

