// Visit frequency rules.
// These are named constants — not magic numbers buried in queries —
// so any change here automatically flows through the whole app.

import type { ServiceType } from "@/types/database";

// How many days between scheduled visits for each service type.
export const VISIT_FREQUENCY_DAYS: Record<ServiceType, number> = {
  monthly_maintenance: 30,
  biweekly_maintenance: 14,
  emergency_rescue: 0,   // ad hoc — no automatic recurrence
};

// A visit is considered overdue if it's this many days past its scheduled date.
export const OVERDUE_GRACE_PERIOD_DAYS = 3;

// A followup is considered stale (surfaces to manager with red indicator)
// if it has been open this many days without resolution.
export const FOLLOWUP_STALE_DAYS = 60;

// Returns the next scheduled date for a given service type.
export function nextVisitDate(lastVisitDate: Date, serviceType: ServiceType): Date | null {
  const intervalDays = VISIT_FREQUENCY_DAYS[serviceType];
  if (intervalDays === 0) return null;  // emergency rescues are not auto-scheduled

  const next = new Date(lastVisitDate);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

// Returns true if a scheduled visit is overdue.
export function isOverdue(scheduledDate: Date): boolean {
  const today = new Date();
  const overdueFrom = new Date(scheduledDate);
  overdueFrom.setDate(overdueFrom.getDate() + OVERDUE_GRACE_PERIOD_DAYS);
  return today > overdueFrom;
}

// Returns true if an open followup has gone stale.
export function isFollowupStale(daysOpen: number): boolean {
  return daysOpen >= FOLLOWUP_STALE_DAYS;
}

// Human-readable label for each service type.
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  monthly_maintenance: "Monthly Maintenance",
  biweekly_maintenance: "Biweekly Maintenance",
  emergency_rescue: "Emergency Rescue",
};
