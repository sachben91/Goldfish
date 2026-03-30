import { describe, it, expect } from "vitest";
import {
  deriveRecurringPatterns,
  deriveAccountServiceInsight,
  sortOpsQueue,
  openOpsItems,
  OpsQueueItem,
} from "./ops-queue";

// ─── Helpers ───────────────────────────────────────────────────────────────

function obs(issue: string, daysAgo: number): { issue: string; seen_on: string } {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { issue, seen_on: d.toISOString().slice(0, 10) };
}

function makeOpsItem(
  kind: OpsQueueItem["kind"],
  priority: OpsQueueItem["priority"],
  status: OpsQueueItem["status"] = "open",
  flagged_at = "2026-01-01T10:00:00Z"
): OpsQueueItem {
  return {
    customer_id: "CUST-X",
    visit_id: `VIS-${Math.random()}`,
    tech_id: "TECH-001",
    flagged_at,
    kind,
    priority,
    status,
    observation: "Test observation",
    suggested_action: null,
    sku: null,
    resolved_at: null,
    resolution_notes: null,
  };
}

// ─── deriveRecurringPatterns ───────────────────────────────────────────────

describe("deriveRecurringPatterns", () => {
  it("returns empty list with no observations", () => {
    expect(deriveRecurringPatterns([])).toHaveLength(0);
  });

  it("does not flag an issue below the minimum occurrence threshold", () => {
    const observations = [
      obs("filter sock clogged", 10),
      obs("filter sock clogged", 40),
    ];
    expect(deriveRecurringPatterns(observations)).toHaveLength(0);
  });

  it("flags an issue at or above the minimum threshold", () => {
    const observations = [
      obs("filter sock clogged", 10),
      obs("filter sock clogged", 40),
      obs("filter sock clogged", 80),
    ];
    const patterns = deriveRecurringPatterns(observations);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].issue).toBe("filter sock clogged");
    expect(patterns[0].occurrences).toBe(3);
    expect(patterns[0].is_active_pattern).toBe(true);
  });

  it("ignores observations outside the 6-month lookback window", () => {
    const observations = [
      obs("filter sock clogged", 10),
      obs("filter sock clogged", 40),
      obs("filter sock clogged", 200),  // outside 180-day window
    ];
    // Only 2 within window — below threshold
    expect(deriveRecurringPatterns(observations)).toHaveLength(0);
  });

  it("sorts patterns by occurrence count descending", () => {
    const observations = [
      obs("top-off reservoir running dry", 10),
      obs("top-off reservoir running dry", 30),
      obs("top-off reservoir running dry", 60),
      obs("top-off reservoir running dry", 90),
      obs("filter sock clogged", 20),
      obs("filter sock clogged", 50),
      obs("filter sock clogged", 80),
    ];
    const patterns = deriveRecurringPatterns(observations);
    expect(patterns[0].issue).toBe("top-off reservoir running dry");
    expect(patterns[0].occurrences).toBe(4);
    expect(patterns[1].issue).toBe("filter sock clogged");
  });

  it("surfaces an ATO suggestion for top-off issues", () => {
    const observations = Array(3).fill(null).map((_, i) =>
      obs("top-off reservoir running dry", i * 20 + 10)
    );
    const patterns = deriveRecurringPatterns(observations);
    expect(patterns[0].suggested_ops_action).toMatch(/ATO/i);
  });

  it("surfaces a staff training suggestion for feeding drift", () => {
    const observations = Array(3).fill(null).map((_, i) =>
      obs("feeding schedule drifted between staff", i * 20 + 10)
    );
    const patterns = deriveRecurringPatterns(observations);
    expect(patterns[0].suggested_ops_action).toMatch(/training/i);
  });
});

// ─── deriveAccountServiceInsight ──────────────────────────────────────────

