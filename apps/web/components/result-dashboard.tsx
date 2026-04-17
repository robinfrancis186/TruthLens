"use client";

import type { AnalysisResponse, HeatmapCell, SentenceArtifact, TimelineSegment } from "../lib/types";

const verdictCopy: Record<AnalysisResponse["verdict"], { label: string; tone: string; soft: string; accent: string }> = {
  AI_GENERATED: { label: "AI GENERATED", tone: "border-rosemark text-rosemark", soft: "bg-[var(--rose-soft)]", accent: "var(--rose)" },
  LIKELY_AI: { label: "LIKELY AI", tone: "border-sunmark text-sunmark", soft: "bg-[var(--sun-soft)]", accent: "var(--sun)" },
  UNCERTAIN: { label: "UNCERTAIN", tone: "border-cyanline text-cyanline", soft: "bg-[var(--cyan-soft)]", accent: "var(--cyan)" },
  LIKELY_HUMAN: { label: "LIKELY HUMAN", tone: "border-leaf text-leaf", soft: "bg-[var(--leaf-soft)]", accent: "var(--leaf)" },
  HUMAN: { label: "HUMAN", tone: "border-leaf text-leaf", soft: "bg-[var(--leaf-soft)]", accent: "var(--leaf)" }
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
    <section className="surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-cyanline">Text artifact</p>
          <h2 className="mt-1 text-xl font-black">Sentence Signals</h2>
        </div>
        <p className="text-sm text-[var(--muted)]">{sentences.length} checked</p>
      </div>
      <div className="mt-4 space-y-3">
        {sentences.map((sentence) => (
          <p
            key={sentence.index}
            className="rounded-lg border border-[var(--line)] border-l-4 bg-[var(--panel-soft)] p-4 text-sm leading-6"
            style={{ borderColor: sentence.score >= 0.65 ? "var(--rose)" : sentence.score >= 0.45 ? "var(--sun)" : "var(--leaf)" }}
          >
            <span className="mr-2 font-black">{percent(sentence.score)}</span>
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
    <section className="surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-cyanline">Image artifact</p>
          <h2 className="mt-1 text-xl font-black">Image Heatmap</h2>
        </div>
        <p className="text-sm text-[var(--muted)]">Patch-level demo signals</p>
      </div>
      <div className="mt-4 grid aspect-[4/3] grid-cols-8 grid-rows-6 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-1">
        {cells.map((cell) => (
          <div
            key={`${cell.x}-${cell.y}`}
            className="rounded border border-white"
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
      <div className="mt-3 flex items-center justify-between text-xs font-bold text-[var(--muted)]">
        <span>Lower</span>
        <span>Higher</span>
      </div>
    </section>
  );
}

function TimelinePreview({ segments }: { segments: TimelineSegment[] }) {
  if (!segments.length) return null;
  return (
    <section className="surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-cyanline">Video artifact</p>
          <h2 className="mt-1 text-xl font-black">Video Timeline</h2>
        </div>
        <p className="text-sm text-[var(--muted)]">{segments.length} segments</p>
      </div>
      <div className="mt-4 flex h-20 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-1">
        {segments.map((segment) => (
          <div
            key={segment.start_seconds}
            className={`${scoreTone(segment.score)} min-w-0 flex-1 rounded border-r border-white`}
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
  const confidenceDegrees = `${Math.round(result.confidence * 360)}deg`;

  return (
    <div className="space-y-5">
      <section className="surface overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
          <div className="p-5 md:p-6">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">{result.modality} report</p>
            <h1 className={`mt-3 inline-flex rounded-lg border px-4 py-3 text-2xl font-black ${verdict.tone} ${verdict.soft}`}>{verdict.label}</h1>
            <p className="mt-4 max-w-3xl leading-7 text-[var(--muted)]">{result.explanation}</p>
          </div>
          <div className="border-t border-[var(--line)] bg-[var(--panel-soft)] p-5 lg:border-l lg:border-t-0">
            <div
              className="mx-auto grid h-40 w-40 place-items-center rounded-full"
              style={{
                background: `conic-gradient(${verdict.accent} ${confidenceDegrees}, #e7edf3 0deg)`
              }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
                <div>
                  <p className="text-xs font-bold text-[var(--muted)]">Confidence</p>
                  <p className="text-4xl font-black">{percent(result.confidence)}</p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-bold text-[var(--muted)]">
              Range {percent(result.confidence_range[0])} to {percent(result.confidence_range[1])}
            </p>
          </div>
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-cyanline">Ensemble</p>
            <h2 className="mt-1 text-xl font-black">Signal Breakdown</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">{result.processing_time_ms}ms processing</p>
        </div>
        <div className="stable-grid mt-4 grid gap-4">
          {result.layer_breakdown.map((layer) => (
            <article key={layer.name} className="soft-surface p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">{layer.name}</h3>
                <span className="rounded-lg bg-[var(--panel-soft)] px-2 py-1 text-sm font-black">{percent(layer.score)}</span>
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
          <p className="text-xs font-black uppercase tracking-wide text-cyanline">Attribution</p>
          <h2 className="mt-1 text-xl font-black">Probable Sources</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.detected_sources.map((source) => (
              <span key={source} className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-sm font-bold">
                {source}
              </span>
            ))}
          </div>
        </div>
        <div className="surface p-5">
          <p className="text-xs font-black uppercase tracking-wide text-cyanline">Trace</p>
          <h2 className="mt-1 text-xl font-black">Audit</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Request</dt>
              <dd className="mono break-all text-right text-xs">{result.request_id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Processing</dt>
              <dd className="font-bold">{result.processing_time_ms}ms</dd>
            </div>
          </dl>
        </div>
      </section>

      <HeatmapPreview cells={result.artifacts.heatmap ?? []} />
      <TimelinePreview segments={result.artifacts.timeline ?? []} />
      <SentenceHighlights sentences={result.artifacts.sentences ?? []} />

      <section className="surface p-5">
        <p className="text-xs font-black uppercase tracking-wide text-cyanline">Share</p>
        <h2 className="mt-1 text-xl font-black">Permalink</h2>
        <p className="mono mt-3 break-all rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-xs text-[var(--muted)]">{resultUrl}</p>
        <p className="mt-4 rounded-lg border-l-4 border-cyanline bg-[var(--cyan-soft)] p-3 text-sm font-medium leading-6 text-[var(--muted)]">{result.disclaimer}</p>
      </section>
    </div>
  );
}
