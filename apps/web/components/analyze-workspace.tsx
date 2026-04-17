"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import { analyzeContent } from "../lib/api";
import type { AnalysisResponse, Modality } from "../lib/types";
import { ResultDashboard } from "./result-dashboard";

const modes: Array<{ id: Modality; label: string; shorthand: string; accept: string; copy: string }> = [
  { id: "text", label: "Text", shorthand: "TXT", accept: ".txt,.md,.docx,.pdf", copy: "Paste text or attach a document." },
  { id: "image", label: "Image", shorthand: "IMG", accept: ".jpg,.jpeg,.png,.webp,.heic", copy: "JPG, PNG, WebP, and HEIC." },
  { id: "video", label: "Video", shorthand: "VID", accept: ".mp4,.mov,.avi,.webm", copy: "MP4, MOV, AVI, and WebM." }
];

const trustSignals = ["No content stored", "Transparent scoring", "Shareable report"];
const previewSignals = [
  { label: "Watermark", copy: "SynthID, C2PA, and provenance slots are wired for future integrations." },
  { label: "Forensics", copy: "Image heatmaps and video timelines make the demo signals visible." },
  { label: "Classifier", copy: "Deterministic scoring keeps demos stable while real models are deferred." }
];

const sampleText =
  "Furthermore, it is important to note that transparent verification systems play a crucial role in modern information workflows. Moreover, they provide comprehensive insights with consistent structure and polished transitions.";

export function AnalyzeWorkspace() {
  const [mode, setMode] = useState<Modality>("text");
  const [text, setText] = useState(sampleText);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeMode = useMemo(() => modes.find((entry) => entry.id === mode) ?? modes[0], [mode]);
  const canSubmit = mode === "text" ? Boolean(text.trim() || file) : Boolean(file);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const response = await analyzeContent({ modality: mode, text: mode === "text" ? text : undefined, file });
      setResult(response);
      window.history.replaceState(null, "", `/results/${response.request_id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <nav className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-sm font-black text-white">TL</div>
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-ink">TruthLens</p>
            <p className="text-xs font-semibold text-[var(--muted)]">AI content verification MVP</p>
          </div>
        </div>
        <div className="hidden rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-[var(--muted)] shadow-sm sm:block">
          Local demo engine
        </div>
      </nav>

      <header className="surface overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-6 md:p-8">
            <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--cyan-soft)] px-3 py-2 text-xs font-black uppercase text-cyanline">
              <span className="h-2 w-2 rounded-full bg-cyanline" />
              Runnable MVP
            </div>
            <h1 className="text-balance mt-4 text-4xl font-black leading-[1.02] md:text-6xl">Check content authenticity in one workspace.</h1>
            <p className="mt-4 max-w-2xl leading-7 text-[var(--muted)]">
              Upload an image or video, paste text, and get a transparent confidence report with every signal explained.
            </p>
            <div className="mt-7 grid gap-3 text-sm sm:grid-cols-3">
              {trustSignals.map((item) => (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 font-bold" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="relative min-h-64 border-t border-[var(--line)] lg:border-l lg:border-t-0">
            <Image
              alt="Verification desk with laptop and camera equipment"
              className="pointer-events-none h-full min-h-64 w-full object-cover saturate-[0.92]"
              fill
              priority
              sizes="(min-width: 1024px) 42vw, 100vw"
              src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80"
            />
            <div className="glass-strip absolute bottom-4 left-4 right-4 rounded-lg p-4">
              <p className="text-sm font-black">MVP status</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Hybrid heuristics now. Real detector integrations next.</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[430px_minmax(0,1fr)]">
        <form onSubmit={onSubmit} className="surface h-fit p-5 lg:sticky lg:top-6">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-wide text-cyanline">Analyzer</p>
            <h2 className="mt-1 text-2xl font-black">Start a check</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Choose a modality and submit content for a fresh verdict.</p>
          </div>
          <fieldset className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-1">
            <legend className="sr-only">Content type</legend>
            {modes.map((entry) => (
              <button
                className={`focus-ring rounded-lg border px-3 py-3 text-sm font-black transition ${
                  mode === entry.id
                    ? "border-cyanline bg-cyanline text-white shadow-sm"
                    : "border-transparent bg-transparent text-[var(--muted)] hover:bg-white hover:text-ink"
                }`}
                key={entry.id}
                type="button"
                onClick={() => {
                  setMode(entry.id);
                  setFile(null);
                  setError(null);
                }}
              >
                {entry.label}
              </button>
            ))}
          </fieldset>

          <div className="mt-5">
            <label className="text-sm font-black" htmlFor="truthlens-file">
              Upload file
            </label>
            <div className="mt-2 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-4 transition hover:border-cyanline">
              <input
                id="truthlens-file"
                className="focus-ring w-full text-sm"
                type="file"
                accept={activeMode.accept}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="mt-3 text-sm text-[var(--muted)]">{activeMode.copy}</p>
              {file ? (
                <p className="mt-3 break-all rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold">{file.name}</p>
              ) : null}
            </div>
          </div>

          {mode === "text" ? (
            <div className="mt-5">
              <label className="text-sm font-black" htmlFor="truthlens-text">
                Text
              </label>
              <textarea
                id="truthlens-text"
                className="focus-ring mt-2 min-h-52 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4 leading-6 shadow-inner"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste text for analysis."
              />
            </div>
          ) : null}

          <button
            className="focus-ring mt-5 w-full rounded-lg bg-ink px-4 py-4 font-black text-white shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            disabled={!canSubmit || loading}
            type="submit"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>

          {error ? <p className="mt-4 rounded-lg border-l-4 border-rosemark bg-[var(--paper)] p-3 text-sm text-rosemark">{error}</p> : null}

          <div className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4 text-sm leading-6 text-[var(--muted)]">
            Uploaded content is processed in memory by the API. Result metadata is cached briefly for permalink lookup.
          </div>
        </form>

        <section className="min-w-0">
          {loading ? (
            <div className="surface p-8">
              <p className="text-sm font-black uppercase text-cyanline">Layer Analysis</p>
              <h2 className="mt-2 text-2xl font-black">Running layered checks</h2>
              <div className="mt-6 space-y-4">
                {["Watermark", "Forensic", "Neural", "Fusion"].map((label, index) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm font-bold">
                      <span>{label}</span>
                      <span>{25 * (index + 1)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--paper)]">
                      <div className="h-full rounded-full bg-cyanline" style={{ width: `${25 * (index + 1)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : result ? (
            <ResultDashboard result={result} />
          ) : (
            <div className="grid gap-5">
              <div className="surface p-6 md:p-8">
                <p className="text-xs font-black uppercase tracking-wide text-cyanline">Ready</p>
                <h2 className="mt-2 text-3xl font-black">Verdict appears here.</h2>
                <p className="mt-3 leading-7 text-[var(--muted)]">
                  Run an analysis to get confidence, signal cards, probable sources, and modality-specific highlights.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {previewSignals.map((item) => (
                  <div className="soft-surface p-5" key={item.label}>
                    <p className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                      {modes.find((entry) => entry.id === mode)?.shorthand}
                    </p>
                    <h3 className="mt-2 font-black">{item.label}</h3>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.copy}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
