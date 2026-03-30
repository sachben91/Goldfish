// Delivery window availability check.
//
// Answers one question at point of sale: can we reliably fulfil a same-day
// or next-available delivery for this zone, on this date, under current
// conditions?
//
// Two independent signals block same-day delivery:
//
//   1. Temperature — south-belt has a 27% replacement rate regardless of
//      stop count. On warm or high-heat days the rate is higher still.
//      Same-day live livestock delivery to south-belt is blocked when the
//      temperature flag is warm or high_heat. This is structural, not
//      a capacity issue.
//
//   2. Route capacity — each zone has a safe stop limit derived from
//      historical delivery data. Adding a same-day stop after that limit
//      is reached causes route drift and late deliveries (54% replacement
//      rate on late deliveries vs 0% on-time).
//
// The caller provides current bookings for the zone and date, and an
// optional temperature flag. The function returns whether same-day is
// available and, if not, the next available date.

import { type DeliveryWindowConfig, DEFAULT_OPERATOR_CONFIG } from "./operator-config";

// ─── Rep override checklist ───────────────────────────────────────────────────
//
// When a capacity block fires on a rep-assisted order (phone, concierge),
// the rep works through this checklist with the customer before deciding
// whether to override. Answers are recorded with the override — over time
// they reveal which customer conditions actually predict successful delivery.
//
// Heat blocks are NOT overridable. The south-belt temperature signal is
// structural: the replacement rate holds at ~27–30% regardless of customer
// preparation. There is no conversation that changes physics.
//
// Capacity blocks are overridable because a rep talking to the customer has
// context the system doesn't: whether they're home all day, have cold storage,
// have handled late arrivals before. That context is worth capturing.

export interface DeliveryChecklistItem {
  id: string;
  question: string;    // what the rep asks the customer — verbatim or close to it
  context: string;     // why this matters — helps the rep understand what they're assessing
  // Whether a specific answer is required to proceed.
  // true  = must answer yes to override
  // false = must answer no to override
  // null  = any answer is informative but not gating — capture it regardless
  required_answer: boolean | null;
}

export const DELIVERY_OVERRIDE_CHECKLIST: DeliveryChecklistItem[] = [
  {
    id: "customer_available",
    question: "Can you confirm you'll be home and available to receive the delivery for the full delivery window?",
    context: "Livestock sitting outside after a missed drop is the single biggest avoidable kill factor. If the customer can't guarantee availability, the override is not worth making.",
    required_answer: true,
  },
  {
    id: "temperature_controlled_receipt",
    question: "Do you have a shaded, cool area to hold the bags if you need a few minutes to get set up?",
    context: "Even on non-heat-block days, direct sun on a delivery bag accelerates stress. A cool porch, garage, or lobby buys 20–30 minutes of buffer.",
    required_answer: null,
  },
  {
    id: "backup_aeration",
    question: "Do you have an aerator or battery-powered air pump you can run on the bags if needed?",
    context: "Dissolved oxygen drops fast in a sealed bag at ambient temperature. Backup aeration is the difference between a stressed fish and a dead one if delivery runs late.",
    required_answer: null,
  },
  {
    id: "holding_system_ready",
    question: "Is your tank or quarantine system filled, cycled, and ready to receive immediately on arrival?",
    context: "Acclimation delay compounds delivery stress. The faster the livestock moves from bag to water, the better the outcome. Check this especially for sensitive species.",
    required_answer: null,
  },
  {
    id: "prior_same_day_experience",
    question: "Have you done same-day delivery with us before, and did it go smoothly?",
    context: "A customer with successful prior same-day experience in this zone has demonstrated the setup works. A first-timer, or one who had a past issue, changes the risk profile.",
    required_answer: null,
  },
];

export type TemperatureFlag = "stable" | "warm" | "high_heat" | "cold_snap";

export type DeliveryWindow = {
  label: string;         // e.g. "11:00–13:00"
  cutoff_time: string;   // latest time an order can be placed to make this window, HH:MM
};

// Capacity limits per zone — maximum same-day stops before route reliability
// degrades. Derived from historical data: avg stops + ~1 buffer.
// South-belt is excluded from capacity-based blocking; heat is its primary signal.
const ZONE_CAPACITY: Record<string, number> = {
  "downtown":       4,
  "north-river":    4,
  "south-belt":     4,   // capacity limit retained but heat check fires first
  "east-clinic":    3,
  "west-lake":      4,
  "dayton-core":    3,
  "louisville-river": 3,
  "columbus-outer": 3,
};

