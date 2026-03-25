// Post-Visit Log page.
// Fetches the visit schedule row server-side to determine whether the visit
// has already been logged. Passes data down to the client form component.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { VisitLogForm } from "@/components/log/VisitLogForm";
import type { ServiceVisit } from "@/types/database";

interface LogPageProps {
  params: Promise<{ visitId: string }>;
}

export default async function VisitLogPage({ params }: LogPageProps) {
  const { visitId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: schedule } = await supabase
    .from("visit_schedule")
    .select("*, customer:customers(customer_name)")
    .eq("id", visitId)
    .single();

  if (!schedule) notFound();

  // If already logged, fetch the linked service visit to show in read-only view
  let loggedVisit: ServiceVisit | null = null;
  if (schedule.status === "completed" && schedule.visit_id) {
    const { data } = await supabase
      .from("service_visits")
      .select("*")
      .eq("id", schedule.visit_id)
      .single();
    loggedVisit = data as ServiceVisit | null;
  }

  return (
    <VisitLogForm
      visitId={visitId}
      schedule={schedule}
      loggedVisit={loggedVisit}
    />
  );
}
