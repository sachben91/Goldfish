// Nightly insights cron — GET /api/cron/insights
//
// Runs deriveRecurringPatterns for every account that has service visit
// history and writes results to the pattern_alerts table. The insights
// page reads from that table so results persist between runs.
//
// Schedule: 02:00 UTC daily (defined in vercel.json)
// Auth: Vercel sets CRON_SECRET automatically and sends it as
//       Authorization: Bearer <secret> on every cron invocation.
//       Requests without the correct header are rejected.
//
// Can also be triggered manually from the insights page for demos —
// the auth check applies in all cases.

import { createClient } from "@supabase/supabase-js";
import { deriveRecurringPatterns } from "@/lib/ops-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify this is coming from Vercel's cron runner (or a manual trigger
  // with the correct secret). CRON_SECRET is set automatically by Vercel.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role key — cron bypasses RLS to read all accounts
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startedAt = new Date().toISOString();

  // Record that the cron started
  const { data: cronRun } = await supabase
    .from("cron_runs")
    .insert({ job_name: "insights", started_at: startedAt, status: "running" })
    .select()
    .single();

  try {
    // Fetch all service visits with an issue recorded, grouped by customer.
    // Prefer logged_work_completed (new) then issue_found (legacy).
    const { data: visits, error: visitsError } = await supabase
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

    // Group observations by customer
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
      byCustomer.get(cid)!.observations.push({
        issue,
        seen_on: visit.service_date,
      });
    }

    // Run pattern detection for each account
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

    // Replace all pattern alerts — each run is a full refresh
    await supabase.from("pattern_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (alertRows.length > 0) {
      await supabase.from("pattern_alerts").insert(alertRows);
    }

    // Mark cron run complete
    if (cronRun) {
      await supabase
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
      await supabase
        .from("cron_runs")
        .update({ completed_at: new Date().toISOString(), status: "failed" })
        .eq("id", cronRun.id);
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
