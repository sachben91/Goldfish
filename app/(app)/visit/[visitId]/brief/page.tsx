// Pre-Visit Brief — the core screen of the app.
// A technician reads this in the parking lot before walking in.
//
// Structure:
//   ALWAYS VISIBLE  — access notes, open followups, last visit
//   MORE CONTEXT    — recurring issues, tank inventory, opportunities for office
//
// The always-visible section is what matters before the tech walks in.
// Everything else is available one tap away but doesn't compete for attention.
// Luis said he'd ignore inventory and recommendations in the parking lot —
// so we don't make him scan past them to find what he actually needs.

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
import { TodaysJob } from "@/components/brief/TodaysJob";
import { getUpsellRecommendations } from "@/lib/upsell";
import type { CatalogItem, Order, CustomerIssuePattern, OpenFollowup, UpsellRecommendation } from "@/types/database";

// MoreContext — collapsible section for everything that is useful inside
// the visit but not needed in the parking lot.
function MoreContext({
  issuePatterns,
  recentOrders,
  upsellRecommendations,
}: {
  issuePatterns: CustomerIssuePattern[];
  recentOrders: (Order & { catalog: { product_name: string; category: string } | null })[];
  upsellRecommendations: UpsellRecommendation[];
}) {
  // Server component can't use useState — render as a details/summary element.
  // Native HTML collapsible: no JS needed, works on weak connections.
  return (
    <details className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none border-b border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          More context
          <span className="ml-2 text-slate-300 font-normal normal-case">recurring issues · tank inventory · opportunities</span>
        </p>
        <span className="text-slate-300 text-sm">▼</span>
      </summary>
      <div className="divide-y divide-slate-50">
        <div className="p-3">
          <RecurringIssues patterns={issuePatterns} />
        </div>
        <div className="p-3">
          <TankInventory orders={recentOrders} />
        </div>
        <div className="p-3">
          <UpsellRecommendations recommendations={upsellRecommendations} />
        </div>
      </div>
    </details>
  );
}

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

        {/* Always visible: today's job, access, open followups, last visit.
            This is what Luis needs before he walks in — no sorting required. */}

        {/* Section A: Today's job — visit type and active work, always first */}
        <TodaysJob
          serviceType={scheduledVisit.service_type}
          openFollowups={(openFollowups ?? []) as OpenFollowup[]}
          notes={scheduledVisit.notes ?? null}
        />

        {/* Section B: Account snapshot — access notes */}
        <AccountSnapshot customer={scheduledVisit.customer} />

        {/* Section C: Open followups — detail on each outstanding item */}
        <OpenFollowupsSection
          followups={(openFollowups ?? []) as OpenFollowup[]}
          visitId={visitId}
        />

        {/* Section D: Last visit — quick context on what was found and done */}
        <LastVisitSummary lastVisit={lastVisit} />

        {/* Everything below is context, not active work. Collapsed by default.
            Luis said he'd skip inventory and recommendations until inside. */}
        <MoreContext
          issuePatterns={(issuePatterns ?? []) as CustomerIssuePattern[]}
          recentOrders={recentOrders ?? []}
          upsellRecommendations={upsellRecommendations}
        />

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
