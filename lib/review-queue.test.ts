import { describe, it, expect } from "vitest";
import { sortReviewQueue, buildReviewItem, ReviewItem } from "./review-queue";
import type { Customer, Order, CatalogItem } from "@/types/database";

const BASE_CUSTOMER: Customer = {
  id: "1",
  customer_id: "CUST-0001",
  customer_name: "Mara Levin",
  customer_type: "collector",
  segment_hint: "reef-invert-vip",
  city: "Columbus",
  postal_code: "43215",
  signup_date: "2023-02-10",
  preferred_contact_channel: "sms",
  access_notes: null,
  notes: "frequent reef-safe livestock orders; low complaint rate",
  created_at: "",
};

const BASE_ORDER: Order = {
  id: "1",
  order_id: "ORD-10001",
  order_date: "2026-03-01",
  customer_id: "CUST-0001",
  sku: "FISH-TRG-001",
  quantity: 1,
  unit_price: 149,
  total_order_value: 149,
  order_channel: "web",
  rush_requested: false,
  fulfillment_type: "live_delivery",
  notes: null,
  created_at: "",
};

const CATALOG: CatalogItem[] = [
  {
    sku: "FISH-TRG-001",
    product_name: "Bluejaw Trigger Juvenile",
    category: "fish",
    buyer_type_hint: "advanced-showpiece",
    tank_size_min_gallons: 180,
    temperature_sensitivity: "medium",
    compatibility_group: "aggressive-non-reef",
    delivery_sensitivity: "high",
    service_dependency: "manual-review",
    upsell_relationships: [],
    created_at: "",
  },
];

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    order_id: "ORD-10001",
    order_date: "2026-03-01",
    channel: "web",
    rush: false,
    requested_delivery_date: "2026-03-05",
    flagged_sku: "FISH-TRG-001",
    flagged_product_name: "Bluejaw Trigger Juvenile",
    review_reason: "requires livestock team review",
    customer_id: "CUST-0001",
    customer_name: "Mara Levin",
    customer_type: "collector",
    segment_hint: "reef-invert-vip",
    tank_size_gallons: 200,
    tank_age_months: 18,
    existing_skus: [],
    customer_notes: null,
    customer_message: "Our livestock team will reach out.",
    priority: "standard",
    ...overrides,
  };
}

describe("sortReviewQueue", () => {
  it("places rush orders before standard orders", () => {
    const standard = makeItem({ order_id: "ORD-A", rush: false, requested_delivery_date: "2026-03-03" });
    const urgent = makeItem({ order_id: "ORD-B", rush: true, requested_delivery_date: "2026-03-05" });
    const sorted = sortReviewQueue([standard, urgent]);
    expect(sorted[0].order_id).toBe("ORD-B");
  });

  it("within rush orders, sorts by soonest delivery first", () => {
    const later = makeItem({ order_id: "ORD-A", rush: true, requested_delivery_date: "2026-03-10" });
    const sooner = makeItem({ order_id: "ORD-B", rush: true, requested_delivery_date: "2026-03-05" });
    const sorted = sortReviewQueue([later, sooner]);
    expect(sorted[0].order_id).toBe("ORD-B");
  });

  it("within standard orders, sorts by soonest delivery first", () => {
    const later = makeItem({ order_id: "ORD-A", rush: false, requested_delivery_date: "2026-03-15" });
    const sooner = makeItem({ order_id: "ORD-B", rush: false, requested_delivery_date: "2026-03-07" });
    const sorted = sortReviewQueue([later, sooner]);
    expect(sorted[0].order_id).toBe("ORD-B");
  });

  it("orders without a delivery date sort after those with one", () => {
    const withDate = makeItem({ order_id: "ORD-A", rush: false, requested_delivery_date: "2026-03-10" });
    const noDate = makeItem({ order_id: "ORD-B", rush: false, requested_delivery_date: null });
    const sorted = sortReviewQueue([noDate, withDate]);
    expect(sorted[0].order_id).toBe("ORD-A");
  });

  it("falls back to order date when delivery dates are equal", () => {
    const older = makeItem({ order_id: "ORD-A", rush: false, order_date: "2026-03-01", requested_delivery_date: "2026-03-10" });
    const newer = makeItem({ order_id: "ORD-B", rush: false, order_date: "2026-03-03", requested_delivery_date: "2026-03-10" });
    const sorted = sortReviewQueue([newer, older]);
    expect(sorted[0].order_id).toBe("ORD-A");
  });

  it("does not mutate the input array", () => {
    const items = [
      makeItem({ order_id: "ORD-A", rush: false }),
      makeItem({ order_id: "ORD-B", rush: true }),
    ];
    const original = [...items];
    sortReviewQueue(items);
    expect(items[0].order_id).toBe(original[0].order_id);
  });
});

describe("buildReviewItem", () => {
  it("sets priority to urgent for rush orders", () => {
    const rushOrder = { ...BASE_ORDER, rush_requested: true };
    const item = buildReviewItem({
      order: rushOrder,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [],
      catalog: CATALOG,
    });
    expect(item.priority).toBe("urgent");
    expect(item.rush).toBe(true);
  });

  it("sets priority to standard for non-rush orders", () => {
    const item = buildReviewItem({
      order: BASE_ORDER,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [],
      catalog: CATALOG,
    });
    expect(item.priority).toBe("standard");
  });

  it("resolves flagged product name from catalog", () => {
    const item = buildReviewItem({
      order: BASE_ORDER,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [],
      catalog: CATALOG,
    });
    expect(item.flagged_product_name).toBe("Bluejaw Trigger Juvenile");
  });

  it("excludes the current order from existing_skus", () => {
    const priorOrder = { ...BASE_ORDER, order_id: "ORD-99999", sku: "FISH-CLN-001", order_date: "2026-01-01" };
    const item = buildReviewItem({
      order: BASE_ORDER,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [BASE_ORDER, priorOrder],
      catalog: CATALOG,
    });
    expect(item.existing_skus).toContain("FISH-CLN-001");
    expect(item.existing_skus).not.toContain("FISH-TRG-001");
  });

  it("excludes orders older than 12 months from existing_skus", () => {
    const oldOrder = { ...BASE_ORDER, order_id: "ORD-OLD", sku: "FISH-CLN-001", order_date: "2020-01-01" };
    const item = buildReviewItem({
      order: BASE_ORDER,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [oldOrder],
      catalog: CATALOG,
    });
    expect(item.existing_skus).not.toContain("FISH-CLN-001");
  });

  it("carries customer notes through to the review item", () => {
    const item = buildReviewItem({
      order: BASE_ORDER,
      flagged_sku: "FISH-TRG-001",
      review_reason: "requires review",
      customer_message: "We'll be in touch.",
      customer: BASE_CUSTOMER,
      existing_orders: [],
      catalog: CATALOG,
    });
    expect(item.customer_notes).toMatch(/low complaint rate/);
  });
});
