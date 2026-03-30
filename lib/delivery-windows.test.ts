import { describe, it, expect } from "vitest";
import { checkDeliveryWindows, WindowCheckParams } from "./delivery-windows";

const BASE: WindowCheckParams = {
  zone: "downtown",
  date: "2026-05-01",       // a Friday
  current_stop_count: 1,
  temperature_flag: "stable",
  current_time: "09:00",
};

describe("checkDeliveryWindows", () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns available windows for a zone with capacity and stable temp", () => {
    const result = checkDeliveryWindows(BASE);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.windows.length).toBeGreaterThan(0);
    }
  });

  it("filters out windows whose cutoff has already passed", () => {
    const result = checkDeliveryWindows({ ...BASE, current_time: "11:00" });
    expect(result.available).toBe(true);
    if (result.available) {
      // 10:00-12:00 window (cutoff 08:30) should be gone
      expect(result.windows.every((w) => w.cutoff_time > "11:00")).toBe(true);
    }
  });

  it("returns all windows when no current_time is provided", () => {
    const result = checkDeliveryWindows({ ...BASE, current_time: undefined });
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.windows.length).toBe(3);
    }
  });

  // ── Heat block (south-belt) ───────────────────────────────────────────────

  it("blocks south-belt same-day on warm days", () => {
    const result = checkDeliveryWindows({ ...BASE, zone: "south-belt", temperature_flag: "warm" });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("heat");
      expect(result.message).toMatch(/temperatures/i);
    }
  });

  it("blocks south-belt same-day on high_heat days", () => {
    const result = checkDeliveryWindows({ ...BASE, zone: "south-belt", temperature_flag: "high_heat" });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe("heat");
  });

  it("allows south-belt on stable days", () => {
    const result = checkDeliveryWindows({ ...BASE, zone: "south-belt", temperature_flag: "stable", current_stop_count: 0 });
    expect(result.available).toBe(true);
  });

  it("allows south-belt on cold_snap days", () => {
    const result = checkDeliveryWindows({ ...BASE, zone: "south-belt", temperature_flag: "cold_snap", current_stop_count: 0 });
    expect(result.available).toBe(true);
  });

  it("does not heat-block other zones on warm days", () => {
    const result = checkDeliveryWindows({ ...BASE, zone: "downtown", temperature_flag: "warm" });
    expect(result.available).toBe(true);
  });

  // ── Capacity block ────────────────────────────────────────────────────────

  it("blocks when zone is at capacity", () => {
    const result = checkDeliveryWindows({ ...BASE, current_stop_count: 4 }); // downtown capacity = 4
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("capacity");
      expect(result.message).toMatch(/fully booked/i);
    }
  });

  it("allows one stop under capacity", () => {
    const result = checkDeliveryWindows({ ...BASE, current_stop_count: 3 }); // 3 < 4
    expect(result.available).toBe(true);
  });

  it("heat block takes precedence over capacity on south-belt", () => {
    const result = checkDeliveryWindows({
      ...BASE,
      zone: "south-belt",
      temperature_flag: "high_heat",
      current_stop_count: 0,  // plenty of capacity
    });
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe("heat");
  });

  // ── No windows remaining ─────────────────────────────────────────────────

  it("blocks when all cutoffs have passed for the day", () => {
    const result = checkDeliveryWindows({ ...BASE, current_time: "14:00" });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("no_windows_remaining");
      expect(result.message).toMatch(/cutoffs/i);
    }
  });

  // ── next_available_date ───────────────────────────────────────────────────

  it("next_available_date skips weekends — Friday gives Monday", () => {
    // BASE.date is 2026-05-01, a Friday
    const result = checkDeliveryWindows({ ...BASE, current_time: "14:00" });
    if (!result.available) {
      expect(result.next_available_date).toBe("2026-05-04"); // Monday
    }
  });

  it("next_available_date skips to Tuesday when blocked on Monday", () => {
    const result = checkDeliveryWindows({ ...BASE, date: "2026-05-04", current_time: "14:00" });
    if (!result.available) {
      expect(result.next_available_date).toBe("2026-05-05"); // Tuesday
    }
  });

  // ── Operator config toggles ───────────────────────────────────────────────

  it("master switch disabled allows all same-day orders through", () => {
    const config = { enabled: false, zone_overrides: {}, allow_weekend_delivery: false };
    const result = checkDeliveryWindows(
      { ...BASE, zone: "south-belt", temperature_flag: "high_heat", current_stop_count: 99 },
      config
    );
    expect(result.available).toBe(true);
  });

  it("zone override can disable heat blocking for a specific zone", () => {
    const config = {
      enabled: true,
      zone_overrides: { "south-belt": { heat_block: false } },
      allow_weekend_delivery: false,
    };
    const result = checkDeliveryWindows(
      { ...BASE, zone: "south-belt", temperature_flag: "high_heat", current_stop_count: 0 },
      config
    );
    expect(result.available).toBe(true);
  });

  it("zone override can enable heat blocking for a non-default zone", () => {
    const config = {
      enabled: true,
      zone_overrides: { "downtown": { heat_block: true } },
      allow_weekend_delivery: false,
    };
    const result = checkDeliveryWindows(
      { ...BASE, zone: "downtown", temperature_flag: "high_heat", current_stop_count: 0 },
      config
    );
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe("heat");
  });

  it("zone override can raise capacity for a zone", () => {
    const config = {
      enabled: true,
      zone_overrides: { "downtown": { capacity: 10 } },
      allow_weekend_delivery: false,
    };
    // downtown default capacity is 4 — 5 stops would normally block
    const result = checkDeliveryWindows({ ...BASE, zone: "downtown", current_stop_count: 5 }, config);
    expect(result.available).toBe(true);
  });

  it("allow_weekend_delivery gives a Saturday as next available", () => {
    const config = { enabled: true, zone_overrides: {}, allow_weekend_delivery: true };
    // BASE.date is Friday 2026-05-01, cutoffs passed
    const result = checkDeliveryWindows({ ...BASE, current_time: "14:00" }, config);
    if (!result.available) {
      expect(result.next_available_date).toBe("2026-05-02"); // Saturday
    }
  });
});
