// Open Followups — unresolved items from previous visits.
// Shown in red if any exist, so the technician can't miss them.
// Each followup can be marked resolved directly from this screen.

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isFollowupStale } from "@/lib/schedule";
import type { OpenFollowup } from "@/types/database";

interface OpenFollowupsSectionProps {
  followups: OpenFollowup[];
  visitId: string;
}

export function OpenFollowupsSection({ followups: initialFollowups, visitId }: OpenFollowupsSectionProps) {
  const [followups, setFollowups] = useState(initialFollowups);
  const [expanded, setExpanded] = useState(followups.length > 0);  // auto-expand if there are open items
  const [resolving, setResolving] = useState<string | null>(null);

  const supabase = createClient();

  async function resolveFollowup(followupId: string) {
    setResolving(followupId);
    const { error } = await supabase
      .from("service_visits")
      .update({
        followup_resolved: true,
        followup_resolved_at: new Date().toISOString(),
      })
      .eq("id", followupId);

    setResolving(null);
    if (!error) {
      setFollowups((prev) => prev.filter((f) => f.id !== followupId));
    }
  }

  const hasFollowups = followups.length > 0;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      hasFollowups ? "border-red-200" : "border-slate-200"
    }`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Open followups
          {hasFollowups && (
            <span className="ml-2 bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full font-normal normal-case">
              {followups.length}
            </span>
          )}
        </p>
        <span className="text-slate-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {!hasFollowups ? (
            <p className="px-4 py-4 text-sm text-slate-500">No open followups. Clean slate!</p>
          ) : (
            followups.map((followup) => {
              const stale = isFollowupStale(followup.days_open);
              return (
                <div key={followup.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">{followup.issue_found ?? followup.notes ?? "Unspecified issue"}</p>
                      <p className={`text-xs mt-1 ${stale ? "text-red-500" : "text-slate-400"}`}>
                        {followup.days_open} days open
                        {stale && " · overdue for resolution"}
                        {followup.technician_name && ` · flagged by ${followup.technician_name}`}
                      </p>
                    </div>
                    <button
                      onClick={() => resolveFollowup(followup.id)}
                      disabled={resolving === followup.id}
                      className="text-xs text-blue-600 font-medium py-1 px-2 rounded border border-blue-200 shrink-0 disabled:opacity-50"
                    >
                      {resolving === followup.id ? "…" : "Resolved"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
