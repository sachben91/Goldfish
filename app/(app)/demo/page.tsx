"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompatibilityRequest {
  cart_skus: string[];
  customer_type: string;
  segment_hint: string | null;
  existing_skus: string[];
  tank_size_gallons: number;
  tank_age_months: number | null;
}

interface DeliveryRequest {
  zone: string;
  date: string;
  current_stop_count: number;
  temperature_flag: string;
  current_time?: string;
}

type CompatibilityResult =
  | { ok: true }
  | { ok: "friction"; concern: { code: string; flagged_sku: string; summary: string; customer_message: string; sales_talking_point: string } }
  | { ok: "review"; flagged_sku: string; rule: string; customer_message: string };

type DeliveryResult =
  | { available: true; windows: { label: string; cutoff_time: string }[] }
  | { available: false; reason: string; next_available_date: string; message: string };

// ─── Preset scenarios ─────────────────────────────────────────────────────────

const COMPAT_SCENARIOS: { label: string; description: string; request: CompatibilityRequest }[] = [
  {
    label: "Trigger + Shrimp",
    description: "Predator and shrimp in same cart → friction",
    request: {
      cart_skus: ["FISH-TRG-001", "INVT-SHR-001"],
      customer_type: "hobbyist",
      segment_hint: null,
      existing_skus: [],
      tank_size_gallons: 200,
      tank_age_months: 24,
    },
  },
  {
    label: "BTA — immature tank",
    description: "Bubble Tip Anemone in a 6-month-old tank → friction",
    request: {
      cart_skus: ["CORL-ANO-001"],
      customer_type: "hobbyist",
      segment_hint: null,
      existing_skus: [],
      tank_size_gallons: 75,
      tank_age_months: 6,
    },
  },
  {
    label: "Office + live coral",
    description: "Office display account ordering coral → friction",
    request: {
      cart_skus: ["CORL-ANO-001"],
      customer_type: "office_service",
      segment_hint: null,
      existing_skus: [],
      tank_size_gallons: 100,
      tank_age_months: 18,
    },
  },
  {
    label: "Beginner — trigger fish",
    description: "Beginner segment ordering a trigger → review hold",
    request: {
      cart_skus: ["FISH-TRG-001"],
      customer_type: "hobbyist",
      segment_hint: "beginner-learning",
      existing_skus: [],
      tank_size_gallons: 200,
      tank_age_months: 24,
    },
  },
  {
    label: "Clean order",
    description: "Yellow tang for a mature 100g tank → ok",
    request: {
      cart_skus: ["FISH-TNG-001"],
      customer_type: "hobbyist",
      segment_hint: "reef-vip",
      existing_skus: [],
      tank_size_gallons: 100,
      tank_age_months: 30,
    },
  },
];

const DELIVERY_SCENARIOS: { label: string; description: string; request: DeliveryRequest }[] = [
  {
    label: "South-belt — hot day",
    description: "Heat-sensitive zone + warm flag → blocked",
    request: {
      zone: "south-belt",
      date: new Date().toISOString().slice(0, 10),
      current_stop_count: 2,
      temperature_flag: "high_heat",
    },
  },
  {
    label: "Downtown — at capacity",
    description: "4 stops already booked → capacity block",
    request: {
      zone: "downtown",
      date: new Date().toISOString().slice(0, 10),
      current_stop_count: 4,
      temperature_flag: "stable",
    },
  },
  {
    label: "Cutoffs passed",
    description: "Stable zone but order time is 15:30 → no windows",
    request: {
      zone: "north-river",
      date: new Date().toISOString().slice(0, 10),
      current_stop_count: 2,
      temperature_flag: "stable",
      current_time: "15:30",
    },
  },
  {
    label: "Clean delivery",
    description: "North-river, stable, 1 stop, early morning → available",
    request: {
      zone: "north-river",
      date: new Date().toISOString().slice(0, 10),
      current_stop_count: 1,
      temperature_flag: "stable",
      current_time: "08:00",
    },
  },
];

// ─── Result display ───────────────────────────────────────────────────────────

