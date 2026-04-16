"use client";

import type { AnalysisResponse, HeatmapCell, SentenceArtifact, TimelineSegment } from "../lib/types";

const verdictCopy: Record<AnalysisResponse["verdict"], { label: string; tone: string }> = {
  AI_GENERATED: { label: "AI GENERATED", tone: "border-rosemark text-rosemark" },
  LIKELY_AI: { label: "LIKELY AI", tone: "border-sunmark text-sunmark" },
  UNCERTAIN: { label: "UNCERTAIN", tone: "border-cyanline text-cyanline" },
  LIKELY_HUMAN: { label: "LIKELY HUMAN", tone: "border-leaf text-leaf" },
  HUMAN: { label: "HUMAN", tone: "border-leaf text-leaf" }
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function scoreTone(score: number) {
  if (score >= 0.72) return "bg-rosemark";
  if (score >= 0.5) return "bg-sunmark";
  return "bg-leaf";
}

function SentenceHighlights({ sentences }: { sentences: SentenceArtifact[] }) {
  if (!sentences.length) return null;
  return (
    <section className="border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-semibold">Sentence Signals</h2>
      <div className="mt-4 space-y-3">
        {sentences.map((sentence) => (
          <p
            key={sentence.index}
            className="border-l-4 bg-[var(--paper)] p-3 text-sm leading-6"
            style={{ borderColor: sentence.score >= 0.65 ? "var(--rose)" : sentence.score >= 0.45 ? "var(--sun)" : "var(--leaf)" }}
          >
            <span className="mr-2 font-semibold">{percent(sentence.score)}</span>
            {sentence.text}
          </p>
        ))}
      </div>
    </section>
  );
}

function HeatmapPreview({ cells }: { cells: HeatmapCell[] }) {
  if (!cells.length) return null;
  return (
    <section className="border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-semibold">Image Heatmap</h2>
      <div className="mt-4 grid aspect-[4/3] grid-cols-8 grid-rows-6 overflow-hidden border border-[var(--line)]">
        {cells.map((cell) => (
          <div
            key={`${cell.x}-${cell.y}`}
            className="border border-white"
            style={{
              backgroundColor:
                cell.score >= 0.66
                  ? `rgba(190, 18, 60, ${0.25 + cell.score * 0.45})`
                  : cell.score >= 0.44
                    ? `rgba(180, 83, 9, ${0.22 + cell.score * 0.42})`
                    : `rgba(21, 128, 61, ${0.18 + cell.score * 0.34})`
            }}
            title={`${cell.x},${cell.y}: ${percent(cell.score)}`}
          />
        ))}
      </div>
    </section>
  );
}

function TimelinePreview({ segments }: { segments: TimelineSegment[] }) {
  if (!segments.length) return null;
  return (
    <section className="border border-[var(--line)] bg-white p-5">
      <h2 className="text-lg font-semibold">Video Timeline</h2>
      <div className="mt-4 flex h-16 overflow-hidden border border-[var(--line)]">
        {segments.map((segment) => (
          <div
            key={segment.start_seconds}
            className={`${scoreTone(segment.score)} min-w-0 flex-1 border-r border-white`}
            style={{ opacity: 0.35 + segment.score * 0.55 }}
            title={`${segment.start_seconds}s-${segment.end_seconds}s: ${percent(segment.score)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
        <span>0s</span>
        <span>{segments[segments.length - 1]?.end_seconds ?? 0}s</span>
      </div>
    </section>
  );
}

export function ResultDashboard({ result }: { result: AnalysisResponse }) {
  const verdict = verdictCopy[result.verdict];
  const resultUrl = typeof window !== "undefined" ? `${window.location.origin}/results/${result.request_id}` : `/results/${result.request_id}`;

  return (
    <div className="space-y-5">
      <section className="surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">{result.modality}</p>
            <h1 className={`mt-2 inline-flex border px-3 py-2 text-2xl font-bold ${verdict.tone}`}>{verdict.label}</h1>
            <p className="mt-4 max-w-3xl leading-7 text-[var(--muted)]">{result.explanation}</p>
          </div>
          <div className="min-w-48 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4 text-left">
            <p className="text-sm text-[var(--muted)]">Confidence</p>
            <p className="mt-1 text-4xl font-bold">{percent(result.confidence)}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {percent(result.confidence_range[0])} to {percent(result.confidence_range[1])}
            </p>
          </div>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="text-lg font-semibold">Signal Breakdown</h2>
        <div className="stable-grid mt-4 grid gap-3">
          {result.layer_breakdown.map((layer) => (
            <article key={layer.name} className="soft-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{layer.name}</h3>
                <span className="text-sm font-semibold">{percent(layer.score)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--paper)]">
                <div className={`h-full rounded-full ${scoreTone(layer.score)}`} style={{ width: percent(layer.score) }} />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{layer.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Probable Sources</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.detected_sources.map((source) => (
              <span key={source} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm">
                {source}
              </span>
            ))}
          </div>
        </div>
        <div className="surface p-5">
          <h2 className="text-lg font-semibold">Audit</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Request</dt>
              <dd className="break-all text-right">{result.request_id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Processing</dt>
              <dd>{result.processing_time_ms}ms</dd>
            </div>
          </dl>
        </div>
      </section>

      <HeatmapPreview cells={result.artifacts.heatmap ?? []} />
      <TimelinePreview segments={result.artifacts.timeline ?? []} />
      <SentenceHighlights sentences={result.artifacts.sentences ?? []} />

      <section className="surface p-5">
        <h2 className="text-lg font-semibold">Permalink</h2>
        <p className="mt-3 break-all text-sm text-[var(--muted)]">{resultUrl}</p>
        <p className="mt-4 border-l-4 border-cyanline bg-[var(--paper)] p-3 text-sm leading-6 text-[var(--muted)]">{result.disclaimer}</p>
      </section>
    </div>
  );
}
