// Knowledge capture for friction gates and review decisions.
//
// Every time a friction gate fires and a customer proceeds, or a reviewer
// approves/rejects a review hold, a structured record is written. Over time
// these records answer questions the rules cannot:
//
//   - Which friction warnings are being acknowledged and still resulting in loss?
//     → candidate for escalation to hard block
//   - Which review holds are being approved 90%+ of the time for a given SKU?
//     → candidate for downgrade to friction gate
//   - What context is Priya writing in her review notes?
//     → Priya's expertise, made visible and searchable
//
// This is the mechanism by which tribal knowledge becomes encoded knowledge.
// The records should be written to the database and periodically reviewed
// by ops to inform rule updates.

// ─── Friction acknowledgement ─────────────────────────────────────────────
//
// Written when a customer explicitly acknowledges a friction warning
// and chooses to proceed. The outcome field is filled in later — either
// by the delivery system (replacement_required flag) or manually by support.

export interface FrictionAcknowledgement {
  // Order and customer
  order_id: string;
  customer_id: string;
  acknowledged_at: string;        // ISO timestamp

  // Channel and sales rep — null for web (self-serve)
  channel: string;                // "web" | "phone" | "email" | "concierge"
  sales_rep_id: string | null;    // null for web orders — populated for rep-assisted channels

  // What fired
  concern_code: string;           // e.g. "predator_shrimp_same_cart", "tank_size_minimum"
  flagged_sku: string;
  rule: string;
  warning_shown: string;          // exact customer_message or sales_talking_point shown

  // What the customer/rep confirmed
  customer_confirmation: string;  // free text — rep's note or customer's typed acknowledgement

  // Outcome — filled in after delivery
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
  outcome_notes: string | null;
}

// ─── Review decision ───────────────────────────────────────────────────────
//
// Written when a livestock team member approves or rejects a review hold.
// The reviewer_notes field is the primary knowledge capture surface —
// this is where Priya writes "customer confirmed 18-month 120g mixed reef,
// no shrimp, approved" and that context becomes searchable.

export type ReviewOutcome = "approved" | "rejected" | "approved_with_conditions";

export interface ReviewDecision {
  // Order and customer
  order_id: string;
  customer_id: string;
  decided_at: string;             // ISO timestamp

  // What was reviewed
  flagged_sku: string;
  reviewer_id: string;

  // The decision
  outcome: ReviewOutcome;
  conditions: string | null;      // if approved_with_conditions — e.g. "confirm tank >100g before packing"
  reviewer_notes: string | null;  // free text — primary knowledge capture field

  // Outcome after delivery
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
}

// ─── Rule insight ──────────────────────────────────────────────────────────
//
// Derived from aggregating acknowledgements and review decisions over time.
// Surfaced to operators so they can see which rules are earning their keep
// and which need to be tightened, loosened, or removed.

export type SuggestedRuleAction =
  | "escalate_to_block"     // friction replacement rate is high — make it a hard block
  | "escalate_to_friction"  // review approval rate is very high — loosen to friction gate
  | "downgrade_to_review"   // friction replacement rate is moderate — add human review
  | "remove"                // replacement rate near zero and approval rate near 100% — rule is noise
  | "monitor";              // insufficient data or mixed signal — keep watching

export interface RuleInsight {
  rule: string;
  flagged_sku: string | null;     // null = applies to all SKUs under this rule

  // Friction gate stats
  friction_acknowledgement_count: number;
  friction_replacement_rate: number | null;   // null = no outcomes recorded yet

  // Review hold stats
  review_decision_count: number;
  review_approval_rate: number | null;
  review_rejection_rate: number | null;

  // Patterns emerging from reviewer notes — top phrases, recurring context
  // In production: derived by frequency analysis or lightweight NLP over reviewer_notes
  common_approval_context: string[];
  common_rejection_context: string[];

  suggested_action: SuggestedRuleAction;
  suggested_action_reason: string;
}

// ─── Delivery outcome ─────────────────────────────────────────────────────
//
// Written after every delivery completes. This is the ground-truth record
// the system uses to monitor zone health and flag when replacement rates
// exceed acceptable thresholds — independently of overrides or friction gates.
//
// Zone insight is derived from these records, not from override records.
// Override records (DeliveryWindowOverride) tell us how reps are exercising
// discretion. Delivery outcomes tell us how the zones are actually performing.

