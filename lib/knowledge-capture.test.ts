import { describe, it, expect } from "vitest";
import {
  deriveRuleInsight, deriveSalesRepInsight, deriveSalesRepsAtThreshold,
  deriveDeliveryOverrideInsight, deriveZoneInsight, deriveZonesRequiringAction,
  FrictionAcknowledgement, ReviewDecision, SalesRepOverride,
  DeliveryWindowOverride, DeliveryOutcome,
} from "./knowledge-capture";

function makeAck(resulted_in_replacement: boolean | null, rep_id: string | null = null): FrictionAcknowledgement {
  return {
    order_id: "ORD-X",
    customer_id: "CUST-X",
    acknowledged_at: "2026-03-01T10:00:00Z",
    channel: rep_id ? "phone" : "web",
    sales_rep_id: rep_id,
    concern_code: "predator_shrimp_same_cart",
    flagged_sku: "FISH-TRG-001",
    rule: "shrimp_incompatibility",
    warning_shown: "Warning copy",
    customer_confirmation: "I understand",
    resulted_in_replacement,
    outcome_recorded_at: resulted_in_replacement !== null ? "2026-03-02T10:00:00Z" : null,
    outcome_notes: null,
  };
}

function makeOverride(rep_id: string, resulted_in_replacement: boolean | null, concern_code = "predator_shrimp_same_cart"): SalesRepOverride {
  return {
    rep_id,
    order_id: `ORD-${Math.random()}`,
    customer_id: "CUST-X",
    concern_code,
    flagged_sku: "FISH-TRG-001",
    overridden_at: "2026-03-01T10:00:00Z",
    rep_note: "Customer confirmed separate tanks",
    resulted_in_replacement,
    outcome_recorded_at: resulted_in_replacement !== null ? "2026-03-02T10:00:00Z" : null,
  };
}

function makeDecision(outcome: "approved" | "rejected" | "approved_with_conditions"): ReviewDecision {
  return {
    order_id: "ORD-X",
    customer_id: "CUST-X",
    decided_at: "2026-03-01T10:00:00Z",
    flagged_sku: "CORL-ANO-001",
    reviewer_id: "TECH-001",
    outcome,
    conditions: null,
    reviewer_notes: null,
    resulted_in_replacement: null,
    outcome_recorded_at: null,
  };
}

function makeDeliveryOverride(
  rep_id: string,
  zone: string,
  resulted_in_replacement: boolean | null,
  checklist_answers: Record<string, boolean | string | null> = {}
): DeliveryWindowOverride {
  return {
    rep_id,
    order_id: `ORD-${Math.random()}`,
    customer_id: "CUST-X",
    zone,
    block_reason: "capacity",
    delivery_date: "2026-03-01",
    stop_count_at_override: 5,
    overridden_at: "2026-03-01T09:00:00Z",
    checklist_answers,
    rep_note: null,
    resulted_in_replacement,
    outcome_recorded_at: resulted_in_replacement !== null ? "2026-03-01T18:00:00Z" : null,
    outcome_notes: null,
  };
}

const RULE = "shrimp_incompatibility";
const SKU = "FISH-TRG-001";

