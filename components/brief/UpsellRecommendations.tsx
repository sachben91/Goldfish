// Opportunities for office — products or services worth quoting for this account.
// Shown as context inside the visit, not as a to-do in the parking lot.
//
// The tech's job is to notice and flag. If they see something that matches
// one of these during the visit, they can flag it in the visit log and office
// handles the quote and approval conversation. The tech does not pitch on site
// for office accounts — Dana noted that anything changing spend needs office
// to own the approval loop, not the tech in the parking lot.

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
          Opportunities for office
          {recommendations.length > 0 && (
            <span className="ml-2 bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full font-normal normal-case">
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
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rec.reason}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {rec.sku}
                      <span className="ml-2 text-slate-300">·</span>
                      <span className="ml-2 text-slate-400">If you notice this on site, flag it in your log — office will follow up</span>
                    </p>
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
