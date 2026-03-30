// Review queue for orders that require livestock team sign-off.
//
// Orders land here when checkCompatibility returns ok: "review".
// The queue gives the reviewer everything needed to make a fast decision:
// the customer's tank context, the species flagged, and delivery urgency.
//
// Sort order:
//   1. Same-day / rush orders first — these have the tightest window
//   2. Within rush: earliest delivery window first (soonest to ship at top)
//   3. Within non-rush: earliest requested delivery first
//
// The reviewer sees enough to approve or reject in a single view —
// no digging through order history or customer notes.

import type { Customer, Order, CatalogItem } from "@/types/database";

export interface ReviewItem {
  // Order details
  order_id: string;
  order_date: string;
  channel: string;
  rush: boolean;
  requested_delivery_date: string | null;

  // The SKU that triggered the review and why
  flagged_sku: string;
  flagged_product_name: string;
  review_reason: string;

  // Customer context — everything the reviewer needs to make the call
  customer_id: string;
  customer_name: string;
  customer_type: string;
  segment_hint: string | null;
  tank_size_gallons: number;
  tank_age_months: number | null;
  existing_skus: string[];       // last 12 months of orders, excluding this one
  customer_notes: string | null; // any standing notes on the account

  // What the customer was shown when the order was held
  customer_message: string;

  // Reviewer priority signal — shown as a badge in the UI
  priority: "urgent" | "standard";
}

export interface BuildReviewItemParams {
  order: Order;
  flagged_sku: string;
  review_reason: string;
  customer_message: string;
  customer: Customer;
  existing_orders: Order[];       // all prior orders for this customer
  catalog: CatalogItem[];
  requested_delivery_date?: string | null;
}

export function buildReviewItem(params: BuildReviewItemParams): ReviewItem {
  const {
    order,
    flagged_sku,
    review_reason,
    customer_message,
    customer,
    existing_orders,
    catalog,
    requested_delivery_date = null,
  } = params;

  const catalogBySku = new Map(catalog.map((item) => [item.sku, item]));
  const flaggedItem = catalogBySku.get(flagged_sku);

  // Existing inventory: all SKUs ordered in the last 12 months, excluding the current order
  const cutoff = new Date(order.order_date);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const existingSkus = existing_orders
    .filter((o) => o.order_id !== order.order_id && new Date(o.order_date) >= cutoff)
    .map((o) => o.sku);

  return {
    order_id: order.order_id,
    order_date: order.order_date,
    channel: order.order_channel ?? "unknown",
    rush: order.rush_requested,
    requested_delivery_date,

    flagged_sku,
    flagged_product_name: flaggedItem?.product_name ?? flagged_sku,
    review_reason,

    customer_id: customer.customer_id,
    customer_name: customer.customer_name,
    customer_type: customer.customer_type,
    segment_hint: customer.segment_hint ?? null,
    tank_size_gallons: 0,    // populated from customer profile if stored; 0 = unknown
    tank_age_months: null,   // populated from customer profile if stored; null = unknown
    existing_skus: existingSkus,
    customer_notes: customer.notes ?? null,

    customer_message,
    priority: order.rush_requested ? "urgent" : "standard",
  };
}

export function sortReviewQueue(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    // Rush orders always surface first
    if (a.rush !== b.rush) return a.rush ? -1 : 1;

    // Within the same urgency tier, sort by soonest delivery window
    const dateA = a.requested_delivery_date ? new Date(a.requested_delivery_date).getTime() : Infinity;
    const dateB = b.requested_delivery_date ? new Date(b.requested_delivery_date).getTime() : Infinity;
    if (dateA !== dateB) return dateA - dateB;

    // Fallback: order date ascending (oldest first)
    return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
  });
}
