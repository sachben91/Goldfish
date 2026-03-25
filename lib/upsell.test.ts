import { describe, it, expect } from "vitest";
import { getUpsellRecommendations } from "./upsell";
import type { Customer, Order, CatalogItem, CustomerIssuePattern } from "@/types/database";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const hobbyist: Customer = {
  id: "cust-1",
  customer_id: "CUST-0001",
  customer_name: "Jane's Tank",
  customer_type: "hobbyist",
  segment_hint: null,
  city: "Seattle",
  postal_code: null,
  signup_date: null,
  preferred_contact_channel: null,
  access_notes: null,
  notes: null,
  created_at: "2024-01-01",
};

const officeAccount: Customer = { ...hobbyist, customer_type: "office_service" };

function makeCatalogItem(sku: string, category: CatalogItem["category"], upsells: string[] = []): CatalogItem {
  return {
    sku,
    product_name: `Product ${sku}`,
    category,
    buyer_type_hint: null,
    tank_size_min_gallons: 0,
    temperature_sensitivity: null,
    compatibility_group: null,
    delivery_sensitivity: null,
    service_dependency: null,
    upsell_relationships: upsells,
    created_at: "2024-01-01",
  };
}

function makeOrder(sku: string): Order {
  return {
    id: `order-${sku}`,
    order_id: `ORD-${sku}`,
    order_date: "2025-01-01",
    customer_id: "cust-1",
    sku,
    quantity: 1,
    unit_price: 99,
    total_order_value: 99,
    order_channel: "direct",
    rush_requested: false,
    fulfillment_type: "standard",
    notes: null,
    created_at: "2024-01-01",
  };
}

function makeIssue(issue: string, count = 1): CustomerIssuePattern {
  return {
    customer_id: "cust-1",
    issue_found: issue,
    occurrence_count: count,
    last_seen: "2025-06-01",
    followup_count: 1,
  };
}

const catalog = [
  makeCatalogItem("EQUIP-ATO-001", "equipment"),
  makeCatalogItem("SERV-MNT-001", "service"),
  makeCatalogItem("SERV-CNS-001", "service"),
  makeCatalogItem("FISH-CLF-001", "fish", ["EQUIP-ATO-001"]),
  makeCatalogItem("CORAL-SPS-001", "coral", ["SERV-MNT-001", "SERV-CNS-001"]),
  makeCatalogItem("INVT-SNA-001", "invertebrate", ["FISH-CLF-001"]),
  makeCatalogItem("EQUIP-ALR-001", "equipment"),
  makeCatalogItem("EQUIP-PMP-001", "equipment"),
  makeCatalogItem("EQUIP-LGT-001", "equipment"),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getUpsellRecommendations", () => {
  it("returns at most 3 recommendations", () => {
    // coral with 2 upsells + issue that maps to a 3rd
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: [makeOrder("CORAL-SPS-001")],
      catalogItems: catalog,
      issuePatterns: [makeIssue("top-off reservoir running dry", 3)],
    });
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it("excludes SKUs the customer already owns", () => {
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: [makeOrder("FISH-CLF-001"), makeOrder("EQUIP-ATO-001")],
      catalogItems: catalog,
      issuePatterns: [],
    });
    // EQUIP-ATO-001 is the only upsell for FISH-CLF-001, but customer already has it
    expect(recs.find((r) => r.sku === "EQUIP-ATO-001")).toBeUndefined();
  });

  it("does not recommend fish to office accounts", () => {
    const recs = getUpsellRecommendations({
      customer: officeAccount,
      recentOrders: [makeOrder("INVT-SNA-001")],  // upsells FISH-CLF-001
      catalogItems: catalog,
      issuePatterns: [],
    });
    expect(recs.find((r) => r.category === "fish")).toBeUndefined();
  });

  it("does not recommend coral to office accounts", () => {
    const recs = getUpsellRecommendations({
      customer: officeAccount,
      recentOrders: [],
      catalogItems: catalog,
      issuePatterns: [],
    });
    expect(recs.find((r) => r.category === "coral")).toBeUndefined();
  });

  it("ranks issue-informed recs above upsell graph recs", () => {
    // Customer owns clownfish (upsells EQUIP-ATO-001 via graph)
    // But also has the "filter sock clogged" issue which maps to SERV-MNT-001
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: [makeOrder("FISH-CLF-001")],
      catalogItems: catalog,
      issuePatterns: [makeIssue("filter sock clogged", 5)],
    });
    // Issue-based rec should appear first
    expect(recs[0].sku).toBe("SERV-MNT-001");
  });

  it("falls back to upsell graph when no issue patterns match known SKUs", () => {
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: [makeOrder("FISH-CLF-001")],
      catalogItems: catalog,
      issuePatterns: [],
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].sku).toBe("EQUIP-ATO-001");
  });

  it("returns empty array when customer owns everything relevant", () => {
    const allSkus = catalog.map((c) => c.sku);
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: allSkus.map(makeOrder),
      catalogItems: catalog,
      issuePatterns: [],
    });
    expect(recs).toHaveLength(0);
  });

  it("handles unknown SKUs in the upsell graph without crashing", () => {
    const catalogWithBadRef = [
      ...catalog,
      makeCatalogItem("EQUIP-NEW-001", "equipment", ["SKU-DOES-NOT-EXIST"]),
    ];
    expect(() =>
      getUpsellRecommendations({
        customer: hobbyist,
        recentOrders: [makeOrder("EQUIP-NEW-001")],
        catalogItems: catalogWithBadRef,
        issuePatterns: [],
      })
    ).not.toThrow();
  });

  it("each recommendation includes a pitch string", () => {
    const recs = getUpsellRecommendations({
      customer: hobbyist,
      recentOrders: [makeOrder("FISH-CLF-001")],
      catalogItems: catalog,
      issuePatterns: [makeIssue("filter sock clogged", 2)],
    });
    recs.forEach((rec) => {
      expect(typeof rec.pitch).toBe("string");
      expect(rec.pitch.length).toBeGreaterThan(0);
    });
  });
});
