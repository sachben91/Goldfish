// Open Followups — unresolved items from previous visits.
//
// Follow-ups are not one thing. The original Mark resolved button collapsed
// three distinct situations into a single action:
//   failure         — something went wrong, needs fixing today
//   planned_continuation — multi-stop job where today was always the return trip
//   pending_office  — waiting on approval, invoice, or scheduling — tech doesn't own it
//
// Dana's concern: "field-resolved and fully-resolved are not the same thing."
// If the tech marks resolved when they've only done their part, office loses the
// thread and the pattern.
//
// The new flow: tech logs what they did on this follow-up in the visit log
// (under next step + owner). The follow-up stays open until office confirms
// the full loop is closed. Tech can add a note here if they handled their part today.

"use client";

import { useState } from "react";
import { isFollowupStale } from "@/lib/schedule";
import type { OpenFollowup } from "@/types/database";

interface OpenFollowupsSectionProps {
  followups: OpenFollowup[];
  visitId: string;
}

const KIND_LABELS: Record<string, { label: string; colour: string }> = {
  failure:              { label: "Needs fix",    colour: "bg-red-100 text-red-700" },
  planned_continuation: { label: "Planned",      colour: "bg-blue-50 text-blue-700" },
  pending_office:       { label: "Office queue", colour: "bg-amber-50 text-amber-700" },
  customer_behavior:    { label: "Customer",     colour: "bg-slate-100 text-slate-600" },
};

function inferKind(followup: OpenFollowup): string {
  // Until the database has a followup_kind column, infer from available signals.
  // This is a best-effort classification — the real fix is capturing kind at log time.
  const text = [followup.issue_found, followup.notes].join(" ").toLowerCase();
  if (text.includes("feeding") || text.includes("staff") || text.includes("access")) {
    return "customer_behavior";
  }
  if (text.includes("approval") || text.includes("schedule") || text.includes("office") || text.includes("invoice")) {
    return "pending_office";
  }
  if (text.includes("part") || text.includes("return") || text.includes("step 2") || text.includes("next visit")) {
    return "planned_continuation";
  }
  return "failure";
}

export function OpenFollowupsSection({ followups: initialFollowups }: OpenFollowupsSectionProps) {
  const [expanded, setExpanded] = useState(initialFollowups.length > 0);

  const hasFollowups = initialFollowups.length > 0;

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
              {initialFollowups.length}
            </span>
          )}
        </p>
        <span className="text-slate-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {!hasFollowups ? (
            <p className="px-4 py-4 text-sm text-slate-500">No open followups. Clean slate.</p>
          ) : (
            <>
              {initialFollowups.map((followup) => {
                const stale = isFollowupStale(followup.days_open);
                const kind = inferKind(followup);
                const kindMeta = KIND_LABELS[kind] ?? KIND_LABELS.failure;

                return (
                  <div key={followup.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${kindMeta.colour}`}>
                            {kindMeta.label}
                          </span>
                          <span className={`text-xs ${stale ? "text-red-500" : "text-slate-400"}`}>
                            {followup.days_open}d open{stale ? " · overdue" : ""}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800">
                          {followup.issue_found ?? followup.notes ?? "Unspecified"}
                        </p>
                        {followup.technician_name && (
                          <p className="text-xs text-slate-400 mt-0.5">Flagged by {followup.technician_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Context note — no close button.
                        Follow-ups are closed by office once the full loop is confirmed.
                        If the tech handled their part today, they log it in the visit log
                        under "what still needs to happen" with owner = office. */}
                    {kind === "pending_office" && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                        This is in the office queue — log your visit if you addressed your part today.
                      </p>
                    )}
                    {kind === "planned_continuation" && (
                      <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">
                        Planned work — log completion in your visit log when done.
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="px-4 py-3">
                <p className="text-xs text-slate-400">
                  Follow-ups are cleared by office once the full loop is closed — invoice confirmed, return visit completed, or customer resolved. Log your part in the visit log.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
