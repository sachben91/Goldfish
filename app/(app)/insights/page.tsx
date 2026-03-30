// Insights — output of the nightly cron.
//
// Shows recurring issue patterns flagged across all accounts.
// Results are written by the cron job; this page just reads them.
// "Run now" triggers the cron manually — useful for demos and for
// checking the current state without waiting for the next scheduled run.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RunInsightsButton } from "./RunInsightsButton";

export default async function InsightsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: alerts },
    { data: lastRun },
  ] = await Promise.all([
    supabase
      .from("pattern_alerts")
      .select("*")
      .order("occurrences", { ascending: false }),

    supabase
      .from("cron_runs")
      .select("*")
      .eq("job_name", "insights")
      .order("started_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  // Group alerts by customer for display
  const byCustomer = new Map<string, {
    customer_name: string;
    alerts: typeof alerts;
  }>();

  for (const alert of alerts ?? []) {
    if (!byCustomer.has(alert.customer_id)) {
      byCustomer.set(alert.customer_id, {
        customer_name: alert.customer_name,
        alerts: [],
      });
    }
    byCustomer.get(alert.customer_id)!.alerts!.push(alert);
  }

  const accountsWithAlerts = [...byCustomer.values()].sort(
    (a, b) => (b.alerts?.length ?? 0) - (a.alerts?.length ?? 0)
  );

  const totalPatterns = alerts?.length ?? 0;
  const totalAccounts = byCustomer.size;

  return (
    <div className="max-w-lg mx-auto pb-32">

      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">Account insights</p>
            <p className="text-xs text-slate-500">Recurring patterns across all accounts</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Last run status + manual trigger */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            {lastRun ? (
              <>
                <p className="text-xs text-slate-400">Last run</p>
                <p className="text-sm text-slate-700">
                  {new Date(lastRun.started_at).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}
                  {lastRun.status === "completed" && lastRun.patterns_found !== null && (
                    <span className="ml-2 text-slate-400 text-xs">
                      · {lastRun.patterns_found} patterns across {lastRun.accounts_processed} accounts
                    </span>
                  )}
                  {lastRun.status === "failed" && (
                    <span className="ml-2 text-red-500 text-xs">· failed</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No runs yet — trigger below to generate first results.</p>
            )}
          </div>
          <RunInsightsButton />
        </div>

        {/* Summary counts */}
        {totalPatterns > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-2xl font-bold text-amber-900">{totalAccounts}</p>
              <p className="text-xs text-amber-700 mt-0.5">Accounts with patterns</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-2xl font-bold text-amber-900">{totalPatterns}</p>
              <p className="text-xs text-amber-700 mt-0.5">Active recurring issues</p>
            </div>
          </div>
        )}

        {/* No data state */}
        {totalPatterns === 0 && lastRun?.status === "completed" && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4">
            <p className="text-sm font-medium text-green-800">No recurring patterns found</p>
            <p className="text-xs text-green-700 mt-1">All accounts look clean — no issues appearing 3+ times in the last 6 months.</p>
          </div>
        )}

        {/* Pattern alerts by account */}
        {accountsWithAlerts.map(({ customer_name, alerts: accountAlerts }) => (
          <div key={customer_name} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{customer_name}</p>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {accountAlerts?.length} pattern{(accountAlerts?.length ?? 0) > 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {accountAlerts?.map((alert) => (
                <div key={alert.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 block" />
                    <div>
                      <p className="text-sm text-slate-800">{alert.issue}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {alert.occurrences}× in last 6 months · last seen{" "}
                        {new Date(alert.last_seen + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short", day: "numeric"
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="ml-3.5 bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-600">{alert.suggested_ops_action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}