describe("deriveRuleInsight", () => {
  it("returns monitor with no data", () => {
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: [], decisions: [] });
    expect(insight.suggested_action).toBe("monitor");
    expect(insight.friction_replacement_rate).toBeNull();
  });

  it("returns monitor when sample is below threshold", () => {
    const acks = Array(10).fill(null).map(() => makeAck(true));
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: acks, decisions: [] });
    expect(insight.suggested_action).toBe("monitor");
    expect(insight.friction_replacement_rate).toBeNull();
  });

  it("suggests escalate_to_block when friction replacement rate is high", () => {
    // 15 replacements out of 20 = 75% — above 35% threshold
    const acks = [
      ...Array(15).fill(null).map(() => makeAck(true)),
      ...Array(5).fill(null).map(() => makeAck(false)),
    ];
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: acks, decisions: [] });
    expect(insight.suggested_action).toBe("escalate_to_block");
    expect(insight.friction_replacement_rate).toBeCloseTo(0.75);
  });

  it("suggests remove when friction replacement rate is very low", () => {
    // 1 replacement out of 20 = 5% — at or below 5% threshold
    const acks = [
      makeAck(true),
      ...Array(19).fill(null).map(() => makeAck(false)),
    ];
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: acks, decisions: [] });
    expect(insight.suggested_action).toBe("remove");
  });

  it("suggests escalate_to_friction when review approval rate is very high", () => {
    const decisions = Array(20).fill(null).map(() => makeDecision("approved"));
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: [], decisions });
    expect(insight.suggested_action).toBe("escalate_to_friction");
    expect(insight.review_approval_rate).toBeCloseTo(1.0);
  });

  it("suggests escalate_to_block when review rejection rate is very high", () => {
    const decisions = Array(20).fill(null).map(() => makeDecision("rejected"));
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: [], decisions });
    expect(insight.suggested_action).toBe("escalate_to_block");
  });

  it("suggests downgrade_to_review for moderate friction replacement rate", () => {
    // 4 out of 20 = 20% — between 5% and 35%
    const acks = [
      ...Array(4).fill(null).map(() => makeAck(true)),
      ...Array(16).fill(null).map(() => makeAck(false)),
    ];
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: acks, decisions: [] });
    expect(insight.suggested_action).toBe("downgrade_to_review");
  });

  it("ignores acknowledgements without outcomes when computing replacement rate", () => {
    const acks = [
      ...Array(10).fill(null).map(() => makeAck(true)),
      ...Array(10).fill(null).map(() => makeAck(null)), // no outcome yet
    ];
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: acks, decisions: [] });
    // Only 10 with outcomes — below MIN_SAMPLE threshold of 20
    expect(insight.friction_replacement_rate).toBeNull();
  });

  it("friction acknowledgements must include channel and rep fields", () => {
    const ack = makeAck(false);
    expect(ack).toHaveProperty("channel");
    expect(ack).toHaveProperty("sales_rep_id");
    expect(ack).toHaveProperty("concern_code");
  });

  it("counts approved_with_conditions as approvals", () => {
    const decisions = [
      ...Array(18).fill(null).map(() => makeDecision("approved_with_conditions")),
      ...Array(2).fill(null).map(() => makeDecision("rejected")),
    ];
    const insight = deriveRuleInsight({ rule: RULE, flagged_sku: SKU, acknowledgements: [], decisions });
    expect(insight.review_approval_rate).toBeCloseTo(0.9);
    expect(insight.suggested_action).toBe("escalate_to_friction");
  });
});