function CompatResult({ result }: { result: CompatibilityResult | null }) {
  if (!result) return null;

  if (result.ok === true) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-semibold text-green-800 text-sm">Clear to proceed</span>
        </div>
        <p className="text-xs text-green-700">No compatibility concerns found for this order.</p>
      </div>
    );
  }

  if (result.ok === "friction") {
    const { concern } = result;
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="font-semibold text-amber-800 text-sm">Friction — acknowledgement required</span>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Code</p>
          <p className="text-xs text-amber-800 font-mono">{concern.code}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Customer sees</p>
          <p className="text-xs text-amber-800">{concern.customer_message}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Rep talking point</p>
          <p className="text-xs text-amber-800">{concern.sales_talking_point}</p>
        </div>
      </div>
    );
  }

  // review
  return (
    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="font-semibold text-red-800 text-sm">Review hold — livestock team</span>
      </div>
      <div>
        <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">SKU held</p>
        <p className="text-xs text-red-800 font-mono">{result.flagged_sku}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Customer message</p>
        <p className="text-xs text-red-800">{result.customer_message}</p>
      </div>
    </div>
  );
}

function DeliveryResultView({ result }: { result: DeliveryResult | null }) {
  if (!result) return null;

  if (result.available) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-semibold text-green-800 text-sm">Available — {result.windows.length} window{result.windows.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="space-y-1">
          {result.windows.map((w) => (
            <div key={w.label} className="flex justify-between text-xs text-green-800">
              <span>{w.label}</span>
              <span className="text-green-600">Cutoff {w.cutoff_time}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const reasonColors: Record<string, string> = {
    heat: "border-red-200 bg-red-50 text-red-800",
    capacity: "border-amber-200 bg-amber-50 text-amber-800",
    no_windows_remaining: "border-slate-200 bg-slate-50 text-slate-800",
  };
  const dotColors: Record<string, string> = {
    heat: "bg-red-500",
    capacity: "bg-amber-500",
    no_windows_remaining: "bg-slate-400",
  };
  const colorClass = reasonColors[result.reason] ?? reasonColors.capacity;
  const dotClass = dotColors[result.reason] ?? dotColors.capacity;

  return (
    <div className={`mt-4 rounded-lg border p-4 space-y-3 ${colorClass}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`} />
        <span className="font-semibold text-sm capitalize">
          Blocked — {result.reason.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-xs">{result.message}</p>
      <p className="text-xs opacity-75">Next available: {result.next_available_date}</p>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function CompatibilityPanel() {
  const [active, setActive] = useState<number | null>(null);
  const [result, setResult] = useState<CompatibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(index: number) {
    setActive(index);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compatibility/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(COMPAT_SCENARIOS[index].request),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Request failed");
      else setResult(data as CompatibilityResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-1">Compatibility check</h2>
      <p className="text-xs text-slate-500 mb-5">
        Runs cart SKUs against customer context. Returns ok / friction / review.
      </p>

      <div className="space-y-2">
        {COMPAT_SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => run(i)}
            disabled={loading}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
              active === i
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium text-slate-800">{scenario.label}</span>
            <span className="text-slate-400 ml-2 text-xs">{scenario.description}</span>
          </button>
        ))}
      </div>

      {loading && <p className="mt-4 text-xs text-slate-500">Running…</p>}
      {error && <p className="mt-4 text-xs text-red-500">{error}</p>}
      <CompatResult result={result} />

      {active !== null && !loading && result && (
        <details className="mt-4">
          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Show request payload</summary>
          <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto">
            {JSON.stringify(COMPAT_SCENARIOS[active].request, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function DeliveryWindowPanel() {
  const [active, setActive] = useState<number | null>(null);
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(index: number) {
    setActive(index);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/delivery-windows/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DELIVERY_SCENARIOS[index].request),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Request failed");
      else setResult(data as DeliveryResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="font-semibold text-slate-900 mb-1">Delivery window check</h2>
      <p className="text-xs text-slate-500 mb-5">
        Checks zone capacity and temperature conditions. Returns available windows or a block reason.
      </p>

      <div className="space-y-2">
        {DELIVERY_SCENARIOS.map((scenario, i) => (
          <button
            key={i}
            onClick={() => run(i)}
            disabled={loading}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
              active === i
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium text-slate-800">{scenario.label}</span>
            <span className="text-slate-400 ml-2 text-xs">{scenario.description}</span>
          </button>
        ))}
      </div>

      {loading && <p className="mt-4 text-xs text-slate-500">Running…</p>}
      {error && <p className="mt-4 text-xs text-red-500">{error}</p>}
      <DeliveryResultView result={result} />

      {active !== null && !loading && result && (
        <details className="mt-4">
          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Show request payload</summary>
          <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-auto">
            {JSON.stringify(DELIVERY_SCENARIOS[active].request, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">API demo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live calls to the compatibility and delivery window engines. Click a scenario to run it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompatibilityPanel />
        <DeliveryWindowPanel />
      </div>
    </div>
  );
}