describe("deriveAccountServiceInsight", () => {
  const BASE = {
    customer_id: "CUST-001",
    current_service_type: "monthly_maintenance" as const,
    observations: [],
    open_followups: [],
    ops_items: [],
  };

  it("returns monitor for a stable account with no issues", () => {
    const insight = deriveAccountServiceInsight(BASE);
    expect(insight.suggested_action).toBe("monitor");
    expect(insight.has_active_patterns).toBe(false);
    expect(insight.open_followup_count).toBe(0);
  });

  it("suggests review when active patterns exist", () => {
    const insight = deriveAccountServiceInsight({
      ...BASE,
      observations: Array(3).fill(null).map((_, i) =>
        obs("filter sock clogged", i * 20 + 10)
      ),
    });
    expect(insight.suggested_action).toBe("review");
    expect(insight.has_active_patterns).toBe(true);
  });

  it("suggests escalate when urgent ops items are present", () => {
    const insight = deriveAccountServiceInsight({
      ...BASE,
      ops_items: [makeOpsItem("upsell_opportunity", "urgent")],
    });
    expect(insight.suggested_action).toBe("escalate");
    expect(insight.urgent_ops_items).toBe(1);
  });

  it("suggests escalate when many follow-ups are stale", () => {
    // FOLLOWUP_STALE_DAYS = 60
    const insight = deriveAccountServiceInsight({
      ...BASE,
      open_followups: [{ days_open: 70 }, { days_open: 80 }, { days_open: 90 }],
    });
    expect(insight.suggested_action).toBe("escalate");
    expect(insight.stale_followup_count).toBe(3);
  });

  it("suggests increasing cadence when 3+ patterns exist on monthly service", () => {
    const observations = [
      ...Array(3).fill(null).map((_, i) => obs("top-off reservoir running dry", i * 20 + 10)),
      ...Array(3).fill(null).map((_, i) => obs("filter sock clogged", i * 25 + 5)),
      ...Array(3).fill(null).map((_, i) => obs("sump evaporation swings", i * 30 + 15)),
    ];
    const insight = deriveAccountServiceInsight({ ...BASE, observations });
    expect(insight.cadence_suggestion).toBe("increase");
    expect(insight.cadence_reason).toMatch(/biweekly/i);
  });

  it("suggests decreasing cadence for clean biweekly account", () => {
    const insight = deriveAccountServiceInsight({
      ...BASE,
      current_service_type: "biweekly_maintenance",
      observations: [],
      open_followups: [],
    });
    expect(insight.cadence_suggestion).toBe("decrease");
    expect(insight.cadence_reason).toMatch(/monthly/i);
  });

  it("counts only open ops items, not resolved ones", () => {
    const insight = deriveAccountServiceInsight({
      ...BASE,
      ops_items: [
        makeOpsItem("upsell_opportunity", "this_week", "open"),
        makeOpsItem("return_visit_needed", "urgent", "resolved"),
      ],
    });
    expect(insight.open_ops_items).toBe(1);
    expect(insight.urgent_ops_items).toBe(0);  // the urgent one is resolved
  });
});

// ─── sortOpsQueue / openOpsItems ──────────────────────────────────────────

describe("sortOpsQueue", () => {
  it("sorts by priority: urgent first, whenever last", () => {
    const items = [
      makeOpsItem("upsell_opportunity", "whenever"),
      makeOpsItem("return_visit_needed", "urgent"),
      makeOpsItem("pattern_alert", "this_week"),
      makeOpsItem("customer_escalation", "next_visit"),
    ];
    const sorted = sortOpsQueue(items);
    expect(sorted[0].priority).toBe("urgent");
    expect(sorted[1].priority).toBe("this_week");
    expect(sorted[2].priority).toBe("next_visit");
    expect(sorted[3].priority).toBe("whenever");
  });

  it("within same priority, sorts oldest first", () => {
    const items = [
      makeOpsItem("upsell_opportunity", "this_week", "open", "2026-03-10T10:00:00Z"),
      makeOpsItem("return_visit_needed", "this_week", "open", "2026-02-01T10:00:00Z"),
    ];
    const sorted = sortOpsQueue(items);
    expect(sorted[0].flagged_at).toBe("2026-02-01T10:00:00Z");
  });

  it("does not mutate the original array", () => {
    const items = [
      makeOpsItem("upsell_opportunity", "whenever"),
      makeOpsItem("return_visit_needed", "urgent"),
    ];
    const original = [...items];
    sortOpsQueue(items);
    expect(items[0].priority).toBe(original[0].priority);
  });
});

describe("openOpsItems", () => {
  it("filters out resolved and in_progress items", () => {
    const items = [
      makeOpsItem("upsell_opportunity", "this_week", "open"),
      makeOpsItem("return_visit_needed", "urgent", "resolved"),
      makeOpsItem("pattern_alert", "next_visit", "in_progress"),
    ];
    const open = openOpsItems(items);
    expect(open).toHaveLength(1);
    expect(open[0].kind).toBe("upsell_opportunity");
  });

  it("returns sorted open items", () => {
    const items = [
      makeOpsItem("upsell_opportunity", "whenever", "open"),
      makeOpsItem("return_visit_needed", "urgent", "open"),
    ];
    const open = openOpsItems(items);
    expect(open[0].priority).toBe("urgent");
  });
});
