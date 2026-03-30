// POST /api/delivery-windows/check
//
// Thin wrapper around checkDeliveryWindows — no DB needed, pure function.
//
// Request body: WindowCheckParams
//   zone                string
//   date                string    — YYYY-MM-DD
//   current_stop_count  number
//   temperature_flag    "stable" | "warm" | "high_heat" | "cold_snap"
//   current_time?       string    — HH:MM
//
// Response: WindowCheckResult
//   { available: true; windows: DeliveryWindow[] }
//   { available: false; reason: "heat"|"capacity"|"no_windows_remaining"; next_available_date: string; message: string }

import { checkDeliveryWindows, type WindowCheckParams } from "@/lib/delivery-windows";

export async function POST(request: Request) {
  const body: WindowCheckParams = await request.json();
  const result = checkDeliveryWindows(body);
  return Response.json(result);
}