export interface DeliveryOutcome {
  order_id: string;
  customer_id: string;
  zone: string;
  delivery_date: string;           // ISO date, YYYY-MM-DD
  was_rush: boolean;
  temperature_flag: "stable" | "warm" | "high_heat" | "cold_snap";
  delivered_on_time: boolean | null;
  resulted_in_replacement: boolean;
  replacement_reason: string | null;  // e.g. "late_delivery" | "doa" | "temperature_stress"
  recorded_at: string;               // ISO timestamp
}

// ─── Zone delivery insight ─────────────────────────────────────────────────
//
// Aggregated view of delivery outcomes per zone. Flags when replacement rates
// exceed acceptable thresholds so ops can act before the pattern compounds.
//
// Two thresholds:
//   ACCEPTABLE: above this, flag the zone for review — something may be wrong
//   CRITICAL:   above this, the zone likely needs an intervention (route change,
//               capacity reduction, heat block, or operational review)
//
// Rush orders and heat conditions are broken out separately because they have
// known, independent causal paths — flagging the whole zone without that
// breakdown obscures what the actual fix should be.

const MIN_DELIVERIES_FOR_ZONE_INSIGHT = 20;
const ACCEPTABLE_ZONE_REPLACEMENT_RATE = 0.15;   // flag above this
const CRITICAL_ZONE_REPLACEMENT_RATE = 0.30;     // critical above this

export type ZoneAction = "critical" | "flag" | "monitor";

export interface ZoneInsight {
  zone: string;
  total_deliveries: number;
  replacement_rate: number | null;          // null until MIN_DELIVERIES_FOR_ZONE_INSIGHT reached
  rush_replacement_rate: number | null;     // null if fewer than 5 rush deliveries with outcomes
  heat_replacement_rate: number | null;     // null if fewer than 5 warm/high_heat deliveries

  action: ZoneAction;
  action_reason: string;

  // Breakdown of what's driving replacements — helps ops know which fix to apply
  late_delivery_share: number | null;       // proportion of replacements attributed to late delivery
}

export function deriveZoneInsight(zone: string, outcomes: DeliveryOutcome[]): ZoneInsight {
  const zoneOutcomes = outcomes.filter((o) => o.zone === zone);
  const replacements = zoneOutcomes.filter((o) => o.resulted_in_replacement);

  const replacementRate = zoneOutcomes.length >= MIN_DELIVERIES_FOR_ZONE_INSIGHT
    ? replacements.length / zoneOutcomes.length
    : null;

  // Rush breakdown — separate causal path (route drift from late add-ons)
  const rushOutcomes = zoneOutcomes.filter((o) => o.was_rush);
  const rushReplacements = rushOutcomes.filter((o) => o.resulted_in_replacement);
  const rushReplacementRate = rushOutcomes.length >= 5
    ? rushReplacements.length / rushOutcomes.length
    : null;

  // Heat breakdown — separate causal path (temperature stress on vulnerable zones)
  const heatOutcomes = zoneOutcomes.filter(
    (o) => o.temperature_flag === "warm" || o.temperature_flag === "high_heat"
  );
  const heatReplacements = heatOutcomes.filter((o) => o.resulted_in_replacement);
  const heatReplacementRate = heatOutcomes.length >= 5
    ? heatReplacements.length / heatOutcomes.length
    : null;

  // Late delivery share — what proportion of replacements came from late deliveries
  const lateDeliveryReplacements = replacements.filter(
    (o) => o.replacement_reason === "late_delivery" || o.delivered_on_time === false
  );
  const lateDeliveryShare = replacements.length > 0
    ? lateDeliveryReplacements.length / replacements.length
    : null;

  // Action
  let action: ZoneAction = "monitor";
  let action_reason = "Insufficient data or replacement rate within acceptable range.";

  if (replacementRate !== null && replacementRate >= CRITICAL_ZONE_REPLACEMENT_RATE) {
    action = "critical";
    action_reason = `${Math.round(replacementRate * 100)}% replacement rate in ${zone} — above the ${Math.round(CRITICAL_ZONE_REPLACEMENT_RATE * 100)}% critical threshold. Immediate review required: check route configuration, zone capacity, and whether heat blocking should be enabled.`;
  } else if (replacementRate !== null && replacementRate >= ACCEPTABLE_ZONE_REPLACEMENT_RATE) {
    // Flag with the most informative breakdown available
    if (rushReplacementRate !== null && rushReplacementRate >= CRITICAL_ZONE_REPLACEMENT_RATE) {
      action = "flag";
      action_reason = `Overall replacement rate of ${Math.round(replacementRate * 100)}% is above acceptable. Rush orders are the primary driver at ${Math.round(rushReplacementRate * 100)}% — consider tightening same-day capacity for this zone.`;
    } else if (heatReplacementRate !== null && heatReplacementRate >= CRITICAL_ZONE_REPLACEMENT_RATE) {
      action = "flag";
      action_reason = `Overall replacement rate of ${Math.round(replacementRate * 100)}% is above acceptable. Heat conditions are the primary driver at ${Math.round(heatReplacementRate * 100)}% — consider enabling heat blocking for this zone.`;
    } else {
      action = "flag";
      action_reason = `${Math.round(replacementRate * 100)}% replacement rate in ${zone} is above the ${Math.round(ACCEPTABLE_ZONE_REPLACEMENT_RATE * 100)}% acceptable threshold. Review route configuration and delivery timing for this zone.`;
    }
  }

  return {
    zone,
    total_deliveries: zoneOutcomes.length,
    replacement_rate: replacementRate,
    rush_replacement_rate: rushReplacementRate,
    heat_replacement_rate: heatReplacementRate,
    action,
    action_reason,
    late_delivery_share: lateDeliveryShare,
  };
}

