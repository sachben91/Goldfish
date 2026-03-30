// Insights — output of the nightly cron + ops/sales intelligence.
//
// Shows recurring issue patterns with severity, upsell opportunities
// per account, and last run metadata. Results are written by the cron;
// this page reads them and augments with live upsell engine output.
// "Run now" triggers the cron manually for demos and ad-hoc checks.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RunInsightsButton } from "./RunInsightsButton";
import { getIssueSeverity } from "@/lib/issues";
import { getUpsellRecommendations } from "@/lib/upsell";
import type { Customer, Order, CatalogItem, CustomerIssuePattern } from "@/types/database";

const SEVERITY_STYLES = {
  critical: "bg-red-100 text-red-700 border-red-200",
  moderate: "bg-amber-100 text-amber-700 border-amber-200",
  routine:  "bg-slate-100 text-slate-600 border-slate-200",
};

const CATEGORY_LABEL: Record<string, string> = {
  fish: "Fish",
  coral: "Coral",
  invertebrate: "Invertebrate",
  equipment: "Equipment",
  service: "Service",
  bundle: "Bundle",
};

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Service role for reading all accounts
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: alerts },
    { data: lastRun },
    { data: catalogItems },
  ] = await Promise.all([
    service
      .from("pattern_alerts")
      .select("*")
      .order("occurrences", { ascending: false }),

    service
      .from("cron_runs")
      .select("*")
      .eq("job_name", "insights")
      .order("started_at", { ascending: false })
      .limit(1)
      .single(),

    service.from("catalog").select("*"),
  ]);

  // Group alerts by customer
  const byCustomer = new Map<string, {
    customer_name: string;
    customer_id: string;
    alerts: typeof alerts;
  }>();

  for (const alert of alerts ?? []) {
    if (!byCustomer.has(alert.customer_id)) {
      byCustomer.set(alert.customer_id, {
        customer_name: alert.customer_name,
        customer_id: alert.customer_id,
        alerts: [],
      });
    }
    byCustomer.get(alert.customer_id)!.alerts!.push(alert);
  }

  const customerIds = [...byCustomer.keys()];

  // Fetch customer records and recent orders for upsell engine — only for
  // accounts that have pattern alerts (keeps the query small)
  const [{ data: customers }, { data: recentOrders }, { data: issuePatterns }] =
    customerIds.length > 0
      ? await Promise.all([
          service.from("customers").select("*").in("id", customerIds),
          service
            .from("orders")
            .select("*")
            .in("customer_id", customerIds)
            .gte("order_date", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
          service
            .from("customer_issue_patterns")
            .select("*")
            .in("customer_id", customerIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  // Index by customer_id for fast lookup
  const customerById = new Map((customers ?? []).map((c: Customer) => [c.id, c]));
  const ordersByCustomer = new Map<string, Order[]>();
  for (const order of recentOrders ?? []) {
    const o = order as Order;
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, []);
    ordersByCustomer.get(o.customer_id)!.push(o);
  }
  const patternsByCustomer = new Map<string, CustomerIssuePattern[]>();
  for (const p of issuePatterns ?? []) {
    const pattern = p as CustomerIssuePattern;
    if (!patternsByCustomer.has(pattern.customer_id)) patternsByCustomer.set(pattern.customer_id, []);
    patternsByCustomer.get(pattern.customer_id)!.push(pattern);
  }

  // Compute upsell recommendations for each account with alerts
  const upsellByCustomer = new Map<string, ReturnType<typeof getUpsellRecommendations>>();
  for (const [customerId, { customer_name }] of byCustomer) {
    const customer = customerById.get(customerId);
    if (!customer) continue;
    const recs = getUpsellRecommendations({
      customer,
      recentOrders: ordersByCustomer.get(customerId) ?? [],
      catalogItems: (catalogItems ?? []) as CatalogItem[],
      issuePatterns: patternsByCustomer.get(customerId) ?? [],
    });
    if (recs.length > 0) upsellByCustomer.set(customerId, recs);
  }

  const accountsWithAlerts = [...byCustomer.values()].sort(
    (a, b) => (b.alerts?.length ?? 0) - (a.alerts?.length ?? 0)
  );

  const totalPatterns = alerts?.length ?? 0;
  const totalAccounts = byCustomer.size;
  const totalUpsellAccounts = upsellByCustomer.size;

  return (
    <div className="max-w-lg mx-auto pb-32">

      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">Account insights</p>
            <p className="text-xs text-slate-500">Patterns · upsell opportunities · ops actions</p>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
              <p className="text-2xl font-bold text-amber-900">{totalAccounts}</p>
              <p className="text-xs text-amber-700 mt-0.5">Accounts with patterns</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
              <p className="text-2xl font-bold text-amber-900">{totalPatterns}</p>
              <p className="text-xs text-amber-700 mt-0.5">Recurring issues</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3">
              <p className="text-2xl font-bold text-blue-900">{totalUpsellAccounts}</p>
              <p className="text-xs text-blue-700 mt-0.5">Upsell opportunities</p>
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

        {/* Pattern alerts + upsell by account */}
        {accountsWithAlerts.map(({ customer_name, customer_id, alerts: accountAlerts }) => {
          const upsellRecs = upsellByCustomer.get(customer_id) ?? [];
          return (
            <div key={customer_id} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{customer_name}</p>
                <div className="flex items-center gap-2">
                  {upsellRecs.length > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {upsellRecs.length} opportunity{upsellRecs.length > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {accountAlerts?.length} pattern{(accountAlerts?.length ?? 0) > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Pattern alerts with severity badges */}
              <div className="divide-y divide-slate-50">
                {accountAlerts?.map((alert) => {
                  const severity = getIssueSeverity(alert.issue);
                  return (
                    <div key={alert.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500 block" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-slate-800">{alert.issue}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SEVERITY_STYLES[severity]}`}>
                              {severity}
                            </span>
                          </div>
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
                  );
                })}
              </div>

              {/* Upsell opportunities for this account */}
              {upsellRecs.length > 0 && (
                <div className="border-t border-blue-100 bg-blue-50">
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold text-blue-600 uppercase tracking-wide">Upsell opportunities</p>
                  <div className="divide-y divide-blue-100">
                    {upsellRecs.map((rec) => (
                      <div key={rec.sku} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-800">{rec.product_name}</p>
                              <span className="text-xs text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                {CATEGORY_LABEL[rec.category] ?? rec.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">{rec.reason}</p>
                            <p className="text-xs text-blue-600 mt-1 italic">"{rec.pitch}"</p>
                          </div>
                          <p className="text-xs text-slate-400 shrink-0 font-mono">{rec.sku}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>
    </div>
  );
}
