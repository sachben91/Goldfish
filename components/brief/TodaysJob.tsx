// Today's Job — always visible, always first after access notes.
//
// Answers the question Luis asked: "what matters before I walk in?"
// A tech standing outside in the parking lot needs to know in five seconds:
//   1. What kind of visit is this?
//   2. Is there something specific I need to fix or finish today?
//   3. Or is this a clean routine stop with nothing outstanding?
//
// The service type and any active follow-up work (failures to fix,
// planned continuations) are surfaced here. The rest is in More context.

import type { OpenFollowup, ServiceType } from "@/types/database";

interface TodaysJobProps {
  serviceType: ServiceType;
  openFollowups: OpenFollowup[];
  notes: string | null;
}

const SERVICE_TYPE_LABELS: Record<ServiceType, { label: string; style: string }> = {
  monthly_maintenance:    { label: "Monthly maintenance",    style: "bg-blue-50 text-blue-700 border-blue-200" },
  biweekly_maintenance:   { label: "Biweekly maintenance",   style: "bg-blue-50 text-blue-700 border-blue-200" },
  emergency_rescue:       { label: "Emergency rescue",       style: "bg-red-50 text-red-700 border-red-200" },
};

// Mirror of inferKind in OpenFollowupsSection — determines what kind of
// follow-up work this is so we can surface the right action to the tech.
function inferKind(followup: OpenFollowup): "failure" | "planned_continuation" | "pending_office" | "customer_behavior" {
  const text = [followup.issue_found, followup.notes].join(" ").toLowerCase();
  if (text.includes("feeding") || text.includes("staff") || text.includes("access")) return "customer_behavior";
  if (text.includes("approval") || text.includes("schedule") || text.includes("office") || text.includes("invoice")) return "pending_office";
  if (text.includes("part") || text.includes("return") || text.includes("step 2") || text.includes("next visit")) return "planned_continuation";
  return "failure";
}

export function TodaysJob({ serviceType, openFollowups, notes }: TodaysJobProps) {
  const { label, style } = SERVICE_TYPE_LABELS[serviceType] ?? SERVICE_TYPE_LABELS.monthly_maintenance;

  // Separate follow-ups by what the tech can actually act on today
  const toFix = openFollowups.filter((f) => inferKind(f) === "failure");
  const plannedWork = openFollowups.filter((f) => inferKind(f) === "planned_continuation");
  const isRoutine = toFix.length === 0 && plannedWork.length === 0;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      serviceType === "emergency_rescue" ? "border-red-200" : "border-slate-200"
    }`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Today's job</p>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style}`}>
          {label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-2.5">

        {/* Active failures — needs fixing today */}
        {toFix.map((f) => (
          <div key={f.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-red-100 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {f.issue_found ?? f.notes ?? "Issue to fix"}
              </p>
              <p className="text-xs text-red-600 mt-0.5">Needs fixing today</p>
            </div>
          </div>
        ))}

        {/* Planned continuations — expected work, not a miss */}
        {plannedWork.map((f) => (
          <div key={f.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 block" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {f.issue_found ?? f.notes ?? "Planned work"}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">Continuing planned work</p>
            </div>
          </div>
        ))}

        {/* Routine — nothing specific outstanding */}
        {isRoutine && (
          <p className="text-sm text-slate-600">
            Routine visit — no outstanding issues. Standard maintenance only.
          </p>
        )}

        {/* Scheduling notes from office */}
        {notes && (
          <p className="text-xs text-slate-500 border-t border-slate-100 pt-2.5">{notes}</p>
        )}

      </div>
    </div>
  );
}
