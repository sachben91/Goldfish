// Recurring Issues — shows patterns across the account's full visit history.
// If the same problem has appeared 3+ times, the technician should know before walking in.

"use client";

import { useState } from "react";
import { getIssueSeverity, SEVERITY_STYLES } from "@/lib/issues";
import type { CustomerIssuePattern } from "@/types/database";

interface RecurringIssuesProps {
  patterns: CustomerIssuePattern[];
}

export function RecurringIssues({ patterns }: RecurringIssuesProps) {
  const [expanded, setExpanded] = useState(false);

  const hasPatterns = patterns.length > 0;
  const topIssue = patterns[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Recurring issues
          {hasPatterns && (
            <span className="ml-2 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full font-normal normal-case">
              {patterns.length}
            </span>
          )}
        </p>
        <span className="text-slate-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Always show the top issue as a preview even when collapsed */}
      {!expanded && topIssue && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700 truncate">{topIssue.issue_found}</p>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border shrink-0 ${
              SEVERITY_STYLES[getIssueSeverity(topIssue.issue_found)].badge
            }`}>
              {topIssue.occurrence_count}×
            </span>
          </div>
        </div>
      )}

      {expanded && (
        <div className="divide-y divide-slate-50">
          {!hasPatterns ? (
            <p className="px-4 py-4 text-sm text-slate-500">No recurring issues found.</p>
          ) : (
            patterns.map((pattern) => {
              const severity = getIssueSeverity(pattern.issue_found);
              return (
                <div key={pattern.issue_found} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border shrink-0 ${SEVERITY_STYLES[severity].badge}`}>
                        {severity}
                      </span>
                      <p className="text-sm text-slate-800">{pattern.issue_found}</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Last seen {new Date(pattern.last_seen + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-500 shrink-0">{pattern.occurrence_count}×</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
