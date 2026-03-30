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
        const body = await res.json();
        setError(body.error ?? "Run failed");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
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