export function deriveAllZoneInsights(outcomes: DeliveryOutcome[]): ZoneInsight[] {
  const zones = [...new Set(outcomes.map((o) => o.zone))];
  return zones.map((z) => deriveZoneInsight(z, outcomes));
}

export function deriveZonesRequiringAction(outcomes: DeliveryOutcome[]): ZoneInsight[] {
  return deriveAllZoneInsights(outcomes).filter((z) => z.action !== "monitor");
}

// ─── Insight derivation ────────────────────────────────────────────────────
//
// Given a set of acknowledgements and decisions for a rule + SKU,
// derives the current insight and suggested action.
// Thresholds are conservative — we require meaningful sample sizes
// before suggesting rule changes.

const MIN_SAMPLE_FOR_INSIGHT = 20;
const HIGH_REPLACEMENT_RATE = 0.35;   // above this → escalate to block
const LOW_REPLACEMENT_RATE = 0.05;    // below this → consider removing friction
const HIGH_APPROVAL_RATE = 0.90;      // above this → downgrade review to friction
const LOW_APPROVAL_RATE = 0.20;       // below this → escalate review to block

// ─── Sales rep accountability ──────────────────────────────────────────────
//
// Tracks friction override behaviour per sales rep. Not punitive — the goal is
// to make the pattern visible so it can be discussed, not to create a gotcha.
//
// A rep who consistently overrides friction warnings that result in replacements
// is either working with stale customer data, missing the talking point, or
// selling past concerns they should be surfacing. The insight flags this once
// enough data exists, without attaching it to compensation.

// How many overrides with recorded outcomes before we draw any conclusions.
const MIN_OVERRIDES_FOR_REP_INSIGHT = 10;

// If this proportion of a rep's overrides result in replacements, flag it.
const REP_REPLACEMENT_THRESHOLD = 0.30;

export interface SalesRepOverride {
  rep_id: string;
  order_id: string;
  customer_id: string;
  concern_code: string;
  flagged_sku: string;
  overridden_at: string;          // ISO timestamp
  rep_note: string | null;        // what the rep recorded when proceeding
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
}

export interface SalesRepInsight {
  rep_id: string;
  total_overrides: number;
  overrides_with_outcome: number;
  replacement_rate: number | null;  // null until MIN_OVERRIDES_FOR_REP_INSIGHT reached
  at_threshold: boolean;
  threshold_note: string | null;    // human-readable summary if at_threshold

  // Which concern codes this rep overrides most often
  top_concern_codes: string[];
}

