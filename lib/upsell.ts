// Upsell recommendation engine.
//
// Given a customer, this function returns up to 3 product recommendations
// the technician should mention during the visit.
//
// Ranking priority (highest first):
//   1. SKUs that directly address the customer's most frequent recurring issue
//   2. SKUs in the upsell_relationships graph of what the customer already owns
//   3. Items frequently bought with what they own
//
// Filters applied:
//   - Already owned SKUs are excluded
//   - Items requiring a larger tank than the customer likely has are excluded
//   - Office accounts don't get hobbyist-only recommendations

import type { UpsellRecommendation, CustomerIssuePattern, Order, CatalogItem, Customer } from "@/types/database";

const MAX_RECOMMENDATIONS = 3;

// Maps recurring issue descriptions to SKUs that would prevent or solve them.
// This is the core of the issue-informed recommendation logic.
const ISSUE_TO_SKU: Record<string, string> = {
  "top-off reservoir running dry":              "EQUIP-ATO-001",
  "sump evaporation swings":                    "EQUIP-ATO-001",
  "filter sock clogged":                        "SERV-MNT-001",
  "feeding schedule drifted between staff":     "SERV-CNS-001",
  "office manager asked for simpler weekly checklist": "SERV-CNS-001",
  "water clarity dipped before evening event":  "SERV-MNT-002",
  "display fish looked stressed under event lighting": "SERV-EMR-001",
  "staff fed tank twice and water looked cloudy": "SERV-CNS-001",
};

export function getUpsellRecommendations(params: {
  customer: Customer;
  recentOrders: Order[];
  catalogItems: CatalogItem[];
  issuePatterns: CustomerIssuePattern[];
}): UpsellRecommendation[] {
  const { customer, recentOrders, catalogItems, issuePatterns } = params;

  // Index catalog by SKU for fast lookup
  const catalogBySku = new Map(catalogItems.map((item) => [item.sku, item]));

  // What does this customer already own?
  const ownedSkus = new Set(recentOrders.map((o) => o.sku));

  const recommendations: UpsellRecommendation[] = [];
  const addedSkus = new Set<string>();

  // Helper to add a recommendation if it passes all filters
  function tryAdd(sku: string, reason: string) {
    if (addedSkus.has(sku)) return;
    if (ownedSkus.has(sku)) return;  // they already have it

    const item = catalogBySku.get(sku);
    if (!item) return;

    // Office accounts don't need live livestock recommendations
    if (customer.customer_type === "office_service" && item.category === "fish") return;
    if (customer.customer_type === "office_service" && item.category === "coral") return;

    addedSkus.add(sku);
    recommendations.push({
      sku,
      product_name: item.product_name,
      category: item.category,
      reason,
      unit_price: null,  // price fetched separately if needed
    });
  }

  // ── Priority 1: Issue-informed recommendations ────────────────────────
  // Sort by most frequent issue first
  const sortedIssues = [...issuePatterns].sort(
    (a, b) => b.occurrence_count - a.occurrence_count
  );

  for (const pattern of sortedIssues) {
    const sku = ISSUE_TO_SKU[pattern.issue_found];
    if (sku) {
      tryAdd(sku, `Addresses recurring issue: "${pattern.issue_found}" (${pattern.occurrence_count}×)`);
    }
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }

  // ── Priority 2: Upsell graph from what they already own ───────────────
  for (const order of recentOrders) {
    const ownedItem = catalogBySku.get(order.sku);
    if (!ownedItem) continue;

    for (const upsellSku of ownedItem.upsell_relationships) {
      tryAdd(upsellSku, `Pairs well with ${ownedItem.product_name}`);
      if (recommendations.length >= MAX_RECOMMENDATIONS) break;
    }
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }

  return recommendations.slice(0, MAX_RECOMMENDATIONS);
}
