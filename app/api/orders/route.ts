// POST /api/orders
//
// Creates an order. If replacement_for_order_id is set, this is a replacement
// order — the replacement hook fires automatically to record outcomes against
// the original order's friction acknowledgements, delivery window overrides,
// and zone delivery record.
//
// The hook is fire-and-forget: outcome recording never blocks or fails
// the order creation response.
//
// Request body:
//   order_id                  string    — e.g. ORD-11042
//   order_date                string    — YYYY-MM-DD
//   customer_id               string    — UUID (customers.id)
//   sku                       string
//   quantity                  number
//   unit_price                number
//   total_order_value         number
//   order_channel             string    — web | phone | email | concierge | account_manager
//   rush_requested            boolean
//   fulfillment_type          string
//   notes                     string | null
//   replacement_for_order_id  string | null   — order_id of the order being replaced
//   replacement_customer_id   string | null   — customer_id text (e.g. CUST-0001), required with replacement_for_order_id
//   replacement_delivery      object | null   — DeliveryContext, required with replacement_for_order_id
//
// Response: the inserted order row or an error.

import { createClient } from "@/lib/supabase/server";
import { recordReplacementOutcome, type DeliveryContext } from "@/lib/replacement-hook";

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = await createClient();

  const {
    replacement_for_order_id,
    replacement_customer_id,
    replacement_delivery,
    ...orderData
  } = body;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      ...orderData,
      replacement_for_order_id: replacement_for_order_id ?? null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  if (replacement_for_order_id && replacement_customer_id && replacement_delivery) {
    recordReplacementOutcome({
      original_order_id: replacement_for_order_id,
      customer_id: replacement_customer_id,
      delivery: replacement_delivery as DeliveryContext,
      supabase,
    }).catch((err) => console.error("[api/orders] replacement hook failed:", err));
  }

  return Response.json(order, { status: 201 });
}