describe("deriveSalesRepInsight", () => {
  it("returns null replacement rate below minimum sample threshold", () => {
    const overrides = Array(5).fill(null).map(() => makeOverride("REP-01", true));
    const insight = deriveSalesRepInsight("REP-01", overrides);
    expect(insight.replacement_rate).toBeNull();
    expect(insight.at_threshold).toBe(false);
  });

  it("flags a rep whose override replacement rate exceeds 30%", () => {
    const overrides = [
      ...Array(4).fill(null).map(() => makeOverride("REP-01", true)),
      ...Array(6).fill(null).map(() => makeOverride("REP-01", false)),
    ];
    const insight = deriveSalesRepInsight("REP-01", overrides);
    expect(insight.replacement_rate).toBeCloseTo(0.4);
    expect(insight.at_threshold).toBe(true);
    expect(insight.threshold_note).toMatch(/40%/);
  });

  it("does not flag a rep with low replacement rate", () => {
    const overrides = [
      makeOverride("REP-02", true),
      ...Array(9).fill(null).map(() => makeOverride("REP-02", false)),
    ];
    const insight = deriveSalesRepInsight("REP-02", overrides);
    expect(insight.at_threshold).toBe(false);
    expect(insight.threshold_note).toBeNull();
  });

  it("ignores overrides without outcomes when computing rate", () => {
    const overrides = [
      ...Array(5).fill(null).map(() => makeOverride("REP-03", true)),
      ...Array(5).fill(null).map(() => makeOverride("REP-03", null)), // no outcome yet
    ];
    const insight = deriveSalesRepInsight("REP-03", overrides);
    // Only 5 with outcomes — below threshold of 10
    expect(insight.replacement_rate).toBeNull();
  });

  it("surfaces the most common concern codes for the rep", () => {
    const overrides = [
      ...Array(5).fill(null).map(() => makeOverride("REP-04", false, "predator_shrimp_same_cart")),
      ...Array(3).fill(null).map(() => makeOverride("REP-04", false, "tank_size_minimum")),
      ...Array(2).fill(null).map(() => makeOverride("REP-04", false, "mature_tank_requirement")),
    ];
    const insight = deriveSalesRepInsight("REP-04", overrides);
    expect(insight.top_concern_codes[0]).toBe("predator_shrimp_same_cart");
  });

  it("deriveSalesRepsAtThreshold returns only reps at threshold", () => {
    const overrides = [
      ...Array(4).fill(null).map(() => makeOverride("REP-BAD", true)),
      ...Array(6).fill(null).map(() => makeOverride("REP-BAD", false)),
      ...Array(10).fill(null).map(() => makeOverride("REP-GOOD", false)),
    ];
    const flagged = deriveSalesRepsAtThreshold(overrides);
    expect(flagged.map((i) => i.rep_id)).toContain("REP-BAD");
    expect(flagged.map((i) => i.rep_id)).not.toContain("REP-GOOD");
  });
});

