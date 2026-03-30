// POST /api/compatibility/check
//
// Runs the compatibility check engine against a cart and customer context.
// Fetches the full catalog from Supabase so callers don't need to send it.
//
// Request body:
//   cart_skus         string[]   — SKUs being added to the order
//   customer_type     string     — hobbyist | collector | office_service | wholesale
//   segment_hint      string     — e.g. "reef-vip", "beginner-learning"
//   existing_skus     string[]   — SKUs in the customer's recent order history
//   tank_size_gallons number
//   tank_age_months   number | null
//
// Response: CompatibilityResult — { ok: true } | { ok: "friction", concern } | { ok: "review", ... }

import { createClient } from "@supabase/supabase-js";
import { checkCompatibility, type TankContext } from "@/lib/compatibility";
import type { CatalogItem, CustomerType } from "@/types/database";

export async function POST(request: Request) {
  const body = await request.json();
  const { cart_skus, customer_type, segment_hint, existing_skus, tank_size_gallons, tank_age_months } = body;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: catalogItems, error } = await service.from("catalog").select("*");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const context: TankContext = {
    customer_type: (customer_type ?? "hobbyist") as CustomerType,
    segment_hint: segment_hint ?? null,
    existing_skus: existing_skus ?? [],
    tank_size_gallons: tank_size_gallons ?? 100,
    tank_age_months: tank_age_months ?? null,
  };

  const result = checkCompatibility(
    cart_skus ?? [],
    context,
    (catalogItems ?? []) as CatalogItem[]
  );

  return Response.json(result);
}
