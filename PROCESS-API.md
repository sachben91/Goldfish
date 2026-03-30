# Goldfish Express — API Routes and Hooks

## What This Is For

The API routes and replacement hook are the data pipeline that feeds the knowledge capture layer. Without them, the insight functions in `lib/knowledge-capture.ts` — `deriveRuleInsight`, `deriveZoneInsight`, `deriveDeliveryOverrideInsight` — have no data to run on.

Two things have to happen for the system to get smarter over time:

1. **Outcomes have to be recorded.** Every replacement and every clean delivery needs to write a record. The replacement hook does this automatically when a replacement order is created. The fulfil endpoint does it for clean deliveries.

2. **Friction and override records need their outcome fields filled in.** A `FrictionAcknowledgement` is written when a customer proceeds through a warning. It starts with `resulted_in_replacement: null`. The hook fills it in once the outcome is known.

---

## API Routes

### `POST /api/orders`

Creates an order. If the order is a replacement for a previous order, set `replacement_for_order_id` — this is the trigger that fires outcome recording automatically.

**Standard order creation:**

```json
{
  "order_id": "ORD-11042",
  "order_date": "2026-03-30",
  "customer_id": "uuid-of-customer",
  "sku": "FISH-TRG-001",
  "quantity": 1,
  "unit_price": 149,
  "total_order_value": 149,
  "order_channel": "phone",
  "rush_requested": false,
  "fulfillment_type": "live_delivery",
  "notes": null
}
```

**Replacement order — triggers outcome recording:**

```json
{
  "order_id": "ORD-11043",
  "order_date": "2026-03-30",
  "customer_id": "uuid-of-customer",
  "sku": "FISH-TRG-001",
  "quantity": 1,
  "unit_price": 0,
  "total_order_value": 0,
  "order_channel": "phone",
  "rush_requested": false,
  "fulfillment_type": "live_delivery",
  "notes": "Replacement for ORD-11042 — arrived DOA",

  "replacement_for_order_id": "ORD-11042",
  "replacement_customer_id": "CUST-0041",
  "replacement_delivery": {
    "zone": "south-belt",
    "delivery_date": "2026-03-29",
    "was_rush": false,
    "temperature_flag": "high_heat",
    "delivered_on_time": true,
    "replacement_reason": "doa"
  }
}
```

When `replacement_for_order_id` is set, the response returns the new order immediately and the hook fires in the background. The hook:

- Inserts a `delivery_outcomes` row for the original order's zone with `resulted_in_replacement: true`
- Updates any `friction_acknowledgements` for the original order where `resulted_in_replacement` is still null
- Updates any `delivery_window_overrides` for the original order where `resulted_in_replacement` is still null

The hook never blocks the response. If it fails, it logs the error — the order is still created.

---

### `POST /api/orders/[orderId]/fulfil`

Records a clean delivery — order fulfilled, no replacement required. `orderId` is the `order_id` text field (e.g. `ORD-11042`), not the UUID.

**Request body:**

```json
{
  "customer_id": "CUST-0041",
  "zone": "downtown",
  "delivery_date": "2026-03-30",
  "was_rush": false,
  "temperature_flag": "stable",
  "delivered_on_time": true
}
```

**Response:**

```json
{ "recorded": true }
```

This endpoint is the negative signal. Without it, the delivery outcomes table only contains failures and the base rate is unknown. `deriveZoneInsight` needs both replacements and clean deliveries to compute a meaningful replacement rate.

**When to call it:** after the delivery window closes and no replacement order has been created. This could be triggered manually by whoever closes out delivery runs, or automated via a time-based job that marks all deliveries without a linked replacement as fulfilled after N days.

---

## The Replacement Hook (`lib/replacement-hook.ts`)

### `recordReplacementOutcome`

```typescript
recordReplacementOutcome({
  original_order_id: string,   // order_id text field of the order being replaced
  customer_id: string,         // customer_id text field (CUST-0001 format)
  delivery: DeliveryContext,
  supabase: SupabaseClient,
})
```

Called automatically by `POST /api/orders` when `replacement_for_order_id` is set. Can also be called directly — for example, from a Supabase Edge Function triggered by a database insert on the `orders` table where `replacement_for_order_id IS NOT NULL`. The Edge Function path catches replacements created through any surface, not just this API.

### `recordFulfilmentOutcome`

```typescript
recordFulfilmentOutcome({
  order_id: string,
  customer_id: string,
  delivery: DeliveryContext,
  supabase: SupabaseClient,
})
```

Called by `POST /api/orders/[orderId]/fulfil`. Same pattern as `recordReplacementOutcome` but writes `resulted_in_replacement: false`.

### `DeliveryContext`

```typescript
interface DeliveryContext {
  zone: string;
  delivery_date: string;          // YYYY-MM-DD
  was_rush: boolean;
  temperature_flag: "stable" | "warm" | "high_heat" | "cold_snap";
  delivered_on_time: boolean;
  replacement_reason?: "late_delivery" | "doa" | "temperature_stress" | null;
}
```

`replacement_reason` is only relevant when recording a replacement. It feeds the `late_delivery_share` field in `ZoneInsight`, which tells ops whether the zone's replacement rate is driven by route timing or by DOA/temperature issues — different fixes.

---

## The Knowledge Capture Tables

Three tables created by `supabase/migrations/001_knowledge_capture.sql`:

**`delivery_outcomes`** — one row per delivery (replacement or fulfilled). Ground truth for `deriveZoneInsight`. Zone replacement rates, rush rates, and heat rates are all computed from this table.

**`friction_acknowledgements`** — one row per friction gate acknowledgement. Written when a customer proceeds through a compatibility warning. The `resulted_in_replacement` field starts null and is filled in by the hook. This is the data `deriveRuleInsight` uses to answer "is this warning preventing replacements, or just adding friction?"

**`delivery_window_overrides`** — one row per rep override of a capacity block. Written when a rep works through the checklist and proceeds despite the zone being at capacity. The `checklist_answers` field is the knowledge capture payload — over time, specific answer patterns start predicting outcomes, feeding `deriveDeliveryOverrideInsight`.

---

## What the Insight Functions Produce (Once Data Exists)

| Function | Input table | Output |
|---|---|---|
| `deriveZoneInsight` | `delivery_outcomes` | Flag or critical when replacement rate exceeds threshold; breaks down by rush and heat |
| `deriveRuleInsight` | `friction_acknowledgements` + `review_decisions` | Suggests escalating, loosening, or removing a compatibility rule |
| `deriveDeliveryOverrideInsight` | `delivery_window_overrides` | Identifies which checklist answer patterns predict replacement; suggests tightening or loosening |
| `deriveSalesRepInsight` | `friction_acknowledgements` (by rep) | Flags reps whose overrides are resulting in replacements above threshold |

None of these produce meaningful output until data accumulates. The infrastructure is in place. The data has to come in.

---

## What This Does Not Yet Cover

**Friction acknowledgements from non-web channels.** The `friction_acknowledgements` table exists and the hook updates it. But the records are only written when a friction gate fires and is acknowledged. For web orders, this happens automatically. For phone, email, and concierge orders, there is no rep-facing tool to capture the acknowledgement at point of sale. Until a rep tool exists, friction acknowledgements only accumulate from web orders (~15% of order volume).

**The fulfil endpoint needs a caller.** The endpoint exists but nothing calls it today. Options: (1) a manual step in Luis's end-of-day delivery close-out, (2) a cron job that marks all orders without a linked replacement as fulfilled after the delivery date passes, or (3) a webhook from a future route management integration. Until one of these exists, the fulfilled path does not run and `deriveZoneInsight` will have incomplete data.
