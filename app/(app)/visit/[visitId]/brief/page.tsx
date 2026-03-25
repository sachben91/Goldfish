// Pre-Visit Brief — the core screen of the app.
// A technician reads this in the parking lot before walking in.
//
// All data is fetched server-side so it's ready on first paint,
// even on a weak signal. Five queries run in parallel.

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccountSnapshot } from "@/components/brief/AccountSnapshot";
import { LastVisitSummary } from "@/components/brief/LastVisitSummary";
import { RecurringIssues } from "@/components/brief/RecurringIssues";
import { OpenFollowupsSection } from "@/components/brief/OpenFollowupsSection";
import { TankInventory } from "@/components/brief/TankInventory";
import { UpsellRecommendations } from "@/components/brief/UpsellRecommendations";
import { getUpsellRecommendations } from "@/lib/upsell";
import type { CatalogItem, Order, CustomerIssuePattern, OpenFollowup } from "@/types/database";

interface BriefPageProps {
  params: Promise<{ visitId: string }>;
}

export default async function BriefPage({ params }: BriefPageProps) {
  const { visitId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch the scheduled visit with customer info
  const { data: scheduledVisit } = await supabase
    .from("visit_schedule")
    .select(`*, customer:customers(*)`)
    .eq("id", visitId)
    .single();

  if (!scheduledVisit) notFound();

  const customerId = scheduledVisit.customer.id;

  // All five data fetches run in parallel — faster on weak connections
  const [
    { data: lastVisits },
    { data: issuePatterns },
    { data: openFollowups },
    { data: recentOrders },
    { data: catalogItems },
  ] = await Promise.all([
    // Last 5 visits for this account, most recent first (past visits only)
    supabase
      .from("service_visits")
      .select("*, technician:technicians(name)")
      .eq("customer_id", customerId)
      .lte("service_date", new Date().toISOString().split("T")[0])
      .order("service_date", { ascending: false })
      .limit(5),

    // Recurring issue patterns for this account
    supabase
      .from("customer_issue_patterns")
      .select("*")
      .eq("customer_id", customerId)
      .order("occurrence_count", { ascending: false })
      .limit(8),

    // Open (unresolved) followups for this account
    supabase
      .from("open_followups")
      .select("*")
      .eq("customer_id", customerId)
      .order("service_date", { ascending: true }),

    // Last 12 months of orders — what's in the tank
    supabase
      .from("orders")
      .select("*, catalog:catalog(product_name, category)")
      .eq("customer_id", customerId)
      .gte("order_date", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("order_date", { ascending: false })
      .limit(20),

    // Full catalog for the upsell engine
    supabase.from("catalog").select("*"),
  ]);

  const upsellRecommendations = getUpsellRecommendations({
    customer: scheduledVisit.customer,
    recentOrders: (recentOrders ?? []) as Order[],
    catalogItems: (catalogItems ?? []) as CatalogItem[],
    issuePatterns: (issuePatterns ?? []) as CustomerIssuePattern[],
  });

  const lastVisit = lastVisits?.[0] ?? null;

  return (
    <div className="max-w-lg mx-auto pb-32">

      {/* Top nav */}
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-lg">←</Link>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 truncate">{scheduledVisit.customer.customer_name}</p>
            <p className="text-xs text-slate-500">Pre-visit brief</p>
          </div>
          <span className="text-xs text-slate-400">
            {new Date(scheduledVisit.scheduled_date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short", day: "numeric"
            })}
          </span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* Section A: Account snapshot — always visible, access notes prominent */}
        <AccountSnapshot customer={scheduledVisit.customer} />

        {/* Section B: Last visit */}
        <LastVisitSummary lastVisit={lastVisit} />

        {/* Section C: Recurring issues */}
        <RecurringIssues patterns={(issuePatterns ?? []) as CustomerIssuePattern[]} />

        {/* Section D: Open followups */}
        <OpenFollowupsSection
          followups={(openFollowups ?? []) as OpenFollowup[]}
          visitId={visitId}
        />

        {/* Section E: What's in their tank */}
        <TankInventory orders={recentOrders ?? []} />

        {/* Section F: Upsell recommendations */}
        <UpsellRecommendations recommendations={upsellRecommendations} />

      </div>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-4">
        {scheduledVisit.status === "completed" ? (
          <Link href={`/visit/${visitId}/log`}>
            <button className="w-full bg-green-600 text-white py-3.5 rounded-xl font-semibold text-base">
              ✓ Visit logged — view notes
            </button>
          </Link>
        ) : (
          <Link href={`/visit/${visitId}/log`}>
            <button className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-base">
              Log this visit
            </button>
          </Link>
        )}
      </div>

    </div>
  );
}
