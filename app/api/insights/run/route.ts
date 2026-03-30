// POST /api/insights/run
//
// Manual trigger for the insights cron — used by the "Run now" button
// on the insights page. Requires an authenticated Supabase session.
// The actual cron endpoint (/api/cron/insights) is separate and protected
// by CRON_SECRET (Vercel-only). This endpoint is for authenticated users.

import { createClient } from "@/lib/supabase/server";
import { deriveRecurringPatterns } from "@/lib/ops-queue";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to bypass RLS for reading all accounts
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();

  const { data: cronRun } = await service
    .from("cron_runs")
    .insert({ job_name: "insights", started_at: startedAt, status: "running" })
    .select()
    .single();

  try {
    const { data: visits, error: visitsError } = await service
      .from("service_visits")
      .select(`
        customer_id,
        service_date,
        issue_found,
        logged_work_completed,
        customers!inner(id, customer_name)
      `)
      .not("customer_id", "is", null);

    if (visitsError) throw new Error(visitsError.message);

    const byCustomer = new Map<string, {
      customer_name: string;
      observations: Array<{ issue: string; seen_on: string }>;
    }>();

    for (const visit of visits ?? []) {
      const issue = visit.logged_work_completed ?? visit.issue_found;
      if (!issue) continue;

      const cid = visit.customer_id as string;
      const customerName = (visit.customers as unknown as { customer_name: string }).customer_name;

      if (!byCustomer.has(cid)) {
        byCustomer.set(cid, { customer_name: customerName, observations: [] });
      }
      byCustomer.get(cid)!.observations.push({ issue, seen_on: visit.service_date });
    }

    const alertRows: Array<{
      customer_id: string;
      customer_name: string;
      issue: string;
      occurrences: number;
      last_seen: string;
      suggested_ops_action: string;
      generated_at: string;
    }> = [];

    const now = new Date().toISOString();

    for (const [customerId, { customer_name, observations }] of byCustomer) {
      const patterns = deriveRecurringPatterns(observations);
      for (const pattern of patterns) {
        alertRows.push({
          customer_id: customerId,
          customer_name,
          issue: pattern.issue,
          occurrences: pattern.occurrences,
          last_seen: pattern.last_seen,
          suggested_ops_action: pattern.suggested_ops_action,
          generated_at: now,
        });
      }
    }

    await service.from("pattern_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (alertRows.length > 0) {
      await service.from("pattern_alerts").insert(alertRows);
    }

    if (cronRun) {
      await service
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          accounts_processed: byCustomer.size,
          patterns_found: alertRows.length,
          status: "completed",
        })
        .eq("id", cronRun.id);
    }

    return Response.json({
      ok: true,
      accounts_processed: byCustomer.size,
      patterns_found: alertRows.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    if (cronRun) {
      await service
        .from("cron_runs")
        .update({ completed_at: new Date().toISOString(), status: "failed" })
        .eq("id", cronRun.id);
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
