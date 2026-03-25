// Upsell Recommendations — up to 3 products to mention during the visit.
// Each recommendation shows why it was suggested so the technician
// can frame the conversation naturally, not like a sales pitch.

"use client";

import { useState } from "react";
import type { UpsellRecommendation } from "@/types/database";

interface UpsellRecommendationsProps {
  recommendations: UpsellRecommendation[];
}

const CATEGORY_ICONS: Record<string, string> = {
  fish: "🐠",
  coral: "🪸",
  invertebrate: "🦐",
  equipment: "⚙️",
  service: "🔧",
  bundle: "📦",
};

export function UpsellRecommendations({ recommendations }: UpsellRecommendationsProps) {
  const [expanded, setExpanded] = useState(recommendations.length > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Recommend today
          {recommendations.length > 0 && (
            <span className="ml-2 bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded-full font-normal normal-case border border-blue-100">
              {recommendations.length}
            </span>
          )}
        </p>
        <span className="text-slate-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {recommendations.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              No recommendations — customer has everything relevant for their tank.
            </p>
          ) : (
            recommendations.map((rec) => (
              <div key={rec.sku} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0 mt-0.5">
                    {CATEGORY_ICONS[rec.category] ?? "📦"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{rec.product_name}</p>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rec.pitch}</p>
                    <p className="text-xs text-slate-400 mt-1">{rec.sku}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
