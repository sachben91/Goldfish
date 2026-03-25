// Last Visit Summary — what happened the last time someone was here.
// Shows the date in relative terms ("23 days ago") so the technician
// immediately knows if an account is overdue.

import { Badge } from "@/components/ui/badge";
import { SERVICE_TYPE_LABELS } from "@/lib/schedule";
import { getIssueSeverity, SEVERITY_STYLES } from "@/lib/issues";
import type { ServiceVisit } from "@/types/database";
import { formatDistanceToNow } from "date-fns";

interface LastVisitSummaryProps {
  lastVisit: (ServiceVisit & { technician: { name: string } | null }) | null;
}

export function LastVisitSummary({ lastVisit }: LastVisitSummaryProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Last visit</p>
      </div>

      <div className="px-4 py-4">
        {lastVisit === null ? (
          <p className="text-sm text-slate-500">No previous visits on record.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">
                  {formatDistanceToNow(new Date(lastVisit.service_date + "T00:00:00"), { addSuffix: true })}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(lastVisit.service_date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric"
                  })}
                  {lastVisit.technician && ` · ${lastVisit.technician.name}`}
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                {SERVICE_TYPE_LABELS[lastVisit.service_type]}
              </Badge>
            </div>

            {lastVisit.issue_found && (
              <div className="space-y-1">
                <p className="text-xs text-slate-400">Issue found</p>
                <div className="flex items-start gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${
                    SEVERITY_STYLES[getIssueSeverity(lastVisit.issue_found)].badge
                  }`}>
                    {getIssueSeverity(lastVisit.issue_found)}
                  </span>
                  <p className="text-sm text-slate-800">{lastVisit.issue_found}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${lastVisit.followup_required ? "bg-amber-400" : "bg-slate-200"}`} />
                <p className="text-xs text-slate-600">
                  {lastVisit.followup_required ? "Followup required" : "No followup needed"}
                </p>
              </div>
              {lastVisit.followup_required && (
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${lastVisit.followup_resolved ? "bg-green-400" : "bg-red-400"}`} />
                  <p className="text-xs text-slate-600">
                    {lastVisit.followup_resolved ? "Resolved" : "Still open"}
                  </p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