export function deriveSalesRepInsight(
  rep_id: string,
  overrides: SalesRepOverride[]
): SalesRepInsight {
  const repOverrides = overrides.filter((o) => o.rep_id === rep_id);
  const withOutcome = repOverrides.filter((o) => o.resulted_in_replacement !== null);
  const withReplacement = withOutcome.filter((o) => o.resulted_in_replacement === true);

  const replacementRate = withOutcome.length >= MIN_OVERRIDES_FOR_REP_INSIGHT
    ? withReplacement.length / withOutcome.length
    : null;

  const atThreshold = replacementRate !== null && replacementRate >= REP_REPLACEMENT_THRESHOLD;

  // Top concern codes by frequency
  const codeCounts: Record<string, number> = {};
  for (const o of repOverrides) {
    codeCounts[o.concern_code] = (codeCounts[o.concern_code] ?? 0) + 1;
  }
  const topConcernCodes = Object.entries(codeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code);

  return {
    rep_id,
    total_overrides: repOverrides.length,
    overrides_with_outcome: withOutcome.length,
    replacement_rate: replacementRate,
    at_threshold: atThreshold,
    threshold_note: atThreshold
      ? `${Math.round(replacementRate! * 100)}% of this rep's overrides resulted in a replacement (threshold: ${Math.round(REP_REPLACEMENT_THRESHOLD * 100)}%). Worth a conversation — most likely a data accuracy issue or a talking-point gap, not intentional.`
      : null,
    top_concern_codes: topConcernCodes,
  };
}

export function deriveSalesRepInsights(overrides: SalesRepOverride[]): SalesRepInsight[] {
  const repIds = [...new Set(overrides.map((o) => o.rep_id))];
  return repIds.map((id) => deriveSalesRepInsight(id, overrides));
}

export function deriveSalesRepsAtThreshold(overrides: SalesRepOverride[]): SalesRepInsight[] {
  return deriveSalesRepInsights(overrides).filter((i) => i.at_threshold);
}

// ─── Delivery window override ──────────────────────────────────────────────
//
// Written when a rep overrides a capacity block on a same-day delivery.
// Heat blocks cannot be overridden — only capacity blocks generate this record.
//
// The checklist_answers field captures the customer context the rep assessed
// before overriding. Over time, answers to specific questions (e.g.
// customer_available, backup_aeration) start correlating with outcomes —
// revealing which customer conditions actually predict successful delivery
// and which don't.

export interface DeliveryWindowOverride {
  // Identity
  rep_id: string;
  order_id: string;
  customer_id: string;
  zone: string;

  // What was blocked and why
  block_reason: "capacity";       // heat blocks are not overridable — only capacity
  delivery_date: string;          // ISO date, YYYY-MM-DD
  stop_count_at_override: number; // how full the route was when rep overrode
  overridden_at: string;          // ISO timestamp

  // Checklist answers — keyed by DeliveryChecklistItem.id
  // boolean answers = yes/no questions; string = free text; null = skipped
  checklist_answers: Record<string, boolean | string | null>;
  rep_note: string | null;        // free text — anything the rep wants to flag

  // Outcome — filled after delivery
  resulted_in_replacement: boolean | null;
  outcome_recorded_at: string | null;
  outcome_notes: string | null;
}

// ─── Delivery override insight ─────────────────────────────────────────────
//
// Aggregated view of delivery window overrides per zone.
// The checklist correlations are the valuable output — they tell ops which
// customer conditions actually predict safe delivery so the checklist can
// be tightened or relaxed over time.

const MIN_DELIVERY_OVERRIDES_FOR_INSIGHT = 10;

export interface ChecklistCorrelation {
  question_id: string;
  answer: boolean | string;
  override_count: number;          // how many overrides had this answer
  replacement_rate: number;        // replacement rate for overrides with this answer
}

export interface DeliveryOverrideInsight {
  zone: string;
  total_overrides: number;
  overrides_with_outcome: number;
  replacement_rate: number | null;   // null until MIN_DELIVERY_OVERRIDES_FOR_INSIGHT reached

  // Which checklist answers correlate with replacement vs success
  // Only populated once per-answer sample sizes are meaningful
  checklist_correlations: ChecklistCorrelation[];

