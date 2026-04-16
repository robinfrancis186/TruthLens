"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ResultDashboard } from "../../../components/result-dashboard";
import { getResult } from "../../../lib/api";
import type { AnalysisResponse } from "../../../lib/types";

export default function ResultPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getResult(requestId)
      .then((nextResult) => {
        if (active) {
          setResult(nextResult);
          setError(null);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Result not found.");
          setResult(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 md:px-8">
      <div className="mb-5 flex flex-col gap-3 border-b border-[var(--line)] pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-cyanline">TruthLens Result</p>
          <h1 className="mt-2 text-3xl font-bold">Analysis report</h1>
        </div>
        <Link className="focus-ring inline-flex border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold" href="/">
          New analysis
        </Link>
      </div>

      {loading ? <p className="border border-[var(--line)] bg-white p-6">Loading result...</p> : null}
      {error ? (
        <section className="border border-[var(--line)] bg-white p-6">
          <h2 className="text-xl font-semibold">Result unavailable.</h2>
          <p className="mt-3 text-[var(--muted)]">{error}</p>
          <p className="mt-3 text-sm text-[var(--muted)]">MVP results live in the API memory cache and expire after the configured TTL or server restart.</p>
        </section>
      ) : null}
      {result ? <ResultDashboard result={result} /> : null}
    </main>
  );
}