// Zones where warm or high-heat conditions block same-day live delivery.
// South-belt has a 27% replacement rate year-round; on heat days it spikes further.
// Other zones show <5% heat-related replacement — manageable with cold packs.
const HEAT_SENSITIVE_ZONES = new Set(["south-belt"]);

// Standard delivery windows available each day.
export const STANDARD_WINDOWS: DeliveryWindow[] = [
  { label: "10:00–12:00", cutoff_time: "08:30" },
  { label: "12:00–14:00", cutoff_time: "10:30" },
  { label: "15:00–17:00", cutoff_time: "13:00" },
];

export interface WindowCheckParams {
  zone: string;
  date: string;              // ISO date string, YYYY-MM-DD
  current_stop_count: number; // how many stops are already booked for this zone/date
  temperature_flag: TemperatureFlag;
  current_time?: string;     // HH:MM — used to filter out windows whose cutoff has passed
}

export type WindowCheckResult =
  | { available: true; windows: DeliveryWindow[] }
  | { available: false; reason: "heat" | "capacity" | "no_windows_remaining"; next_available_date: string; message: string };

export function checkDeliveryWindows(
  params: WindowCheckParams,
  config: DeliveryWindowConfig = DEFAULT_OPERATOR_CONFIG.delivery_windows
): WindowCheckResult {
  const { zone, date, current_stop_count, temperature_flag, current_time } = params;

  // Master switch — operator can disable all window checks
  if (!config.enabled) {
    return { available: true, windows: STANDARD_WINDOWS };
  }

  // Resolve zone-level overrides, falling back to defaults
  const zoneOverride = config.zone_overrides[zone] ?? {};
  const isHeatSensitive = zoneOverride.heat_block ?? HEAT_SENSITIVE_ZONES.has(zone);
  const capacity = zoneOverride.capacity ?? ZONE_CAPACITY[zone] ?? 3;

  // ── Heat block ────────────────────────────────────────────────────────────
  // Operator can disable heat blocking for a specific zone (e.g. cold-chain upgrade)
  // or enable it for a new zone that's showing temperature-related losses.
  if (isHeatSensitive && (temperature_flag === "warm" || temperature_flag === "high_heat")) {
    return {
      available: false,
      reason: "heat",
      next_available_date: nextWeekday(date, config.allow_weekend_delivery),
      message: `Same-day delivery to ${formatZone(zone)} isn't available today — current temperatures make live delivery unreliable on this route. We can schedule for ${formatDate(nextWeekday(date, config.allow_weekend_delivery))} when conditions improve.`,
    };
  }

  // ── Capacity block ────────────────────────────────────────────────────────
  // Operator can raise or lower the limit per zone as route staffing changes.
  if (current_stop_count >= capacity) {
    return {
      available: false,
      reason: "capacity",
      next_available_date: nextWeekday(date, config.allow_weekend_delivery),
      message: `Same-day delivery to ${formatZone(zone)} is fully booked for today. The next available slot is ${formatDate(nextWeekday(date, config.allow_weekend_delivery))}.`,
    };
  }

  // ── Filter windows by current time ───────────────────────────────────────
  const availableWindows = current_time
    ? STANDARD_WINDOWS.filter((w) => w.cutoff_time > current_time)
    : STANDARD_WINDOWS;

  if (availableWindows.length === 0) {
    return {
      available: false,
      reason: "no_windows_remaining",
      next_available_date: nextWeekday(date, config.allow_weekend_delivery),
      message: `Order cutoffs for today have passed. The next available delivery to ${formatZone(zone)} is ${formatDate(nextWeekday(date, config.allow_weekend_delivery))}.`,
    };
  }

  return { available: true, windows: availableWindows };
}

// Returns the next available delivery day after the given date.
// Skips weekends unless allow_weekend_delivery is enabled.
// Uses UTC throughout to avoid local timezone shifts on date-only strings.
function nextWeekday(dateStr: string, allowWeekends = false): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  if (!allowWeekends) {
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  return date.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatZone(zone: string): string {
  return zone.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
