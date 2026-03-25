// Today's Schedule — the first screen a technician sees after logging in.
// Lists their visits for today and this week, sorted by urgency then route.
// Each card shows a summary and links to the full pre-visit brief.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { VisitCard } from "@/components/schedule/VisitCard";
import { SERVICE_TYPE_LABELS, isOverdue } from "@/lib/schedule";
import type { ScheduledVisit } from "@/types/database";
import { redirect } from "next/navigation";

export default async function SchedulePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Match the logged-in user to a technician by email.
  // Falls back to showing all visits if no match (e.g. during initial testing).
  const { data: technician } = await supabase
    .from("technicians")
    .select("id, name")
    .eq("email", user!.email)
    .maybeSingle();

  const today = new Date().toISOString().split("T")[0];
  const oneWeekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const visitsQuery = supabase
    .from("visit_schedule")
    .select(`
      *,
      customer:customers(id, customer_id, customer_name, city, segment_hint, access_notes, customer_type),
      technician:technicians(id, name)
    `)
    .eq("status", "scheduled")
    .gte("scheduled_date", today)
    .lte("scheduled_date", oneWeekOut)
    .order("scheduled_date", { ascending: true });

  // If we matched a technician, filter to their visits only
  if (technician) visitsQuery.eq("technician_id", technician.id);

  const { data: visits } = await visitsQuery;

  const todayVisits = (visits ?? []).filter((v) => v.scheduled_date === today) as ScheduledVisit[];
  const upcomingVisits = (visits ?? []).filter((v) => v.scheduled_date !== today) as ScheduledVisit[];

  // Emergency rescues always appear first
  const sortByUrgency = (a: ScheduledVisit, b: ScheduledVisit) => {
    if (a.service_type === "emergency_rescue") return -1;
    if (b.service_type === "emergency_rescue") return 1;
    return a.customer.city?.localeCompare(b.customer.city ?? "") ?? 0;
  };

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">

      {/* Header */}
      <div className="pt-10 pb-6">
        <p className="text-slate-500 text-sm">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold mt-1">
          {technician ? `Hi, ${technician.name.split(" ")[0]}` : "Your Schedule"}
        </h1>
      </div>

      {/* Today */}
      <section>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Today — {todayVisits.length} {todayVisits.length === 1 ? "visit" : "visits"}
        </h2>
        {todayVisits.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">No visits scheduled for today.</p>
        ) : (
          <div className="space-y-3">
            {[...todayVisits].sort(sortByUrgency).map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        )}
      </section>

      {/* This week */}
      {upcomingVisits.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            This week
          </h2>
          <div className="space-y-3">
            {[...upcomingVisits].sort(sortByUrgency).map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