  // Rep-level breakdown — same pattern as SalesRepInsight but for delivery overrides
  rep_breakdown: Array<{
    rep_id: string;
    override_count: number;
    replacement_rate: number | null;
  }>;

  suggested_action: "tighten_checklist" | "add_required_answer" | "monitor" | "loosen";
  suggested_action_reason: string;
}

export function deriveDeliveryOverrideInsight(
  zone: string,
  overrides: DeliveryWindowOverride[]
): DeliveryOverrideInsight {
  const zoneOverrides = overrides.filter((o) => o.zone === zone);
  const withOutcome = zoneOverrides.filter((o) => o.resulted_in_replacement !== null);
  const replacements = withOutcome.filter((o) => o.resulted_in_replacement === true);

  const replacementRate = withOutcome.length >= MIN_DELIVERY_OVERRIDES_FOR_INSIGHT
    ? replacements.length / withOutcome.length
    : null;

  // Build checklist correlations — for each question and each distinct answer,
  // compute the replacement rate among overrides that had that answer + an outcome.
  const correlations: ChecklistCorrelation[] = [];
  const questionIds = new Set(
    withOutcome.flatMap((o) => Object.keys(o.checklist_answers))
  );
  for (const qid of questionIds) {
    const byAnswer = new Map<string, { total: number; replacements: number }>();
    for (const o of withOutcome) {
      const raw = o.checklist_answers[qid];
      if (raw === null || raw === undefined) continue;
      const key = String(raw);
      const bucket = byAnswer.get(key) ?? { total: 0, replacements: 0 };
      bucket.total += 1;
      if (o.resulted_in_replacement) bucket.replacements += 1;
      byAnswer.set(key, bucket);
    }
    for (const [answer, { total, replacements: reps }] of byAnswer) {
      if (total < 5) continue;  // not enough data for this answer to be meaningful
      correlations.push({
        question_id: qid,
        answer: answer === "true" ? true : answer === "false" ? false : answer,
        override_count: total,
        replacement_rate: reps / total,
      });
    }
  }

  // Rep breakdown
  const repIds = [...new Set(zoneOverrides.map((o) => o.rep_id))];
  const rep_breakdown = repIds.map((rep_id) => {
    const repWithOutcome = withOutcome.filter((o) => o.rep_id === rep_id);
    const repReplacements = repWithOutcome.filter((o) => o.resulted_in_replacement);
    return {
      rep_id,
      override_count: zoneOverrides.filter((o) => o.rep_id === rep_id).length,
      replacement_rate: repWithOutcome.length >= 5
        ? repReplacements.length / repWithOutcome.length
        : null,
    };
  });

  // Suggested action
  let suggested_action: DeliveryOverrideInsight["suggested_action"] = "monitor";
  let suggested_action_reason = "Insufficient data to make a recommendation yet.";

  if (replacementRate !== null) {
    // Find the strongest differentiating correlation — an answer that strongly
    // predicts replacement vs success
    const highRiskCorrelations = correlations.filter((c) => c.replacement_rate >= 0.5 && c.override_count >= 5);
    const lowRiskCorrelations = correlations.filter((c) => c.replacement_rate <= 0.1 && c.override_count >= 5);

    if (replacementRate >= 0.4) {
      suggested_action = "tighten_checklist";
      suggested_action_reason = `${Math.round(replacementRate * 100)}% of overrides in ${zone} resulted in replacements — overrides are not reliably selecting good outcomes. Consider tightening the checklist or raising the bar for overriding.`;
    } else if (highRiskCorrelations.length > 0) {
      const worst = highRiskCorrelations.sort((a, b) => b.replacement_rate - a.replacement_rate)[0];
      suggested_action = "add_required_answer";
      suggested_action_reason = `Overrides where "${worst.question_id}" = ${worst.answer} have a ${Math.round(worst.replacement_rate * 100)}% replacement rate (n=${worst.override_count}). Consider making the opposite answer a hard requirement before override.`;
    } else if (replacementRate <= 0.1) {
      suggested_action = "loosen";
      suggested_action_reason = `Only ${Math.round(replacementRate * 100)}% replacement rate on overrides — reps are selecting well. The checklist may be more conservative than the data warrants.`;
    } else {
      suggested_action = "monitor";
      suggested_action_reason = `${Math.round(replacementRate * 100)}% replacement rate on overrides — within acceptable range but worth watching. No clear checklist signal yet.`;
    }
  }

  return {
    zone,
    total_overrides: zoneOverrides.length,
    overrides_with_outcome: withOutcome.length,
    replacement_rate: replacementRate,
    checklist_correlations: correlations,
    rep_breakdown,
    suggested_action,
    suggested_action_reason,
  };
}

