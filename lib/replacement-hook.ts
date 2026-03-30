// Replacement hook — outcome recording triggered by order events.
//
// The knowledge capture loop only works if outcomes get recorded.
// This module is the mechanism: it fires whenever a replacement order
// is created or a delivery is confirmed clean.
//
// Two entry points:
//
//   recordReplacementOutcome — called when a replacement order is created.
//     Writes a DeliveryOutcome with resulted_in_replacement: true.
//     Updates any open FrictionAcknowledgement and DeliveryWindowOverride
//     records for the original order so their outcome fields are filled in.
//
//   recordFulfilmentOutcome — called when an order is marked fulfilled
//     without a replacement. The negative signal the insight functions need:
//     without it, the data only shows failures, not the base rate.
//
// Neither function throws. Both fire-and-forget safely — outcome recording
// should never block or fail an order creation response.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeliveryContext {
  zone: string;
  delivery_date: string;                                       // YYYY-MM-DD
  was_rush: boolean;
  temperature_flag: "stable" | "warm" | "high_heat" | "cold_snap";
  delivered_on_time: boolean;
  replacement_reason?: "late_delivery" | "doa" | "temperature_stress" | null;
}

export async function recordReplacementOutcome(params: {
  original_order_id: string;   // the order_id of the order being replaced (e.g. ORD-10042)
  customer_id: string;         // customer_id text field (e.g. CUST-0001)
  delivery: DeliveryContext;
  supabase: SupabaseClient;
}): Promise<void> {
  const { original_order_id, customer_id, delivery, supabase } = params;
  const now = new Date().toISOString();

  // 1. Insert delivery outcome — ground truth for zone insight
  const { error: outcomeError } = await supabase
    .from("delivery_outcomes")
    .insert({
      order_id: original_order_id,
      customer_id,
      zone: delivery.zone,
      delivery_date: delivery.delivery_date,
      was_rush: delivery.was_rush,
      temperature_flag: delivery.temperature_flag,
      delivered_on_time: delivery.delivered_on_time,
      resulted_in_replacement: true,
      replacement_reason: delivery.replacement_reason ?? null,
      recorded_at: now,
    });

  if (outcomeError) {
    console.error("[replacement-hook] delivery_outcomes insert failed:", outcomeError.message);
  }

  // 2. Update any open friction acknowledgements for this order
  // Only updates records where resulted_in_replacement is still null —
  // never overwrites an already-recorded outcome.
  const { error: frictionError } = await supabase
    .from("friction_acknowledgements")
    .update({ resulted_in_replacement: true, outcome_recorded_at: now })
    .eq("order_id", original_order_id)
    .is("resulted_in_replacement", null);

  if (frictionError) {
    console.error("[replacement-hook] friction_acknowledgements update failed:", frictionError.message);
  }

  // 3. Update any open delivery window overrides for this order
  const { error: overrideError } = await supabase
    .from("delivery_window_overrides")
    .update({ resulted_in_replacement: true, outcome_recorded_at: now })
    .eq("order_id", original_order_id)
    .is("resulted_in_replacement", null);

  if (overrideError) {
    console.error("[replacement-hook] delivery_window_overrides update failed:", overrideError.message);
  }
}

export async function recordFulfilmentOutcome(params: {
  order_id: string;
  customer_id: string;
  delivery: DeliveryContext;
  supabase: SupabaseClient;
}): Promise<void> {
  const { order_id, customer_id, delivery, supabase } = params;
  const now = new Date().toISOString();

  const { error: outcomeError } = await supabase
    .from("delivery_outcomes")
    .insert({
      order_id,
      customer_id,
      zone: delivery.zone,
      delivery_date: delivery.delivery_date,
      was_rush: delivery.was_rush,
      temperature_flag: delivery.temperature_flag,
      delivered_on_time: delivery.delivered_on_time,
      resulted_in_replacement: false,
      replacement_reason: null,
      recorded_at: now,
    });

  if (outcomeError) {
    console.error("[replacement-hook] delivery_outcomes insert failed:", outcomeError.message);
  }

  const { error: frictionError } = await supabase
    .from("friction_acknowledgements")
    .update({ resulted_in_replacement: false, outcome_recorded_at: now })
    .eq("order_id", order_id)
    .is("resulted_in_replacement", null);

  if (frictionError) {
    console.error("[replacement-hook] friction_acknowledgements update failed:", frictionError.message);
  }

  const { error: overrideError } = await supabase
    .from("delivery_window_overrides")
    .update({ resulted_in_replacement: false, outcome_recorded_at: now })
    .eq("order_id", order_id)
    .is("resulted_in_replacement", null);

  if (overrideError) {
    console.error("[replacement-hook] delivery_window_overrides update failed:", overrideError.message);
  }
}
