// POST /api/orders/[orderId]/fulfil
//
// Records a clean fulfilment — delivery completed without a replacement.
// This is the negative signal that makes the insight functions meaningful.
// Without it, the data only shows failures; the system can't tell the
// difference between a rule that's working and a rule that's never tested.
//
// Call this once the delivery window passes and no replacement order has
// been created. The orderId param is the order_id text field (e.g. ORD-10042),
// not the UUID.
//
// Request body:
//   customer_id       string   — customer_id text (e.g. CUST-0001)
//   zone              string
//   delivery_date     string   — YYYY-MM-DD
//   was_rush          boolean
//   temperature_flag  string   — stable | warm | high_heat | cold_snap
//   delivered_on_time boolean
//
// Response: { recorded: true } or an error.

import { createClient } from "@/lib/supabase/server";
import { recordFulfilmentOutcome, type DeliveryContext } from "@/lib/replacement-hook";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const body = await request.json();
  const supabase = await createClient();

  const { customer_id, ...deliveryFields } = body;

  if (!customer_id) {
    return Response.json({ error: "customer_id is required" }, { status: 400 });
  }

  await recordFulfilmentOutcome({
    order_id: orderId,
    customer_id,
    delivery: deliveryFields as DeliveryContext,
    supabase,
  });

  return Response.json({ recorded: true });
}