export function deriveRuleInsight(params: {
  rule: string;
  flagged_sku: string | null;
  acknowledgements: FrictionAcknowledgement[];
  decisions: ReviewDecision[];
}): RuleInsight {
  const { rule, flagged_sku, acknowledgements, decisions } = params;

  // Friction stats
  const withOutcome = acknowledgements.filter((a) => a.resulted_in_replacement !== null);
  const replacements = withOutcome.filter((a) => a.resulted_in_replacement === true);
  const frictionReplacementRate = withOutcome.length >= MIN_SAMPLE_FOR_INSIGHT
    ? replacements.length / withOutcome.length
    : null;

  // Review stats
  const withDecision = decisions.filter((d) => d.outcome !== undefined);
  const approvals = decisions.filter((d) => d.outcome === "approved" || d.outcome === "approved_with_conditions");
  const rejections = decisions.filter((d) => d.outcome === "rejected");
  const reviewApprovalRate = withDecision.length >= MIN_SAMPLE_FOR_INSIGHT
    ? approvals.length / withDecision.length
    : null;
  const reviewRejectionRate = withDecision.length >= MIN_SAMPLE_FOR_INSIGHT
    ? rejections.length / withDecision.length
    : null;

  // Suggested action
  let suggested_action: SuggestedRuleAction = "monitor";
  let suggested_action_reason = "Insufficient data to make a recommendation yet.";

  if (frictionReplacementRate !== null && frictionReplacementRate >= HIGH_REPLACEMENT_RATE) {
    suggested_action = "escalate_to_block";
    suggested_action_reason = `${Math.round(frictionReplacementRate * 100)}% of acknowledged orders resulted in a replacement — customers are proceeding despite the warning and losing livestock. Consider making this a hard block.`;
  } else if (frictionReplacementRate !== null && frictionReplacementRate <= LOW_REPLACEMENT_RATE) {
    suggested_action = "remove";
    suggested_action_reason = `Only ${Math.round(frictionReplacementRate * 100)}% of acknowledged orders resulted in a replacement. The warning may be generating friction without protecting outcomes. Consider removing it.`;
  } else if (reviewApprovalRate !== null && reviewApprovalRate >= HIGH_APPROVAL_RATE) {
    suggested_action = "escalate_to_friction";
    suggested_action_reason = `${Math.round(reviewApprovalRate * 100)}% of review holds are approved. The review is adding delay without adding value. Consider downgrading to a friction gate the customer can acknowledge directly.`;
  } else if (reviewRejectionRate !== null && reviewRejectionRate >= (1 - LOW_APPROVAL_RATE)) {
    suggested_action = "escalate_to_block";
    suggested_action_reason = `${Math.round((reviewRejectionRate ?? 0) * 100)}% of review holds are rejected. The reviewer is almost always saying no — this should be a hard block.`;
  } else if (
    (frictionReplacementRate !== null && frictionReplacementRate > LOW_REPLACEMENT_RATE && frictionReplacementRate < HIGH_REPLACEMENT_RATE)
  ) {
    suggested_action = "downgrade_to_review";
    suggested_action_reason = `Replacement rate of ${Math.round(frictionReplacementRate * 100)}% is meaningful but not high enough to block. Consider routing to review rather than letting customers self-acknowledge.`;
  }

  return {
    rule,
    flagged_sku,
    friction_acknowledgement_count: acknowledgements.length,
    friction_replacement_rate: frictionReplacementRate,
    review_decision_count: decisions.length,
    review_approval_rate: reviewApprovalRate,
    review_rejection_rate: reviewRejectionRate,
    common_approval_context: [],   // populated in production from reviewer_notes analysis
    common_rejection_context: [],
    suggested_action,
    suggested_action_reason,
  };
}