describe("deriveDeliveryOverrideInsight", () => {
  it("returns null replacement rate below minimum sample", () => {
    const overrides = Array(5).fill(null).map(() =>
      makeDeliveryOverride("REP-01", "north-river", true)
    );
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    expect(insight.replacement_rate).toBeNull();
    expect(insight.suggested_action).toBe("monitor");
  });

  it("suggests tighten_checklist when replacement rate is high", () => {
    const overrides = [
      ...Array(8).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", true)),
      ...Array(4).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", false)),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    expect(insight.replacement_rate).toBeCloseTo(8 / 12);
    expect(insight.suggested_action).toBe("tighten_checklist");
  });

  it("suggests loosen when replacement rate is very low", () => {
    const overrides = [
      makeDeliveryOverride("REP-01", "north-river", true),
      ...Array(11).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", false)),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    expect(insight.replacement_rate).toBeCloseTo(1 / 12);
    expect(insight.suggested_action).toBe("loosen");
  });

  it("ignores overrides without outcomes when computing rate", () => {
    const overrides = [
      ...Array(5).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", true)),
      ...Array(5).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", null)),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    // Only 5 with outcomes — below threshold of 10
    expect(insight.replacement_rate).toBeNull();
  });

  it("only includes overrides for the specified zone", () => {
    const overrides = [
      ...Array(10).fill(null).map(() => makeDeliveryOverride("REP-01", "north-river", false)),
      ...Array(10).fill(null).map(() => makeDeliveryOverride("REP-01", "downtown", true)),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    expect(insight.total_overrides).toBe(10);
    expect(insight.replacement_rate).toBeCloseTo(0);
  });

  it("builds checklist correlations when enough answers exist", () => {
    const overrides = [
      // 6 overrides where customer_available=false → all replacements
      ...Array(6).fill(null).map(() =>
        makeDeliveryOverride("REP-01", "north-river", true, { customer_available: false })
      ),
      // 6 overrides where customer_available=true → no replacements
      ...Array(6).fill(null).map(() =>
        makeDeliveryOverride("REP-01", "north-river", false, { customer_available: true })
      ),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    const falseCorrelation = insight.checklist_correlations.find(
      (c) => c.question_id === "customer_available" && c.answer === false
    );
    expect(falseCorrelation).toBeDefined();
    expect(falseCorrelation!.replacement_rate).toBeCloseTo(1.0);
    const trueCorrelation = insight.checklist_correlations.find(
      (c) => c.question_id === "customer_available" && c.answer === true
    );
    expect(trueCorrelation).toBeDefined();
    expect(trueCorrelation!.replacement_rate).toBeCloseTo(0);
  });

  it("surfaces add_required_answer when a checklist answer strongly predicts replacement", () => {
    const overrides = [
      // 5 where customer_available=false → all replacements — strong signal
      ...Array(5).fill(null).map(() =>
        makeDeliveryOverride("REP-01", "north-river", true, { customer_available: false })
      ),
      // 8 where customer_available=true → no replacements
      ...Array(8).fill(null).map(() =>
        makeDeliveryOverride("REP-01", "north-river", false, { customer_available: true })
      ),
    ];
    const insight = deriveDeliveryOverrideInsight("north-river", overrides);
    // Overall replacement rate = 5/13 ≈ 38% — below 40% tighten threshold
    // But customer_available=false has 100% replacement rate → add_required_answer
    expect(insight.suggested_action).toBe("add_required_answer");
    expect(insight.suggested_action_reason).toMatch(/customer_available/);
  });

  it("includes per-rep breakdown", () => {
    const overrides = [
      ...Array(6).fill(null).map(() => makeDeliveryOverride("REP-A", "downtown", true)),
      ...Array(6).fill(null).map(() => makeDeliveryOverride("REP-B", "downtown", false)),
    ];
    const insight = deriveDeliveryOverrideInsight("downtown", overrides);
    const repA = insight.rep_breakdown.find((r) => r.rep_id === "REP-A");
    const repB = insight.rep_breakdown.find((r) => r.rep_id === "REP-B");
    expect(repA?.replacement_rate).toBeCloseTo(1.0);
    expect(repB?.replacement_rate).toBeCloseTo(0);
  });
});

// ─── Zone delivery insight tests ──────────────────────────────────────────────
//
// These tests verify the threshold-based monitoring logic that flags zones
// when aggregate replacement rates exceed acceptable levels. This is the layer
// that alerts ops without anyone having to remember to check.
//
// Thresholds under test:
//   >= 15%  → flag
//   >= 30%  → critical
//   < 15%   → monitor (or insufficient data)
//   < 20 deliveries → null rate, monitor always

function makeOutcome(
  zone: string,
  resulted_in_replacement: boolean,
  opts: Partial<Pick<DeliveryOutcome, "was_rush" | "temperature_flag" | "delivered_on_time" | "replacement_reason">> = {}
): DeliveryOutcome {
  return {
    order_id: `ORD-${Math.random()}`,
    customer_id: "CUST-X",
    zone,
    delivery_date: "2026-03-01",
    was_rush: opts.was_rush ?? false,
    temperature_flag: opts.temperature_flag ?? "stable",
    delivered_on_time: opts.delivered_on_time ?? true,
    resulted_in_replacement,
    replacement_reason: opts.replacement_reason ?? null,
    recorded_at: "2026-03-01T18:00:00Z",
  };
}

describe("deriveZoneInsight", () => {
  // ── Minimum sample ────────────────────────────────────────────────────────

  it("returns monitor with null rate below minimum sample threshold", () => {
    const outcomes = Array(10).fill(null).map(() => makeOutcome("downtown", true));
    const insight = deriveZoneInsight("downtown", outcomes);
    expect(insight.replacement_rate).toBeNull();
    expect(insight.action).toBe("monitor");
  });

  // ── Threshold boundaries ──────────────────────────────────────────────────

  it("returns monitor when replacement rate is below acceptable threshold", () => {
    // 2 replacements out of 20 = 10% — below 15% threshold
    const outcomes = [
      ...Array(2).fill(null).map(() => makeOutcome("downtown", true)),
      ...Array(18).fill(null).map(() => makeOutcome("downtown", false)),
    ];
    const insight = deriveZoneInsight("downtown", outcomes);
    expect(insight.replacement_rate).toBeCloseTo(0.10);
    expect(insight.action).toBe("monitor");
  });

  it("flags zone when replacement rate exceeds acceptable threshold", () => {
    // 4 replacements out of 20 = 20% — above 15% flag threshold
    const outcomes = [
      ...Array(4).fill(null).map(() => makeOutcome("north-river", true)),
      ...Array(16).fill(null).map(() => makeOutcome("north-river", false)),
    ];
    const insight = deriveZoneInsight("north-river", outcomes);
    expect(insight.replacement_rate).toBeCloseTo(0.20);
    expect(insight.action).toBe("flag");
    expect(insight.action_reason).toMatch(/north-river/i);
  });

  it("marks zone as critical when replacement rate exceeds critical threshold", () => {
    // 8 replacements out of 20 = 40% — above 30% critical threshold
    const outcomes = [
      ...Array(8).fill(null).map(() => makeOutcome("south-belt", true)),
      ...Array(12).fill(null).map(() => makeOutcome("south-belt", false)),
    ];
    const insight = deriveZoneInsight("south-belt", outcomes);
    expect(insight.replacement_rate).toBeCloseTo(0.40);
    expect(insight.action).toBe("critical");
    expect(insight.action_reason).toMatch(/immediate review/i);
  });

  it("passes a healthy zone with low replacement rate", () => {
    const outcomes = [
      makeOutcome("west-lake", true),
      ...Array(19).fill(null).map(() => makeOutcome("west-lake", false)),
    ];
    const insight = deriveZoneInsight("west-lake", outcomes);
    expect(insight.action).toBe("monitor");
  });

  // ── Rush breakdown ────────────────────────────────────────────────────────

  it("breaks out rush replacement rate separately", () => {
    const outcomes = [
      // 5 rush, 3 with replacement
      ...Array(3).fill(null).map(() => makeOutcome("downtown", true, { was_rush: true })),
      ...Array(2).fill(null).map(() => makeOutcome("downtown", false, { was_rush: true })),
      // 15 standard, 1 with replacement
      makeOutcome("downtown", true, { was_rush: false }),
      ...Array(14).fill(null).map(() => makeOutcome("downtown", false, { was_rush: false })),
    ];
    const insight = deriveZoneInsight("downtown", outcomes);
    expect(insight.rush_replacement_rate).toBeCloseTo(0.6);
    // overall rate = 4/20 = 20% → flag; rush is the driver
    expect(insight.action).toBe("flag");
    expect(insight.action_reason).toMatch(/rush/i);
  });

  it("returns null rush rate when fewer than 5 rush deliveries", () => {
    const outcomes = [
      makeOutcome("east-clinic", true, { was_rush: true }),
      ...Array(3).fill(null).map(() => makeOutcome("east-clinic", false, { was_rush: true })),
      ...Array(16).fill(null).map(() => makeOutcome("east-clinic", false, { was_rush: false })),
    ];
    const insight = deriveZoneInsight("east-clinic", outcomes);
    expect(insight.rush_replacement_rate).toBeNull();
  });

  // ── Heat breakdown ────────────────────────────────────────────────────────

  it("breaks out heat replacement rate separately", () => {
    const outcomes = [
      // 6 heat deliveries, 4 with replacement
      ...Array(4).fill(null).map(() => makeOutcome("south-belt", true, { temperature_flag: "high_heat" })),
      ...Array(2).fill(null).map(() => makeOutcome("south-belt", false, { temperature_flag: "warm" })),
      // 14 stable, 0 replacements
      ...Array(14).fill(null).map(() => makeOutcome("south-belt", false, { temperature_flag: "stable" })),
    ];
    const insight = deriveZoneInsight("south-belt", outcomes);
    expect(insight.heat_replacement_rate).toBeCloseTo(4 / 6);
    // overall rate = 4/20 = 20% → flag; heat is the driver
    expect(insight.action).toBe("flag");
    expect(insight.action_reason).toMatch(/heat/i);
  });

  // ── Late delivery share ───────────────────────────────────────────────────

  it("computes late delivery share of replacements", () => {
    const outcomes = [
      ...Array(3).fill(null).map(() =>
        makeOutcome("north-river", true, { delivered_on_time: false, replacement_reason: "late_delivery" })
      ),
      makeOutcome("north-river", true, { delivered_on_time: true, replacement_reason: "doa" }),
      ...Array(16).fill(null).map(() => makeOutcome("north-river", false)),
    ];
    const insight = deriveZoneInsight("north-river", outcomes);
    // 3 of 4 replacements attributed to late delivery
    expect(insight.late_delivery_share).toBeCloseTo(0.75);
  });

  it("late delivery share is null when there are no replacements", () => {
    const outcomes = Array(20).fill(null).map(() => makeOutcome("west-lake", false));
    const insight = deriveZoneInsight("west-lake", outcomes);
    expect(insight.late_delivery_share).toBeNull();
  });

  // ── Only counts the specified zone ────────────────────────────────────────

  it("ignores outcomes from other zones", () => {
    const outcomes = [
      // downtown: 10 replacements out of 10 — critical
      ...Array(10).fill(null).map(() => makeOutcome("downtown", true)),
      // west-lake: 0 replacements out of 20 — healthy
      ...Array(20).fill(null).map(() => makeOutcome("west-lake", false)),
    ];
    const insight = deriveZoneInsight("west-lake", outcomes);
    expect(insight.total_deliveries).toBe(20);
    expect(insight.replacement_rate).toBeCloseTo(0);
    expect(insight.action).toBe("monitor");
  });
});

describe("deriveZonesRequiringAction", () => {
  it("returns only zones above the acceptable threshold", () => {
    const outcomes = [
      // downtown: 4/20 = 20% → flag
      ...Array(4).fill(null).map(() => makeOutcome("downtown", true)),
      ...Array(16).fill(null).map(() => makeOutcome("downtown", false)),
      // west-lake: 1/20 = 5% → monitor
      makeOutcome("west-lake", true),
      ...Array(19).fill(null).map(() => makeOutcome("west-lake", false)),
    ];
    const flagged = deriveZonesRequiringAction(outcomes);
    expect(flagged.map((z) => z.zone)).toContain("downtown");
    expect(flagged.map((z) => z.zone)).not.toContain("west-lake");
  });

  it("returns both flag and critical zones, excludes monitor zones", () => {
    const outcomes = [
      // south-belt: 8/20 = 40% → critical
      ...Array(8).fill(null).map(() => makeOutcome("south-belt", true)),
      ...Array(12).fill(null).map(() => makeOutcome("south-belt", false)),
      // north-river: 4/20 = 20% → flag
      ...Array(4).fill(null).map(() => makeOutcome("north-river", true)),
      ...Array(16).fill(null).map(() => makeOutcome("north-river", false)),
      // east-clinic: 1/20 = 5% → monitor
      makeOutcome("east-clinic", true),
      ...Array(19).fill(null).map(() => makeOutcome("east-clinic", false)),
    ];
    const flagged = deriveZonesRequiringAction(outcomes);
    const zones = flagged.map((z) => z.zone);
    expect(zones).toContain("south-belt");
    expect(zones).toContain("north-river");
    expect(zones).not.toContain("east-clinic");

    const sb = flagged.find((z) => z.zone === "south-belt");
    expect(sb?.action).toBe("critical");
    const nr = flagged.find((z) => z.zone === "north-river");
    expect(nr?.action).toBe("flag");
  });

  it("returns empty list when all zones are healthy", () => {
    const outcomes = [
      makeOutcome("downtown", true),
      ...Array(19).fill(null).map(() => makeOutcome("downtown", false)),
    ];
    expect(deriveZonesRequiringAction(outcomes)).toHaveLength(0);
  });

  it("returns empty list when no zone has enough data", () => {
    const outcomes = Array(10).fill(null).map(() => makeOutcome("downtown", true));
    expect(deriveZonesRequiringAction(outcomes)).toHaveLength(0);
  });
});
