// A single visit card on the schedule screen.
// Shows enough context to know what you're walking into before you tap in.

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SERVICE_TYPE_LABELS, isOverdue } from "@/lib/schedule";
import { getSegmentLabel } from "@/lib/segments";
import type { ScheduledVisit } from "@/types/database";

interface VisitCardProps {
  visit: ScheduledVisit;
}

export function VisitCard({ visit }: VisitCardProps) {
  const { customer, service_type, scheduled_date, status } = visit;
  const isLogged = status === "completed";
  const overdue = !isLogged && isOverdue(new Date(scheduled_date));
  const isEmergency = service_type === "emergency_rescue";

  const dateLabel = new Date(scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <Link href={`/visit/${visit.id}/brief`}>
      <div className={`bg-white rounded-xl border p-4 active:bg-slate-50 transition-colors ${
        isLogged
          ? "border-green-200 opacity-75"
          : isEmergency
          ? "border-red-300 bg-red-50"
          : "border-slate-200"
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold truncate ${isLogged ? "text-slate-500" : "text-slate-900"}`}>
              {customer.customer_name}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">
              {customer.city} · {getSegmentLabel(customer.segment_hint)}
            </p>
            {customer.access_notes && !isLogged && (
              <p className="text-xs text-amber-700 mt-1 truncate">
                ⚠ {customer.access_notes}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {isLogged ? (
              <Badge className="bg-green-50 text-green-700 border-green-200">
                ✓ Logged
              </Badge>
            ) : (
              <Badge className={
                isEmergency
                  ? "bg-red-100 text-red-800 border-red-200"
                  : overdue
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }>
                {isEmergency ? "Emergency" : SERVICE_TYPE_LABELS[service_type]}
              </Badge>
            )}
            <span className="text-xs text-slate-400">{dateLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
