"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunInsightsButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/run", { method: "POST" });
      if (!res.ok) {
        // Try JSON first, fall back to raw text so we always see what went wrong
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

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={handleRun}
        disabled={running}
        className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {running ? "Running…" : "Run now"}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
