"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunInsightsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/run", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        try {
          const body = JSON.parse(text);
          setError(`${res.status}: ${body.error ?? "Run failed"}`);
        } catch {
          setError(`${res.status}: ${text.slice(0, 120)}`);
        }
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/reset", { method: "POST" });
      if (!res.ok) {
        const body = await res.json();
        setError(`${res.status}: ${body.error ?? "Clear failed"}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setClearing(false);
    }
  }

  const busy = running || clearing;

  return (
    <div className="shrink-0 text-right">
      <div className="flex gap-2">
        <button
          onClick={handleClear}
          disabled={busy}
          className="text-xs bg-white border border-slate-200 text-slate-500 px-3 py-1.5 rounded-lg disabled:opacity-50 hover:border-slate-300"
        >
          {clearing ? "Clearing…" : "Clear"}
        </button>
        <button
          onClick={handleRun}
          disabled={busy}
          className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
        >
          {running ? "Running…" : "Run now"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
